import type { AiConnection } from "../hooks/useAiStatus";
import type { AssistantState, MicStatus } from "../types/assistant";

/**
 * Chooses the state the face shows. A preview picked by the user wins, then
 * problems, then speaking, then the AI at work, then real microphone use.
 * The agent adds a real executing signal here in Milestone 4.
 */
export function deriveAssistantState(
  preview: AssistantState | null,
  mic: MicStatus,
  chat: { busy: boolean; failed: boolean; speaking?: boolean } = { busy: false, failed: false },
): AssistantState {
  if (preview) return preview;
  if (chat.failed || mic === "denied" || mic === "unavailable") return "error";
  if (chat.speaking) return "speaking";
  if (chat.busy) return "thinking";
  if (mic === "on") return "listening";
  return "idle";
}

/** Explains why chat cannot be used, or returns null when it can. */
export function chatBlockedReason(ai: AiConnection): string | null {
  if (!ai.checked) return "Connecting to the AI backend.";
  if (!ai.backendOnline || !ai.status) return "The AI backend is offline. Close JARVIS and open it again.";
  if (!ai.status.ollamaFound) return "Ollama is not installed. See the README for the install steps.";
  if (!ai.status.ollamaRunning) return "Ollama is starting. This can take a moment.";
  if (ai.status.models.length === 0) return `No AI model is installed yet. Run: ollama pull ${ai.status.activeModel}`;
  if (!ai.status.modelInstalled) return "The chosen model is not installed. Pick another one under Status.";
  return null;
}

/** Fake voice loudness for the Speaking preview, until real speech exists. */
export function sampleSpeechLevel(seconds: number): number {
  const syllables = Math.abs(Math.sin(seconds * 9));
  const words = 0.4 + 0.6 * Math.abs(Math.sin(seconds * 2.3));
  const pause = Math.sin(seconds * 0.9) > -0.7 ? 1 : 0;
  return syllables * words * pause;
}

export function micLabel(mic: MicStatus): string {
  const labels: Record<MicStatus, string> = {
    off: "Off",
    requesting: "Requesting access",
    on: "On",
    denied: "Access denied",
    unavailable: "No microphone found",
  };
  return labels[mic];
}
