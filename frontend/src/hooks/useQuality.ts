import { useCallback, useState } from "react";
import type { AnimationQuality, VoiceLanguage } from "../types/assistant";

const STORAGE_KEY = "jarvis.animationQuality";
const VOICE_KEY = "jarvis.voiceLanguage";

function initialQuality(): AnimationQuality {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "high" || saved === "medium" || saved === "low") return saved;
  // Respect the Windows "reduce animations" setting.
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "low" : "medium";
}

/** Starts on English, so nothing goes online until the user chooses it. */
export function useVoiceLanguage(): [VoiceLanguage, (language: VoiceLanguage) => void] {
  const [language, setLanguageState] = useState<VoiceLanguage>(() =>
    window.localStorage.getItem(VOICE_KEY) === "sinhala" ? "sinhala" : "english",
  );

  const setLanguage = useCallback((next: VoiceLanguage) => {
    window.localStorage.setItem(VOICE_KEY, next);
    setLanguageState(next);
  }, []);

  return [language, setLanguage];
}

export function useQuality(): [AnimationQuality, (quality: AnimationQuality) => void] {
  const [quality, setQualityState] = useState(initialQuality);

  const setQuality = useCallback((next: AnimationQuality) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setQualityState(next);
  }, []);

  return [quality, setQuality];
}
