import type { AiStatus, ChatEvent, VoiceLanguage } from "../types/assistant";

export const BACKEND_URL = "http://127.0.0.1:8765";

export async function getAiStatus(signal?: AbortSignal): Promise<AiStatus> {
  const response = await fetch(`${BACKEND_URL}/ai/status`, { signal });
  if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
  return (await response.json()) as AiStatus;
}

export async function chooseModel(name: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/ai/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`Could not switch to ${name}`);
}

export async function clearHistory(): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/chat/history`, { method: "DELETE" });
  if (!response.ok) throw new Error("Could not clear the conversation");
}

async function explainFailure(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/** Loads the speech models ahead of time. Problems show up on first use instead. */
export function prepareSpeech(): void {
  fetch(`${BACKEND_URL}/speech/prepare`, { method: "POST" }).catch(() => {});
}

/** Turns recorded speech into text. Returns "" when no words were found. */
export async function transcribeSpeech(audio: Blob, language: VoiceLanguage): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/speech/transcribe?language=${language}`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: audio,
  });
  if (!response.ok) throw new Error(await explainFailure(response, "Speech recognition failed."));
  return ((await response.json()) as { text: string }).text;
}

/** Turns one sentence into WAV audio. */
export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const response = await fetch(`${BACKEND_URL}/speech/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(await explainFailure(response, "Speech output failed."));
  return response.arrayBuffer();
}

/** Sends a message and calls `onEvent` as each piece of the reply arrives. */
export async function streamChat(message: string, signal: AbortSignal, onEvent: (event: ChatEvent) => void): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(response.status === 409 ? "JARVIS is still replying." : `The backend answered with status ${response.status}.`);
  }

  // Each line of the stream is one JSON event.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as ChatEvent);
    }
  }
}
