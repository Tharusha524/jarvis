export const ASSISTANT_STATES = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "executing",
  "error",
] as const;

export type AssistantState = (typeof ASSISTANT_STATES)[number];

export type AnimationQuality = "high" | "medium" | "low";

/** Sinhala listening is online. English listening stays on this computer. */
export type VoiceLanguage = "english" | "sinhala";

export type MicStatus = "off" | "requesting" | "on" | "denied" | "unavailable";

/** Numbers come from the Rust side (src-tauri/src/lib.rs). */
export interface SystemSnapshot {
  cpuPercent: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  diskFreeGb: number;
  diskTotalGb: number;
  diskName: string;
}

/** Comes from the Python backend (backend/app/main.py). */
export interface AiStatus {
  ollamaRunning: boolean;
  ollamaFound: boolean;
  version: string | null;
  models: string[];
  activeModel: string;
  modelInstalled: boolean;
}

export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "done"; language: string; seconds: number; tokensPerSecond: number }
  | { type: "error"; code: string; message: string };

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Speed of the finished reply, shown under it. */
  note?: string;
}

/** "unknown" means this build cannot check, for example in a plain browser. */
export type ConnectionStatus = "online" | "offline" | "unknown";
