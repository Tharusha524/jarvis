import * as THREE from "three";

/**
 * The head is built from maths, not a downloaded 3D model. That keeps the app
 * small and gives full control over the jaw for lip movement.
 *
 * Every height of the head gets a rounded slice, sized by the tables below.
 * `faceOffset` then sculpts the features into the front. X is left and right,
 * Y runs from the chin (-1.1) to the crown (1), and the face points toward +Z.
 */

type CurveTable = readonly (readonly [number, number])[];

/** Width of each slice, keyed from the chin (-1) to the crown (1). */
const WIDTH: CurveTable = [[-1, 0.68], [-0.85, 0.72], [-0.7, 0.81], [-0.5, 0.91], [-0.25, 0.97], [0, 1], [0.3, 1.01], [0.6, 1.04], [1, 1.06]];
const FRONT_DEPTH: CurveTable = [[-1, 0.8], [-0.8, 0.88], [-0.5, 0.92], [0, 0.95], [0.4, 0.96], [0.7, 1], [1, 1]];
const BACK_DEPTH: CurveTable = [[-1, 0.35], [-0.6, 0.5], [-0.3, 0.75], [0, 0.98], [0.4, 1.05], [1, 1]];

const EYE_X = 0.32;
const EYE_Y = 0.06;
const MOUTH_Y = -0.62;
const MOUTH_HALF_WIDTH = 0.23;

function bump(x: number, y: number, cx: number, cy: number, sx: number, sy: number): number {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;
  return Math.exp(-(dx * dx + dy * dy));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Keeps the sign of `value` while raising its size to a power. */
function signedPower(value: number, power: number): number {
  return Math.sign(value) * Math.pow(Math.abs(value), power);
}

/** Smooth curve through a table of points (Catmull-Rom spline). */
export function sampleCurve(table: CurveTable, t: number): number {
  if (t <= table[0][0]) return table[0][1];
  const last = table.length - 1;
  if (t >= table[last][0]) return table[last][1];

  let i = 0;
  while (t > table[i + 1][0]) i += 1;
  const [t1, v1] = table[i];
  const [t2, v2] = table[i + 1];
  const [t0, v0] = table[Math.max(0, i - 1)];
  const [t3, v3] = table[Math.min(last, i + 2)];

  const span = t2 - t1;
  const u = (t - t1) / span;
  const slope1 = ((v2 - v0) / (t2 - t0)) * span;
  const slope2 = ((v3 - v1) / (t3 - t1)) * span;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v1 + (u3 - 2 * u2 + u) * slope1 + (-2 * u3 + 3 * u2) * v2 + (u3 - u2) * slope2;
}

function noseOffset(x: number, y: number): number {
  const along = Math.min(1, Math.max(0, (0.1 - y) / 0.44));
  const ridgeWidth = 0.05 + 0.045 * along;
  const ridgeFade = smoothstep(0.16, 0.04, y) * smoothstep(-0.42, -0.33, y);
  let depth = (0.06 + 0.2 * along) * Math.exp(-((x / ridgeWidth) ** 2)) * ridgeFade;
  const ax = Math.abs(x);
  depth += 0.08 * bump(x, y, 0, -0.32, 0.09, 0.065); // tip
  depth += 0.06 * bump(ax, y, 0.105, -0.36, 0.05, 0.042); // wings
  depth -= 0.05 * bump(ax, y, 0.058, -0.392, 0.028, 0.012); // nostrils
  depth -= 0.012 * bump(x, y, 0, -0.49, 0.02, 0.05); // groove above the lip
  return depth;
}

function lipsOffset(x: number, y: number): number {
  const t = x / MOUTH_HALF_WIDTH;
  const edge = 1 - t * t;
  if (edge <= 0) return 0;

  const seam = MOUTH_Y - 0.012 * edge + 0.008 * Math.exp(-((x / 0.04) ** 2));
  const cupidDip = 0.016 * Math.exp(-((x / 0.028) ** 2));
  const upperEdge = seam + 0.05 * Math.sqrt(edge) - cupidDip;
  const lowerEdge = seam - 0.066 * Math.pow(edge, 0.62);

  let depth = 0;
  if (y >= seam && y < upperEdge) {
    depth += 0.03 * Math.pow(Math.sin(((y - seam) / (upperEdge - seam)) * Math.PI), 0.7);
  } else if (y < seam && y > lowerEdge) {
    depth += 0.04 * Math.pow(Math.sin(((seam - y) / (seam - lowerEdge)) * Math.PI), 0.7);
  }
  // Soften the sides so the lips melt into the skin at the corners.
  depth *= smoothstep(1, 0.72, Math.abs(t));
  depth -= 0.02 * Math.exp(-(((y - seam) / 0.006) ** 2)) * smoothstep(1.05, 0.8, Math.abs(t));
  return depth;
}

function eyeOffset(ax: number, y: number): number {
  let depth = 0;
  depth -= 0.075 * bump(ax, y, EYE_X, EYE_Y + 0.015, 0.22, 0.1); // socket
  depth += 0.05 * bump(ax, y, EYE_X, EYE_Y, 0.135, 0.06); // eyeball under the lids
  // Fold of the upper eyelid.
  const lid = (ax - EYE_X) / 0.165;
  if (Math.abs(lid) < 1) {
    const foldY = EYE_Y + 0.083 * (1 - lid * lid) + 0.012 * lid;
    depth -= 0.008 * Math.exp(-(((y - foldY) / 0.01) ** 2)) * (1 - lid * lid);
  }
  return depth;
}

/** Depth change on the front of the face at the point (x, y). */
export function faceOffset(x: number, y: number): number {
  const ax = Math.abs(x);
  let depth = 0;
  depth += 0.03 * bump(x, y, 0, 0.62, 0.5, 0.3); // rounded forehead
  depth -= 0.03 * bump(ax, y, 0.68, 0.38, 0.14, 0.24); // temples
  depth += 0.03 * bump(ax, y, 0.3, 0.205, 0.27, 0.05); // brow ridge
  depth += 0.032 * bump(ax, y, 0.46, -0.17, 0.25, 0.18); // cheekbones
  depth -= 0.02 * bump(ax, y, 0.5, -0.56, 0.18, 0.15); // hollow under the cheek
  depth += 0.03 * bump(x, y, 0, MOUTH_Y, 0.3, 0.18); // area around the mouth
  depth -= 0.02 * bump(x, y, 0, -0.77, 0.14, 0.024); // crease under the lip
  depth += 0.05 * bump(x, y, 0, -0.91, 0.17, 0.08); // chin

  // Soft line from the nose to the corner of the mouth.
  const fold = Math.min(1, Math.max(0, ((ax - 0.15) * 0.14 + (y + 0.39) * -0.21) / 0.0637));
  const foldX = ax - (0.15 + 0.14 * fold);
  const foldY = y - (-0.39 - 0.21 * fold);
  depth -= 0.006 * Math.exp(-(foldX * foldX + foldY * foldY) / 0.0008);

  return depth + eyeOffset(ax, y) + noseOffset(x, y) + lipsOffset(x, y);
}

/**
 * How much a point stands out from its neighbours. Negative values are creases
 * such as nostrils and eye corners, which the shader darkens to show the form.
 */
export function reliefAt(x: number, y: number): number {
  const reach = 0.045;
  const around =
    faceOffset(x + reach, y) + faceOffset(x - reach, y) + faceOffset(x, y + reach) + faceOffset(x, y - reach);
  return faceOffset(x, y) - around / 4;
}

/** How far a point follows the jaw, from 0 (fixed) to 1 (fully moving). */
export function jawWeight(x: number, y: number, z: number): number {
  const belowMouth = 1 - smoothstep(MOUTH_Y - 0.03, MOUTH_Y + 0.008, y);
  const front = smoothstep(-0.25, 0.3, z);
  const centre = 1 - smoothstep(0.32, 0.64, Math.abs(x));
  return belowMouth * front * centre;
}

/** Packs more of the mesh onto the front of the face, where the detail is. */
function warpAround(s: number): number {
  return s * (0.42 + 0.58 * s * s);
}

function warpDown(v: number): number {
  return v + (0.55 * Math.sin(2 * Math.PI * v)) / (2 * Math.PI);
}

export function headPoint(azimuth: number, polar: number): [number, number, number] {
  const heightUnit = Math.cos(polar);
  const ring = Math.sin(polar);
  const y = heightUnit >= 0 ? heightUnit : heightUnit * 1.1;

  const width = 0.78 * Math.pow(ring, heightUnit > 0 ? 0.76 : 0.8) * sampleCurve(WIDTH, heightUnit);
  const front = 0.84 * Math.pow(ring, 0.7) * sampleCurve(FRONT_DEPTH, heightUnit);
  const back = 0.98 * Math.pow(ring, 0.6) * sampleCurve(BACK_DEPTH, heightUnit);

  const sine = Math.sin(azimuth);
  const cosine = Math.cos(azimuth);
  let x = width * signedPower(sine, 0.85);
  let z = (cosine > 0 ? front : back) * signedPower(cosine, 0.9);

  // Features fade out toward the ears.
  z += faceOffset(x, y) * smoothstep(0.1, 0.55, cosine);
  const side = smoothstep(0.86, 0.99, Math.abs(sine));
  x += Math.sign(sine) * 0.06 * bump(cosine, y, -0.05, -0.02, 0.14, 0.2) * side;
  return [x, y, z];
}

export interface FaceGeometry {
  geometry: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
}

function buildNeck(detail: number): THREE.BufferGeometry {
  const neck = new THREE.CylinderGeometry(0.27, 0.34, 0.8, Math.round(detail / 3), Math.round(detail / 10), true);
  neck.translate(0, -1.14, -0.14);
  // The shared shader expects a jaw value; the neck never moves with the jaw.
  const vertices = neck.getAttribute("position").count;
  neck.setAttribute("jaw", new THREE.BufferAttribute(new Float32Array(vertices), 1));
  neck.setAttribute("relief", new THREE.BufferAttribute(new Float32Array(vertices), 1));
  return neck;
}

export function buildFaceGeometry(detail: number): FaceGeometry {
  const columns = detail;
  const rows = Math.round(detail * 0.8);
  const count = (columns + 1) * (rows + 1);
  const positions = new Float32Array(count * 3);
  const jaw = new Float32Array(count);
  const relief = new Float32Array(count);

  let vertex = 0;
  for (let row = 0; row <= rows; row += 1) {
    const polar = Math.PI * warpDown(row / rows);
    for (let column = 0; column <= columns; column += 1) {
      const azimuth = Math.PI * warpAround((column / columns) * 2 - 1);
      const [x, y, z] = headPoint(azimuth, polar);
      positions.set([x, y, z], vertex * 3);
      jaw[vertex] = jawWeight(x, y, z);
      relief[vertex] = reliefAt(x, y) * smoothstep(0.1, 0.55, Math.cos(azimuth));
      vertex += 1;
    }
  }

  const indices = new Uint32Array(rows * columns * 6);
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.set([a, b, a + 1, b, b + 1, a + 1], index);
      index += 6;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("jaw", new THREE.BufferAttribute(jaw, 1));
  geometry.setAttribute("relief", new THREE.BufferAttribute(relief, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return { geometry, neck: buildNeck(detail) };
}
