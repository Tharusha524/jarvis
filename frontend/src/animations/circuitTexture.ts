import * as THREE from "three";

/**
 * Draws the glowing circuit board on the head into a texture.
 *
 * Each colour channel carries one layer for the face shader:
 *   red   = thin traces, which pulse with light
 *   green = the bright spine down the centre of the head
 *   blue  = dark metal plates under the chips
 *
 * Points use half-texture coordinates: x runs from the centre line (0) to the
 * edge (0.5) and y from the crown (0) to the chin (1). The drawing is mirrored,
 * so the head is symmetrical.
 */

export type Point = readonly [number, number];

export interface Trace {
  points: Point[];
  width: number;
}

export interface Chip {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircuitLayout {
  traces: Trace[];
  chips: Chip[];
}

const GRID = 0.0105;
const TRACE_COUNT = 300;
const CHIP_COUNT = 18;
const MAX_X = 0.4;
const SPINE_TOP = 0.095;
const SPINE_WIDE_END = 0.37;
const SPINE_THIN_END = 0.56;

/** Small repeatable random generator, so the head looks the same every run. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lowest y a trace may reach at this x: the brow, dropping toward the ears. */
function bottomLimit(x: number): number {
  return 0.36 + Math.min(0.1, Math.max(0, x - 0.2) * 0.7);
}

/** Highest y a trace may reach at this x: follows the round crown. */
function topLimit(x: number): number {
  return 0.022 + 0.9 * x * x;
}

function isInside(x: number, y: number): boolean {
  return x > 0.012 && x < MAX_X && y > topLimit(x) && y < bottomLimit(x);
}

function snap(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export function generateCircuit(seed = 7): CircuitLayout {
  const random = seededRandom(seed);
  const chips: Chip[] = [];
  const traces: Trace[] = [];

  for (let i = 0; i < CHIP_COUNT; i += 1) {
    const width = snap(0.02 + random() * 0.05);
    const height = snap(0.016 + random() * 0.035);
    const x = snap(0.026 + random() * 0.24);
    const y = snap(0.05 + random() * 0.29);
    if (isInside(x, y) && isInside(x + width, y + height)) chips.push({ x, y, width, height });
  }

  const directions: Point[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  for (let i = 0; i < TRACE_COUNT; i += 1) {
    let x: number;
    let y: number;
    const chip = chips.length > 0 && random() < 0.4 ? chips[Math.floor(random() * chips.length)] : null;
    if (chip) {
      x = chip.x + chip.width;
      y = chip.y + snap(random() * chip.height);
    } else if (random() < 0.4) {
      x = GRID * 2;
      y = snap(SPINE_TOP + random() * (SPINE_WIDE_END - SPINE_TOP));
    } else {
      x = snap(0.02 + random() * 0.36);
      y = snap(0.03 + random() * 0.42);
    }
    if (!isInside(x, y)) continue;

    const points: Point[] = [[x, y]];
    // Starts outward or diagonal, then only turns by 45 degrees at a time.
    let heading = [0, 1, 7, 2, 6][Math.floor(random() * 5)];
    const bends = 2 + Math.floor(random() * 5);

    for (let bend = 0; bend < bends; bend += 1) {
      const steps = 2 + Math.floor(random() * 10);
      const [dx, dy] = directions[heading];
      const nextX = x + dx * steps * GRID;
      const nextY = y + dy * steps * GRID;
      if (!isInside(nextX, nextY)) break;
      x = nextX;
      y = nextY;
      points.push([x, y]);
      heading = (heading + (random() < 0.5 ? 1 : 7)) % 8;
    }

    if (points.length > 1) traces.push({ points, width: random() < 0.14 ? 1.8 : 1 });
  }

  return { traces, chips };
}

function drawLayout(context: CanvasRenderingContext2D, layout: CircuitLayout, size: number, side: 1 | -1): void {
  const px = (x: number) => (0.5 + side * x) * size;
  const py = (y: number) => y * size;
  const scale = size / 1536;

  for (const chip of layout.chips) {
    const left = side > 0 ? px(chip.x) : px(chip.x + chip.width);
    context.fillStyle = "rgb(0,0,255)";
    context.fillRect(left, py(chip.y), chip.width * size, chip.height * size);
    // Rows of small contacts make each plate read as a chip.
    context.fillStyle = "rgb(150,0,0)";
    const spacing = 8 * scale;
    for (let dotX = left + spacing / 2; dotX < left + chip.width * size; dotX += spacing) {
      for (let dotY = py(chip.y) + spacing / 2; dotY < py(chip.y + chip.height); dotY += spacing) {
        context.fillRect(dotX, dotY, 2.4 * scale, 2.4 * scale);
      }
    }
  }

  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = "rgb(255,0,0)";
  context.fillStyle = "rgb(255,0,0)";
  context.shadowColor = "rgb(110,0,0)";
  context.shadowBlur = 3 * scale;
  for (const trace of layout.traces) {
    context.lineWidth = trace.width * scale;
    context.beginPath();
    trace.points.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(px(x), py(y));
      else context.lineTo(px(x), py(y));
    });
    context.stroke();
    const [endX, endY] = trace.points[trace.points.length - 1];
    context.beginPath();
    context.arc(px(endX), py(endY), 3 * scale, 0, Math.PI * 2);
    context.fill();
  }
  context.shadowBlur = 0;
}

function drawSpine(context: CanvasRenderingContext2D, size: number): void {
  const centre = size / 2;
  const scale = size / 1536;
  context.fillStyle = "rgb(0,255,0)";
  context.shadowColor = "rgb(0,170,0)";
  context.shadowBlur = 22 * scale;

  context.fillRect(centre - 5.5 * scale, SPINE_TOP * size, 11 * scale, (SPINE_WIDE_END - SPINE_TOP) * size);
  context.fillStyle = "rgb(0,120,0)";
  context.fillRect(centre - 2 * scale, SPINE_TOP * size, 4 * scale, (SPINE_THIN_END - SPINE_TOP) * size);
  context.fillStyle = "rgb(0,255,0)";
  // The cross bar near the crown.
  context.fillRect(centre - 66 * scale, (SPINE_TOP - 0.008) * size, 132 * scale, 7 * scale);
  context.fillRect(centre - 34 * scale, SPINE_TOP * size + 16 * scale, 68 * scale, 5 * scale);
  context.shadowBlur = 0;
}

export function buildCircuitTexture(size: number, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the circuit texture");

  context.fillStyle = "#000";
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = "lighter";
  const layout = generateCircuit();
  drawLayout(context, layout, size, 1);
  drawLayout(context, layout, size, -1);
  drawSpine(context, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = Math.min(4, maxAnisotropy);
  return texture;
}
