import { useCallback, useEffect, useRef, useState } from "react";
import type { MicStatus } from "../types/assistant";

interface MicHandles {
  stream: MediaStream;
  context: AudioContext;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
}

export interface Microphone {
  status: MicStatus;
  sampleRate: number;
  start: () => Promise<void>;
  stop: () => void;
  /** Current loudness from 0 to 1. Cheap enough to call on every frame. */
  readLevel: () => number;
  /** Sets who receives raw audio chunks while the microphone is on. */
  setListener: (listener: ((samples: Float32Array) => void) | null) => void;
}

export function useMicrophone(): Microphone {
  const [status, setStatus] = useState<MicStatus>("off");
  const [sampleRate, setSampleRate] = useState(48000);
  const handles = useRef<MicHandles | null>(null);
  const listener = useRef<((samples: Float32Array) => void) | null>(null);
  // Stops a slow permission prompt from turning the mic on after it was cancelled.
  const requestId = useRef(0);

  const release = useCallback(() => {
    const current = handles.current;
    handles.current = null;
    if (!current) return;
    current.stream.getTracks().forEach((track) => track.stop());
    void current.context.close();
  }, []);

  const stop = useCallback(() => {
    requestId.current += 1;
    release();
    setStatus("off");
  }, [release]);

  const start = useCallback(async () => {
    const id = ++requestId.current;
    release();

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }

    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (id !== requestId.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      await context.audioWorklet.addModule("/pcm-capture.js");
      const capture = new AudioWorkletNode(context, "pcm-capture", { numberOfOutputs: 0 });
      capture.port.onmessage = (event: MessageEvent<Float32Array>) => listener.current?.(event.data);
      source.connect(capture);

      if (id !== requestId.current) {
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
        return;
      }
      handles.current = { stream, context, analyser, samples: new Float32Array(analyser.fftSize) };
      setSampleRate(context.sampleRate);
      setStatus("on");
    } catch (error) {
      if (id !== requestId.current) return;
      const name = error instanceof DOMException ? error.name : "";
      console.error("Microphone failed", error);
      setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }, [release]);

  const readLevel = useCallback(() => {
    const current = handles.current;
    if (!current) return 0;
    current.analyser.getFloatTimeDomainData(current.samples);
    let sum = 0;
    for (const sample of current.samples) sum += sample * sample;
    const loudness = Math.sqrt(sum / current.samples.length);
    // Speech is quiet in raw numbers, so boost it into a visible range.
    return Math.min(1, Math.pow(loudness * 7, 0.75));
  }, []);

  const setListener = useCallback((next: ((samples: Float32Array) => void) | null) => {
    listener.current = next;
  }, []);

  useEffect(() => () => {
    requestId.current += 1;
    release();
  }, [release]);

  return { status, sampleRate, start, stop, readLevel, setListener };
}
