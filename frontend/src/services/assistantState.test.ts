import { describe, expect, it } from "vitest";
import { chatBlockedReason, deriveAssistantState, micLabel, sampleSpeechLevel } from "./assistantState";
import type { AiStatus } from "../types/assistant";

describe("deriveAssistantState", () => {
  it("is idle when nothing is happening", () => {
    expect(deriveAssistantState(null, "off")).toBe("idle");
  });

  it("listens while the microphone is on", () => {
    expect(deriveAssistantState(null, "on")).toBe("listening");
  });

  it("shows an error when the microphone cannot be used", () => {
    expect(deriveAssistantState(null, "denied")).toBe("error");
    expect(deriveAssistantState(null, "unavailable")).toBe("error");
  });

  it("lets a preview override everything", () => {
    expect(deriveAssistantState("thinking", "on")).toBe("thinking");
    expect(deriveAssistantState("executing", "denied")).toBe("executing");
  });
});

describe("deriveAssistantState with chat", () => {
  it("thinks while a reply is being written", () => {
    expect(deriveAssistantState(null, "on", { busy: true, failed: false })).toBe("thinking");
  });

  it("shows an error when chat failed", () => {
    expect(deriveAssistantState(null, "off", { busy: false, failed: true })).toBe("error");
  });
});

describe("chatBlockedReason", () => {
  const ready: AiStatus = {
    ollamaRunning: true,
    ollamaFound: true,
    version: "1",
    models: ["gemma3:4b"],
    activeModel: "gemma3:4b",
    modelInstalled: true,
  };
  const connection = (status: AiStatus | null, backendOnline = true) => ({
    status,
    backendOnline,
    checked: true,
    refresh: async () => {},
  });

  it("allows chat when everything is ready", () => {
    expect(chatBlockedReason(connection(ready))).toBeNull();
  });

  it("explains each problem", () => {
    expect(chatBlockedReason(connection(null, false))).toContain("offline");
    expect(chatBlockedReason(connection({ ...ready, ollamaFound: false, ollamaRunning: false }))).toContain("not installed");
    expect(chatBlockedReason(connection({ ...ready, ollamaRunning: false }))).toContain("starting");
    expect(chatBlockedReason(connection({ ...ready, models: [], modelInstalled: false }))).toContain("ollama pull gemma3:4b");
    expect(chatBlockedReason(connection({ ...ready, modelInstalled: false }))).toContain("Pick another");
  });
});

describe("sampleSpeechLevel", () => {
  it("stays between 0 and 1", () => {
    for (let seconds = 0; seconds < 30; seconds += 0.13) {
      const level = sampleSpeechLevel(seconds);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });
});

describe("micLabel", () => {
  it("explains a denied microphone", () => {
    expect(micLabel("denied")).toBe("Access denied");
  });
});
