import { describe, expect, it } from "vitest";
import { INTERRUPTING, LISTENING, LevelWindow, SentenceSplitter, UtteranceDetector, cleanForSpeech, encodeWav } from "./voice";

/** Feeds a detector a run of readings, 20 ms apart, and returns its events. */
function feed(detector: UtteranceDetector, level: number, ms: number, start: number): { events: string[]; end: number } {
  const events: string[] = [];
  let now = start;
  for (; now < start + ms; now += 20) {
    const event = detector.update(level, now);
    if (event) events.push(event);
  }
  return { events, end: now };
}

describe("UtteranceDetector", () => {
  it("finds a spoken sentence", () => {
    const detector = new UtteranceDetector(LISTENING);
    const quiet = feed(detector, 0.002, 300, 0);
    const speech = feed(detector, 0.08, 1200, quiet.end);
    const silence = feed(detector, 0.002, 1600, speech.end);
    expect(quiet.events).toEqual([]);
    expect(speech.events).toEqual(["start"]);
    expect(silence.events).toEqual(["end"]);
  });

  it("ignores a short click", () => {
    const detector = new UtteranceDetector(LISTENING);
    const click = feed(detector, 0.08, 80, 0);
    const silence = feed(detector, 0.002, 1000, click.end);
    expect([...click.events, ...silence.events]).toEqual([]);
  });

  it("discards a cough that is too short to be words", () => {
    const detector = new UtteranceDetector(LISTENING);
    const cough = feed(detector, 0.08, 200, 0);
    const silence = feed(detector, 0.002, 1600, cough.end);
    expect([...cough.events, ...silence.events]).toEqual(["start", "discard"]);
  });

  it("keeps going through short pauses between words", () => {
    const detector = new UtteranceDetector(LISTENING);
    const first = feed(detector, 0.08, 600, 0);
    const pause = feed(detector, 0.002, 1000, first.end);
    const second = feed(detector, 0.08, 600, pause.end);
    expect([...pause.events, ...second.events]).toEqual([]);
  });

  it("hears speech through brief dips in loudness", () => {
    const detector = new UtteranceDetector(LISTENING);
    let now = 0;
    const events: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      // Loud, then one quiet reading, over and over, like a real voice.
      const event = detector.update(i % 4 === 3 ? 0.002 : 0.08, now);
      if (event) events.push(event);
      now += 20;
    }
    expect(events).toEqual(["start"]);
  });

  it("cuts off a very long sentence", () => {
    const detector = new UtteranceDetector(LISTENING);
    // Speech still going after the cut-off counts as the next sentence.
    expect(feed(detector, 0.08, 26000, 0).events.slice(0, 2)).toEqual(["start", "end"]);
  });

  it("keeps listening while a voice fades at the end of a phrase", () => {
    const detector = new UtteranceDetector(LISTENING);
    const quiet = feed(detector, 0.002, 300, 0);
    const speech = feed(detector, 0.08, 800, quiet.end);
    // Too quiet to start speech, but still clearly a voice.
    const fading = feed(detector, 0.009, 2000, speech.end);
    expect(fading.events).toEqual([]);
  });

  it("needs a louder voice to interrupt", () => {
    const detector = new UtteranceDetector(INTERRUPTING);
    expect(feed(detector, 0.03, 600, 0).events).toEqual([]);
    expect(feed(detector, 0.1, 600, 700).events).toEqual(["start"]);
  });
});

describe("audio helpers", () => {
  it("measures loudness over a window of tiny chunks", () => {
    const window = new LevelWindow();
    const chunk = new Float32Array(128).fill(0.5);
    const readings: (number | null)[] = [];
    for (let i = 0; i < 8; i += 1) readings.push(window.push(chunk, 48000));
    expect(readings.filter((reading) => reading === null)).toHaveLength(7);
    expect(readings[7]).toBeCloseTo(0.5);
  });

  it("builds a valid WAV file", async () => {
    const wav = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5])], 16000);
    const view = new DataView(await wav.arrayBuffer());
    expect(wav.size).toBe(44 + 8);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32767);
  });
});

describe("SentenceSplitter", () => {
  it("releases whole sentences from streamed pieces", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("Good eve")).toEqual([]);
    expect(splitter.push("ning, sir. How ")).toEqual(["Good evening, sir."]);
    expect(splitter.push("are you?")).toEqual([]);
    expect(splitter.flush()).toEqual(["How are you?"]);
  });

  it("does not break numbers apart", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("It is 3.5 metres long. ")).toEqual(["It is 3.5 metres long."]);
  });

  it("skips code blocks", () => {
    const splitter = new SentenceSplitter();
    const spoken = [...splitter.push("Try this. ```\nprint('hi.')\n``` That works. "), ...splitter.flush()];
    expect(spoken).toEqual(["Try this.", "That works."]);
  });

  it("drops text with no words", () => {
    const splitter = new SentenceSplitter();
    expect([...splitter.push("--- "), ...splitter.flush()]).toEqual([]);
  });

  it("splits on the Sinhala full stop", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("හරි සර්। ")).toEqual(["හරි සර්।"]);
  });
});

describe("cleanForSpeech", () => {
  it("removes formatting", () => {
    expect(cleanForSpeech("**Bold** and `code`\n# Title")).toBe("Bold and code Title");
  });
});
