import type { AnimationQuality, AssistantState } from "../types/assistant";

export interface StateVisual {
  label: string;
  caption: string;
  /** Hex colours of the hologram: main light and bright highlight. */
  primary: string;
  accent: string;
  /** How much the head sways, 0 to 1. */
  motion: number;
  /** How strongly the surface shimmers, 0 to 1. */
  shimmer: number;
  /** How fast the rings around the head spin. */
  ringSpeed: number;
  /** How far the eyes open, 0 to 1. */
  eyeOpen: number;
}

export const STATE_VISUALS: Record<AssistantState, StateVisual> = {
  idle: {
    label: "Idle",
    caption: "Standing by",
    primary: "#1fb6ff",
    accent: "#a8f0ff",
    motion: 0.35,
    shimmer: 0.2,
    ringSpeed: 0.12,
    eyeOpen: 0.85,
  },
  listening: {
    label: "Listening",
    caption: "Listening to the microphone",
    primary: "#22e6d0",
    accent: "#c9fff4",
    motion: 0.25,
    shimmer: 0.45,
    ringSpeed: 0.25,
    eyeOpen: 1,
  },
  thinking: {
    label: "Thinking",
    caption: "Processing",
    primary: "#6d7bff",
    accent: "#c6ccff",
    motion: 0.55,
    shimmer: 0.9,
    ringSpeed: 1.1,
    eyeOpen: 0.6,
  },
  speaking: {
    label: "Speaking",
    caption: "Speaking",
    primary: "#38c8ff",
    accent: "#e0f8ff",
    motion: 0.45,
    shimmer: 0.5,
    ringSpeed: 0.35,
    eyeOpen: 0.9,
  },
  executing: {
    label: "Executing",
    caption: "Running a task",
    primary: "#ffb627",
    accent: "#ffe6ad",
    motion: 0.2,
    shimmer: 0.7,
    ringSpeed: 0.8,
    eyeOpen: 0.9,
  },
  error: {
    label: "Error",
    caption: "Something went wrong",
    primary: "#ff3f5e",
    accent: "#ffc2cc",
    motion: 0.1,
    shimmer: 0.35,
    ringSpeed: 0.06,
    eyeOpen: 0.55,
  },
};

export interface QualityProfile {
  label: string;
  /** Columns of the head mesh. */
  headDetail: number;
  /** Size in pixels of the circuit texture. */
  textureSize: number;
  /** Glowing wires behind the head and flowing out of the neck. */
  wireArcs: number;
  neckStrands: number;
  /** Bars around the audio ring. */
  ringBars: number;
  maxPixelRatio: number;
  frameRate: number;
  particles: number;
}

/**
 * Low keeps the app usable when Ollama and speech models need the CPU.
 * Frame rates divide a 60 Hz screen evenly, so they match what is drawn.
 */
export const QUALITY_PROFILES: Record<AnimationQuality, QualityProfile> = {
  high: { label: "High", headDetail: 420, textureSize: 2048, wireArcs: 150, neckStrands: 70, ringBars: 96, maxPixelRatio: 1.5, frameRate: 60, particles: 240 },
  medium: { label: "Medium", headDetail: 300, textureSize: 1536, wireArcs: 90, neckStrands: 44, ringBars: 72, maxPixelRatio: 1.25, frameRate: 30, particles: 120 },
  low: { label: "Low", headDetail: 180, textureSize: 1024, wireArcs: 36, neckStrands: 20, ringBars: 48, maxPixelRatio: 1, frameRate: 20, particles: 0 },
};

/** Moves `current` toward `target` at the same speed on any frame rate. */
export function damp(current: number, target: number, speed: number, seconds: number): number {
  return target + (current - target) * Math.exp(-speed * seconds);
}
