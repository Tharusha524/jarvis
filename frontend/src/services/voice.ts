/** Pure helpers for voice. They touch no audio hardware, so they are easy to test. */

export type UtteranceEvent = "start" | "end" | "discard" | null;

export interface DetectorOptions {
  /** Loudness above background noise that counts as speech. */
  startRatio: number;
  /** Once speech has begun, this much quieter still counts as speech. */
  continueRatio: number;
  /** Quietest level that can ever count as speech. */
  minimumLevel: number;
  /** Speech must last this long before it counts. */
  startMs: number;
  /** Silence this long ends the sentence. */
  endSilenceMs: number;
  /** Shorter sounds are coughs or clicks, not words. */
  minimumSpeechMs: number;
  maximumSpeechMs: number;
}

export const LISTENING: DetectorOptions = {
  startRatio: 3,
  continueRatio: 1.6,
  minimumLevel: 0.012,
  startMs: 120,
  // People pause to think mid-sentence, so this has to be generous.
  endSilenceMs: 1400,
  minimumSpeechMs: 400,
  maximumSpeechMs: 25000,
};

/** Stricter, so JARVIS's own voice from the speakers doesn't interrupt him. */
export const INTERRUPTING: DetectorOptions = { ...LISTENING, startRatio: 6, minimumLevel: 0.04, startMs: 260 };

const BRIEF_DIP_MS = 80;
/** Long enough to smooth out single sound waves, short enough to feel instant. */
export const LEVEL_WINDOW_MS = 20;

/** Gathers tiny audio chunks and reports their loudness about every 20 ms. */
export class LevelWindow {
  private sum = 0;
  private count = 0;

  /** Returns a loudness reading when the window is full, otherwise null. */
  push(samples: Float32Array, sampleRate: number): number | null {
    for (const sample of samples) this.sum += sample * sample;
    this.count += samples.length;
    if (this.count < (sampleRate * LEVEL_WINDOW_MS) / 1000) return null;
    const level = Math.sqrt(this.sum / this.count);
    this.sum = 0;
    this.count = 0;
    return level;
  }
}

/** Decides where speech starts and ends from a stream of loudness readings. */
export class UtteranceDetector {
  private noise = 0.005;
  private loudSince: number | null = null;
  private lastLoud = 0;
  private speechStart: number | null = null;
  private quietSince: number | null = null;

  constructor(public options: DetectorOptions) {}

  get speaking(): boolean {
    return this.speechStart !== null;
  }

  update(level: number, nowMs: number): UtteranceEvent {
    const { startRatio, continueRatio, minimumLevel, startMs, endSilenceMs, minimumSpeechMs, maximumSpeechMs } = this.options;
    const threshold = Math.max(minimumLevel, this.noise * startRatio);
    const loud = level >= threshold;

    if (this.speechStart === null) {
      // The background level only learns from quiet moments.
      if (!loud) {
        this.noise += (level - this.noise) * 0.02;
        // Voices dip for a moment between sounds, which is not the end of speech.
        if (nowMs - this.lastLoud > BRIEF_DIP_MS) this.loudSince = null;
        return null;
      }
      this.lastLoud = nowMs;
      this.loudSince ??= nowMs;
      if (nowMs - this.loudSince < startMs) return null;
      this.speechStart = this.loudSince;
      this.quietSince = null;
      return "start";
    }

    // Voices fade at the end of a phrase, so staying in speech takes less.
    const stillSpeaking = level >= Math.max(minimumLevel * 0.5, this.noise * continueRatio);
    if (stillSpeaking) this.quietSince = null;
    else this.quietSince ??= nowMs;

    const tooLong = nowMs - this.speechStart >= maximumSpeechMs;
    const finished = this.quietSince !== null && nowMs - this.quietSince >= endSilenceMs;
    if (!tooLong && !finished) return null;

    const spoken = (this.quietSince ?? nowMs) - this.speechStart;
    this.reset();
    return spoken >= minimumSpeechMs ? "end" : "discard";
  }

  reset(): void {
    this.loudSince = null;
    this.speechStart = null;
    this.quietSince = null;
  }
}

/** Packs raw microphone samples into a 16-bit mono WAV file. */
export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const count = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, count * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clipped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clipped * 32767, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Removes symbols that sound silly when read aloud, and all code. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collects streamed reply text and releases it one sentence at a time. */
export class SentenceSplitter {
  private buffer = "";
  private inCode = false;

  /** Returns the sentences completed by this piece of text. */
  push(text: string): string[] {
    this.buffer += text;
    const sentences: string[] = [];

    for (;;) {
      if (this.inCode) {
        const close = this.buffer.indexOf("```");
        if (close < 0) return sentences;
        this.buffer = this.buffer.slice(close + 3);
        this.inCode = false;
      }
      const open = this.buffer.indexOf("```");
      const end = this.buffer.search(/[.!?।]["')\]]*\s|\n/);
      if (open >= 0 && (end < 0 || open < end)) {
        this.addSentence(sentences, this.buffer.slice(0, open));
        this.buffer = this.buffer.slice(open + 3);
        this.inCode = true;
        continue;
      }
      if (end < 0) return sentences;
      const stop = end + (this.buffer.slice(end).match(/^[.!?।]?["')\]]*/)?.[0].length ?? 0);
      this.addSentence(sentences, this.buffer.slice(0, stop));
      this.buffer = this.buffer.slice(stop).trimStart();
    }
  }

  /** Returns whatever is left when the reply ends. */
  flush(): string[] {
    const sentences: string[] = [];
    if (!this.inCode) this.addSentence(sentences, this.buffer);
    this.buffer = "";
    this.inCode = false;
    return sentences;
  }

  private addSentence(sentences: string[], text: string): void {
    const clean = cleanForSpeech(text);
    if (/[\p{L}\p{N}]/u.test(clean)) sentences.push(clean);
  }
}
