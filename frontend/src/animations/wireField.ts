import * as THREE from "three";
import { seededRandom } from "./circuitTexture";

/**
 * The web of glowing wires behind the head and flowing out of the neck.
 * Each piece of wire stores how far along its wire it is, so the shader can
 * send pulses of light along it.
 */

interface WireBuilder {
  positions: number[];
  along: number[];
  seeds: number[];
}

type WirePoint = [number, number, number];

function addWire(builder: WireBuilder, points: WirePoint[], seed: number): void {
  for (let i = 0; i < points.length - 1; i += 1) {
    builder.positions.push(...points[i], ...points[i + 1]);
    builder.along.push(i / points.length, (i + 1) / points.length);
    builder.seeds.push(seed, seed);
  }
}

function addArcs(builder: WireBuilder, count: number, random: () => number): void {
  for (let i = 0; i < count; i += 1) {
    const radius = 1.55 + random() * 2.5;
    const start = random() * Math.PI * 2;
    const span = 0.4 + random() * 1.5;
    const depth = -0.9 - random() * 1.1;
    const wobble = random() * Math.PI * 2;
    const points: WirePoint[] = [];

    for (let step = 0; step <= 30; step += 1) {
      const angle = start + (step / 30) * span;
      const swell = radius + 0.05 * Math.sin(angle * 6 + wobble);
      points.push([Math.cos(angle) * swell * 1.08, Math.sin(angle) * swell, depth]);
    }
    addWire(builder, points, random() * 10);

    // Some arcs step outward in a right angle, like a circuit board.
    if (random() < 0.45) {
      const [x, y, z] = points[points.length - 1];
      const length = 0.15 + random() * 0.45;
      const out = Math.atan2(y, x);
      const elbow: WirePoint = [x + Math.cos(out) * length, y + Math.sin(out) * length, z];
      addWire(builder, [[x, y, z], elbow, [elbow[0] + 0.2 * Math.sign(x), elbow[1], z]], random() * 10);
    }
  }
}

function addNeckStrands(builder: WireBuilder, count: number, random: () => number): void {
  for (let i = 0; i < count; i += 1) {
    const side = random() < 0.5 ? -1 : 1;
    const startX = side * (0.08 + random() * 0.2);
    const endX = side * (0.6 + random() * 2);
    const startY = -0.88 - random() * 0.1;
    const endY = -1.75 - random() * 0.7;
    const bendY = -1.3 - random() * 0.3;
    const depth = -0.2 - random() * 0.5;
    const points: WirePoint[] = [];

    for (let step = 0; step <= 24; step += 1) {
      const t = step / 24;
      const mix = 1 - t;
      // A curve that hangs straight down, then sweeps out to the side.
      const x = mix * mix * startX + 2 * mix * t * startX + t * t * endX;
      const y = mix * mix * startY + 2 * mix * t * bendY + t * t * endY;
      points.push([x, y, depth * t]);
    }
    addWire(builder, points, random() * 10);
  }
}

export function buildWireGeometry(arcCount: number, strandCount: number): THREE.BufferGeometry {
  const random = seededRandom(21);
  const builder: WireBuilder = { positions: [], along: [], seeds: [] };
  addArcs(builder, arcCount, random);
  addNeckStrands(builder, strandCount, random);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(builder.positions, 3));
  geometry.setAttribute("along", new THREE.Float32BufferAttribute(builder.along, 1));
  geometry.setAttribute("seed", new THREE.Float32BufferAttribute(builder.seeds, 1));
  return geometry;
}
