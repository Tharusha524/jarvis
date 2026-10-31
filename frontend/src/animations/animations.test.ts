import { describe, expect, it } from "vitest";
import { ASSISTANT_STATES } from "../types/assistant";
import { generateCircuit, seededRandom } from "./circuitTexture";
import { buildFaceGeometry, faceOffset, headPoint, jawWeight, sampleCurve } from "./faceGeometry";
import { QUALITY_PROFILES, STATE_VISUALS, damp } from "./stateVisuals";
import { buildWireGeometry } from "./wireField";

describe("state visuals", () => {
  it("defines every assistant state", () => {
    for (const state of ASSISTANT_STATES) {
      expect(STATE_VISUALS[state].label.length).toBeGreaterThan(0);
    }
  });

  it("gives every state its own colour", () => {
    const colours = ASSISTANT_STATES.map((state) => STATE_VISUALS[state].primary);
    expect(new Set(colours).size).toBe(ASSISTANT_STATES.length);
  });

  it("makes lower quality cheaper to draw", () => {
    const { high, medium, low } = QUALITY_PROFILES;
    expect(high.headDetail).toBeGreaterThan(medium.headDetail);
    expect(medium.headDetail).toBeGreaterThan(low.headDetail);
    expect(high.frameRate).toBeGreaterThan(low.frameRate);
    expect(low.particles).toBe(0);
  });
});

describe("damp", () => {
  it("moves toward the target without passing it", () => {
    const value = damp(0, 1, 5, 0.1);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it("gives the same result however the time is split", () => {
    const oneStep = damp(0, 1, 5, 0.2);
    const twoSteps = damp(damp(0, 1, 5, 0.1), 1, 5, 0.1);
    expect(twoSteps).toBeCloseTo(oneStep, 8);
  });
});

describe("face geometry", () => {
  it("raises the nose and lips, and sinks the eye sockets", () => {
    expect(faceOffset(0, -0.27)).toBeGreaterThan(0.1);
    expect(faceOffset(0, -0.52)).toBeGreaterThan(0);
    expect(faceOffset(0.42, 0.14)).toBeLessThan(0);
  });

  it("moves the chin with the jaw but not the forehead", () => {
    expect(jawWeight(0, -0.8, 0.8)).toBeGreaterThan(0.9);
    expect(jawWeight(0, 0.6, 0.8)).toBe(0);
  });

  it("sits the nose in front of the cheeks", () => {
    const front = Math.PI / 2 + 0.34;
    const [, , noseDepth] = headPoint(0, front);
    const [, , cheekDepth] = headPoint(0.7, front);
    expect(noseDepth).toBeGreaterThan(cheekDepth + 0.1);
  });

  it("produces valid positions and a jaw attribute", () => {
    const { geometry } = buildFaceGeometry(32);
    const position = geometry.getAttribute("position");
    const jaw = geometry.getAttribute("jaw");
    expect(jaw.count).toBe(position.count);
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
  });
});

describe("sampleCurve", () => {
  const table = [[0, 1], [1, 3], [2, 2]] as const;

  it("passes through the table points", () => {
    expect(sampleCurve(table, 1)).toBeCloseTo(3);
  });

  it("holds the end values outside the table", () => {
    expect(sampleCurve(table, -5)).toBe(1);
    expect(sampleCurve(table, 9)).toBe(2);
  });
});

describe("circuit", () => {
  it("draws the same head on every run", () => {
    expect(generateCircuit()).toEqual(generateCircuit());
  });

  it("keeps everything on the upper head", () => {
    const { traces, chips } = generateCircuit();
    expect(traces.length).toBeGreaterThan(100);
    expect(chips.length).toBeGreaterThan(5);
    for (const trace of traces) {
      for (const [x, y] of trace.points) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(0.5);
        expect(y).toBeLessThan(0.5);
      }
    }
  });

  it("has a repeatable random generator", () => {
    expect(seededRandom(3)()).toBe(seededRandom(3)());
  });
});

describe("wires", () => {
  it("gives every wire vertex its pulse data", () => {
    const geometry = buildWireGeometry(5, 5);
    const count = geometry.getAttribute("position").count;
    expect(count).toBeGreaterThan(0);
    expect(geometry.getAttribute("along").count).toBe(count);
    expect(geometry.getAttribute("seed").count).toBe(count);
    expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
  });
});
