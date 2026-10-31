import { useCallback, useEffect, useRef, useState } from "react";
import { prepareSpeech, transcribeSpeech } from "../services/backend";
import { INTERRUPTING, LISTENING, LevelWindow, UtteranceDetector, encodeWav } from "../services/voice";
import type { Chat } from "./useChat";
import type { Microphone } from "./useMicrophone";
import type { Speaker } from "./useSpeaker";
import type { VoiceLanguage } from "../types/assistant";

/** Audio kept from just before speech is noticed, so first words aren't cut off. */
const LEAD_IN_MS = 500;

export interface Voice {
  /** True while spoken words are being turned into text. */
  transcribing: boolean;
  problem: string | null;
  dismissProblem: () => void;
}

/** Runs the voice loop: hear a sentence, turn it into text, send it to the AI. */
export function useVoice(mic: Microphone, chat: Chat, speaker: Speaker, ready: boolean, language: VoiceLanguage): Voice {
  const [transcribing, setTranscribing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The audio thread calls in many times a second, so it reads the latest values here.
  const latest = useRef({ chat, speaker, ready, transcribing, language, sampleRate: mic.sampleRate });
  latest.current = { chat, speaker, ready, transcribing, language, sampleRate: mic.sampleRate };

  const detector = useRef(new UtteranceDetector(LISTENING));
  const levelWindow = useRef(new LevelWindow());
  const leadIn = useRef<Float32Array[]>([]);
  const recording = useRef<Float32Array[] | null>(null);
  const clock = useRef(0);

  const submit = useCallback(async (chunks: Float32Array[]) => {
    const { sampleRate } = latest.current;
    setTranscribing(true);
    try {
      const text = await transcribeSpeech(encodeWav(chunks, sampleRate), latest.current.language);
      if (text) await latest.current.chat.send(text);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "JARVIS could not hear that.");
    } finally {
      setTranscribing(false);
    }
  }, []);

  const handleSamples = useCallback(
    (samples: Float32Array) => {
      const { chat: currentChat, speaker: currentSpeaker, ready: isReady, transcribing: isBusy, sampleRate } = latest.current;
      const chunkMs = (samples.length / sampleRate) * 1000;
      clock.current += chunkMs;

      const lead = leadIn.current;
      lead.push(samples);
      while (lead.length * chunkMs > LEAD_IN_MS) lead.shift();

      if (recording.current) recording.current.push(samples);

      const level = levelWindow.current.push(samples, sampleRate);
      if (level === null) return;

      // Words can't be sent while a reply is being written, unless they interrupt it.
      if (!isReady || isBusy) return;
      const canInterrupt = currentSpeaker.speaking;
      if (currentChat.busy && !canInterrupt) return;
      const options = canInterrupt ? INTERRUPTING : LISTENING;
      if (detector.current.options !== options && !detector.current.speaking) detector.current.options = options;

      const event = detector.current.update(level, clock.current);
      if (event === "start") {
        if (canInterrupt) {
          currentSpeaker.stop();
          currentChat.stop();
        }
        recording.current = [...lead];
      } else if (event === "discard") {
        recording.current = null;
      } else if (event === "end" && recording.current) {
        const chunks = recording.current;
        recording.current = null;
        void submit(chunks);
      }
    },
    [submit],
  );

  useEffect(() => {
    if (mic.status !== "on") {
      detector.current.reset();
      recording.current = null;
      leadIn.current = [];
      return;
    }
    prepareSpeech();
    mic.setListener(handleSamples);
    return () => mic.setListener(null);
  }, [mic.status, mic.setListener, handleSamples]);

  const dismissProblem = useCallback(() => setProblem(null), []);

  return { transcribing, problem, dismissProblem };
}
