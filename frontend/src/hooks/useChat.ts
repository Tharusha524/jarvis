import { useCallback, useEffect, useRef, useState } from "react";
import { clearHistory, streamChat } from "../services/backend";
import { SentenceSplitter } from "../services/voice";
import type { ChatEvent, ChatMessage } from "../types/assistant";

export interface Chat {
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => Promise<void>;
  dismissError: () => void;
}

/** `onSentence` receives each finished sentence, so it can be spoken aloud. */
export function useChat(onSentence?: (sentence: string) => void): Chat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const sentenceListener = useRef(onSentence);
  sentenceListener.current = onSentence;

  const send = useCallback(async (text: string) => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    const replyId = nextId.current + 1;
    nextId.current += 2;
    const splitter = new SentenceSplitter();

    setError(null);
    setBusy(true);
    setMessages((current) => [
      ...current,
      { id: replyId - 1, role: "user", text },
      { id: replyId, role: "assistant", text: "" },
    ]);

    const updateReply = (change: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) => current.map((message) => (message.id === replyId ? change(message) : message)));
    };

    const handleEvent = (event: ChatEvent) => {
      if (event.type === "token") {
        updateReply((message) => ({ ...message, text: message.text + event.text }));
        splitter.push(event.text).forEach((sentence) => sentenceListener.current?.(sentence));
      } else if (event.type === "done") {
        splitter.flush().forEach((sentence) => sentenceListener.current?.(sentence));
        const speed = event.tokensPerSecond > 0 ? ` · ${event.tokensPerSecond.toFixed(1)} tokens/s` : "";
        updateReply((message) => ({ ...message, note: `${event.seconds}s${speed}` }));
      } else {
        setError(event.message);
      }
    };

    try {
      await streamChat(text, request.signal, handleEvent);
    } catch (problem) {
      if (!request.signal.aborted) {
        console.warn("Chat failed", problem);
        setError(problem instanceof Error && problem.message !== "Failed to fetch" ? problem.message : "The AI backend is offline.");
      }
    } finally {
      controller.current = null;
      setBusy(false);
      // An empty bubble helps nobody when no reply arrived.
      setMessages((current) => current.filter((message) => message.id !== replyId || message.text));
    }
  }, []);

  const stop = useCallback(() => controller.current?.abort(), []);

  const clear = useCallback(async () => {
    try {
      await clearHistory();
      setMessages([]);
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not clear the conversation.");
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  useEffect(() => () => controller.current?.abort(), []);

  return { messages, busy, error, send, stop, clear, dismissError };
}
