import { useCallback, useEffect, useRef, useState } from "react";
import { synthesizeSpeech } from "../services/backend";

export interface Speaker {
  speaking: boolean;
  /** Adds one sentence to what JARVIS is saying. */
  say: (sentence: string) => void;
  /** Stops talking at once and forgets the rest. */
  stop: () => void;
  /** Loudness of the voice from 0 to 1, for the face and the audio ring. */
  readLevel: () => number;
}

interface QueuedSentence {
  /** Synthesis starts right away, so the next sentence is ready in time. */
  audio: Promise<ArrayBuffer>;
}

export function useSpeaker(onProblem: (message: string) => void): Speaker {
  const [speaking, setSpeaking] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const samples = useRef(new Float32Array(1024));
  const source = useRef<AudioBufferSourceNode | null>(null);
  const queue = useRef<QueuedSentence[]>([]);
  const playing = useRef(false);
  const session = useRef(0);
  const problem = useRef(onProblem);
  problem.current = onProblem;

  const ensureOutput = useCallback(() => {
    if (!context.current) {
      context.current = new AudioContext();
      analyser.current = context.current.createAnalyser();
      analyser.current.fftSize = 1024;
      analyser.current.connect(context.current.destination);
    }
    return context.current;
  }, []);

  const playQueue = useCallback(async () => {
    if (playing.current) return;
    playing.current = true;
    setSpeaking(true);
    const current = session.current;
    const output = ensureOutput();

    try {
      await output.resume();
      while (queue.current.length > 0 && current === session.current) {
        const next = queue.current.shift();
        if (!next) break;
        const decoded = await output.decodeAudioData(await next.audio);
        if (current !== session.current) break;

        await new Promise<void>((resolve) => {
          const node = output.createBufferSource();
          node.buffer = decoded;
          node.connect(analyser.current as AnalyserNode);
          node.onended = () => resolve();
          source.current = node;
          node.start();
        });
        source.current = null;
      }
    } catch (error) {
      if (current === session.current) {
        problem.current(error instanceof Error ? error.message : "JARVIS could not speak.");
        queue.current = [];
      }
    } finally {
      playing.current = false;
      if (current === session.current) setSpeaking(false);
    }
  }, [ensureOutput]);

  const say = useCallback(
    (sentence: string) => {
      queue.current.push({ audio: synthesizeSpeech(sentence) });
      // A failed sentence is reported when its turn to play comes.
      queue.current[queue.current.length - 1].audio.catch(() => {});
      void playQueue();
    },
    [playQueue],
  );

  const stop = useCallback(() => {
    session.current += 1;
    queue.current = [];
    source.current?.stop();
    source.current = null;
    playing.current = false;
    setSpeaking(false);
  }, []);

  const readLevel = useCallback(() => {
    if (!analyser.current || !source.current) return 0;
    analyser.current.getFloatTimeDomainData(samples.current);
    let sum = 0;
    for (const sample of samples.current) sum += sample * sample;
    return Math.min(1, Math.pow(Math.sqrt(sum / samples.current.length) * 5, 0.8));
  }, []);

  useEffect(() => () => {
    session.current += 1;
    void context.current?.close();
  }, []);

  return { speaking, say, stop, readLevel };
}
