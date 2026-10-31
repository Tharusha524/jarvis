import * as THREE from "three";
import type { AnimationQuality, AssistantState } from "../types/assistant";
import { buildCircuitTexture } from "./circuitTexture";
import { buildFaceGeometry } from "./faceGeometry";
import { QUALITY_PROFILES, STATE_VISUALS, damp } from "./stateVisuals";
import { buildWireGeometry } from "./wireField";

const FACE_VERTEX = /* glsl */ `
  attribute float jaw;
  attribute float relief;
  uniform float uTime;
  uniform float uMouth;
  uniform float uRipple;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  varying float vRelief;

  void main() {
    vec3 moved = position;
    // The jaw drops and slides back a little, like a real hinge.
    moved.y -= jaw * uMouth * 0.09;
    moved.z -= jaw * uMouth * 0.05;
    // A soft pulse travels down the head with the audio.
    moved += normal * uRipple * 0.005 * sin(position.y * 9.0 - uTime * 7.0);

    vec4 world = modelViewMatrix * vec4(moved, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-world.xyz);
    vLocal = position;
    vRelief = relief;
    gl_Position = projectionMatrix * world;
  }
`;

const FACE_FRAGMENT = /* glsl */ `
  uniform sampler2D uCircuit;
  uniform vec3 uPrimary;
  uniform vec3 uAccent;
  uniform float uTime;
  uniform float uShimmer;
  uniform float uMouth;
  uniform float uEyeOpen;
  uniform vec2 uGaze;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  varying float vRelief;

  const vec2 EYE_CENTRE = vec2(0.32, 0.06);
  const float EYE_SIZE = 0.15;

  // Layout of the circuit texture. Matches circuitTexture.ts.
  vec2 circuitCoords(vec3 point) {
    float around = atan(point.x, point.z) / (2.0 * 1.85);
    return vec2(0.5 + around, (point.y + 1.1) / 2.1);
  }

  // Tiny dots across the cheeks, like the mesh of a digital face.
  float meshDots(vec3 point) {
    vec2 grid = point.xy * 74.0;
    float fade = 1.0 - smoothstep(0.3, 0.7, fwidth(grid.y));
    vec2 cell = fract(grid) - 0.5;
    float dots = smoothstep(0.34, 0.18, length(cell));
    float side = smoothstep(0.2, 0.34, abs(point.x));
    float height = smoothstep(-0.82, -0.46, point.y) * (1.0 - smoothstep(-0.34, -0.06, point.y));
    return dots * side * height * fade;
  }

  vec3 addEye(vec3 colour, vec3 point) {
    vec2 eye = (vec2(abs(point.x), point.y) - EYE_CENTRE) / EYE_SIZE;
    if (point.z < 0.0 || abs(eye.x) > 1.5 || abs(eye.y) > 1.5) return colour;

    float arch = max(0.0, 1.0 - eye.x * eye.x);
    float tilt = eye.x * 0.1;
    float upper = tilt + arch * mix(-0.24, 0.42, uEyeOpen);
    float lower = tilt - arch * 0.25;
    float open = smoothstep(-0.03, 0.03, upper - eye.y) * smoothstep(-0.03, 0.03, eye.y - lower);

    vec2 iris = eye - vec2(uGaze.x * sign(point.x), 0.03 + uGaze.y);
    float radius = length(iris);
    float strands = 0.78 + 0.22 * sin(atan(iris.y, iris.x) * 38.0);
    vec3 irisColour = mix(uAccent * 1.5, uPrimary * 1.1, smoothstep(0.1, 0.46, radius)) * strands;
    irisColour = mix(irisColour, vec3(0.0, 0.02, 0.05), smoothstep(0.38, 0.47, radius) * 0.75);
    irisColour = mix(vec3(0.0, 0.01, 0.03), irisColour, smoothstep(0.13, 0.17, radius));

    vec3 white = mix(uPrimary * uPrimary * 0.3, uPrimary * 0.32 + uAccent * 0.26, smoothstep(1.0, 0.1, abs(eye.x)));
    vec3 ball = mix(white, irisColour, smoothstep(0.48, 0.44, radius));
    ball += vec3(1.0) * smoothstep(0.09, 0.05, length(iris - vec2(-0.13, 0.15)));
    ball *= 0.45 + 0.55 * smoothstep(0.0, 0.34, upper - eye.y);

    vec3 result = mix(colour, ball, open);
    float lidLine = smoothstep(0.1, 0.0, abs(eye.y - upper)) * arch;
    result *= 1.0 - lidLine * 0.65 * (1.0 - open * 0.5);
    result += uAccent * 0.1 * exp(-radius * radius * 2.4) * (1.0 - open) * uEyeOpen;
    return result;
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(vView);
    float facing = max(dot(normal, view), 0.0);
    float rim = pow(1.0 - facing, 3.2);

    vec3 keyLight = normalize(vec3(-0.3, 0.72, 0.62));
    vec3 fillLight = normalize(vec3(0.62, -0.08, 0.5));
    float key = pow(max(dot(normal, keyLight), 0.0), 1.25);
    float fill = max(dot(normal, fillLight), 0.0);
    float gloss = pow(max(dot(normal, normalize(keyLight + view)), 0.0), 34.0);

    // Light from the camera keeps the centre of the face bright and lets the
    // sides fall into shadow, which is what shows the shape of the head.
    float front = pow(facing, 2.1);
    float shade = clamp(0.02 + front * 0.62 + key * 0.26 + fill * 0.06 + vRelief * 8.0, 0.0, 1.0);
    vec3 deep = uPrimary * uPrimary;
    vec3 skin = mix(deep * 0.03, deep * 0.6 + uAccent * 0.05, shade * shade * 0.45 + shade * 0.55);
    skin += uAccent * 0.2 * shade * shade * shade;

    // The lips sit a shade deeper than the skin around them.
    vec2 lipArea = vec2(vLocal.x / 0.23, (vLocal.y + 0.625) / 0.07);
    skin *= 1.0 - 0.3 * (1.0 - smoothstep(0.55, 1.05, length(lipArea))) * step(0.0, vLocal.z);

    // The upper head is darker, so the circuit stands out against it.
    skin *= 1.0 - 0.62 * smoothstep(0.12, 0.34, vLocal.y);
    skin *= 1.0 - meshDots(vLocal) * 0.4;

    vec3 circuit = texture2D(uCircuit, circuitCoords(vLocal)).rgb;
    // The texture is flipped because canvases count y from the top.
    skin *= 1.0 - circuit.b * 0.72;

    vec3 colour = skin;
    colour += mix(uPrimary, uAccent, 0.45) * rim * 0.55;
    colour += mix(uPrimary, uAccent, 0.5) * gloss * 0.2;

    float distanceFromCrown = length(vLocal.xy - vec2(0.0, 0.95));
    float pulse = pow(0.5 + 0.5 * sin(distanceFromCrown * 13.0 - uTime * (1.6 + uShimmer * 3.2)), 5.0);
    colour += mix(uPrimary, uAccent, 0.6) * circuit.r * (0.34 + 0.2 * uShimmer + pulse * 1.1);
    colour += mix(uAccent, vec3(1.0), 0.5) * circuit.g * (1.0 + 0.25 * sin(uTime * 2.2));

    float sweep = smoothstep(0.035, 0.0, abs(fract(uTime * 0.12) * 3.2 - 1.6 - vLocal.y));
    colour += uAccent * sweep * max(0.0, uShimmer - 0.5) * 0.2;

    // A dark opening between the lips makes speech easy to see.
    vec2 lips = vec2(vLocal.x / 0.135, (vLocal.y + 0.625) / 0.036);
    float opening = (1.0 - smoothstep(0.5, 1.0, length(lips))) * step(0.0, vLocal.z);
    colour *= 1.0 - opening * min(1.0, uMouth * 3.0) * 0.94;

    colour = addEye(colour, vLocal);

    // The neck dissolves into light instead of ending at a hard edge.
    float alpha = smoothstep(-1.44, -1.04, vLocal.y);
    gl_FragColor = vec4(colour, alpha);
    #include <colorspace_fragment>
  }
`;

const WIRE_VERTEX = /* glsl */ `
  attribute float along;
  attribute float seed;
  varying float vAlong;
  varying float vSeed;

  void main() {
    vAlong = along;
    vSeed = seed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WIRE_FRAGMENT = /* glsl */ `
  uniform vec3 uPrimary;
  uniform vec3 uAccent;
  uniform float uTime;
  uniform float uShimmer;
  varying float vAlong;
  varying float vSeed;

  void main() {
    float travel = vAlong * 7.0 - uTime * (0.6 + uShimmer * 1.7) + vSeed;
    float pulse = pow(0.5 + 0.5 * sin(travel), 26.0);
    vec3 colour = mix(uPrimary * uPrimary * 0.7, uAccent, pulse);
    gl_FragColor = vec4(colour, 0.1 + pulse * 0.42);
    #include <colorspace_fragment>
  }
`;

/** Sits just outside the head and clear of the side panels. */
const RING_RADIUS = 1.38;
/** Lifts everything so the controls never cover the chin. */
const SCENE_LIFT = 0.26;
const CAMERA_DISTANCE = 6.8;

export interface FaceSceneOptions {
  quality: AnimationQuality;
  /** Called every frame. Returns loudness from 0 to 1. */
  readAudioLevel: () => number;
  /** Called once the first frame is drawn, which can take a few seconds. */
  onFirstFrame?: () => void;
  onFrameRate?: (framesPerSecond: number) => void;
}

/**
 * Owns the whole Three.js scene. React only tells it the current state; it
 * never re-renders every frame, which keeps the CPU load low.
 */
export class FaceScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(31, 1, 0.1, 40);
  private root = new THREE.Group();
  private head = new THREE.Group();
  private elapsed = 0;
  private observer: ResizeObserver;

  private uniforms = {
    uTime: { value: 0 },
    uMouth: { value: 0 },
    uRipple: { value: 0 },
    uShimmer: { value: 0.2 },
    uEyeOpen: { value: 1 },
    uGaze: { value: new THREE.Vector2() },
    uPrimary: { value: new THREE.Color("#1fb6ff") },
    uAccent: { value: new THREE.Color("#a8f0ff") },
    uCircuit: { value: null as THREE.Texture | null },
  };

  private qualityMeshes: (THREE.Mesh | THREE.Points | THREE.LineSegments)[] = [];
  private bars: THREE.InstancedMesh | null = null;
  private barLevels = new Float32Array(0);
  private barMaterial = new THREE.MeshBasicMaterial({
    color: "#a8f0ff",
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  private rings: THREE.Mesh[] = [];
  private ringMaterial = new THREE.MeshBasicMaterial({
    color: "#1fb6ff",
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private particles: THREE.Points | null = null;
  private dummy = new THREE.Object3D();

  private state: AssistantState = "idle";
  private quality: AnimationQuality;
  private smoothedAudio = 0;
  private motion = STATE_VISUALS.idle.motion;
  private ringSpeed = STATE_VISUALS.idle.ringSpeed;
  private eyeOpen = STATE_VISUALS.idle.eyeOpen;
  private pointer = new THREE.Vector2();
  private smoothedPointer = new THREE.Vector2();
  private nextBlink = 3;
  private blink = 0;

  private animationFrame = 0;
  private lastRender = 0;
  private fpsFrames = 0;
  private fpsStart = 0;
  private running = false;
  private minimized = false;
  private readAudioLevel: () => number;
  private onFirstFrame?: () => void;
  private onFrameRate?: (framesPerSecond: number) => void;

  constructor(private container: HTMLElement, options: FaceSceneOptions) {
    this.quality = options.quality;
    this.readAudioLevel = options.readAudioLevel;
    this.onFirstFrame = options.onFirstFrame;
    this.onFrameRate = options.onFrameRate;

    // Throws when WebGL is unavailable. FaceStage shows that as a clear error.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.camera.position.set(0, 0, CAMERA_DISTANCE);
    this.root.position.y = SCENE_LIFT;
    this.scene.add(this.root);
    this.root.add(this.head);

    this.buildRings();
    this.buildQualityObjects();

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();

    window.addEventListener("pointermove", this.handlePointer);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.setState("idle", true);
    this.start();
  }

  setState(state: AssistantState, instant = false): void {
    this.state = state;
    if (instant) {
      const visual = STATE_VISUALS[state];
      this.uniforms.uPrimary.value.set(visual.primary);
      this.uniforms.uAccent.value.set(visual.accent);
    }
  }

  setQuality(quality: AnimationQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.buildQualityObjects();
    this.resize();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    window.removeEventListener("pointermove", this.handlePointer);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.clearQualityObjects();
    for (const ring of this.rings) ring.geometry.dispose();
    this.ringMaterial.dispose();
    this.barMaterial.dispose();
    this.renderer.forceContextLoss();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private handlePointer = (event: PointerEvent): void => {
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      (event.clientY / window.innerHeight) * 2 - 1,
    );
  };

  /** WebView2 keeps the page "visible" when minimized, so the app reports it. */
  setMinimized(minimized: boolean): void {
    this.minimized = minimized;
    this.handleVisibility();
  }

  // Nothing is drawn while the window is hidden, so JARVIS uses almost no
  // CPU or GPU in the background.
  private handleVisibility = (): void => {
    if (document.hidden || this.minimized) {
      this.running = false;
      cancelAnimationFrame(this.animationFrame);
    } else {
      this.start();
    }
  };

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastRender = performance.now();
    this.fpsStart = this.lastRender;
    this.fpsFrames = 0;
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  private resize(): void {
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PROFILES[this.quality].maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Pull back on narrow windows so the rings are never cut off.
    this.camera.position.z = CAMERA_DISTANCE * Math.max(1, 1.05 / this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  private clearQualityObjects(): void {
    for (const mesh of this.qualityMeshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.qualityMeshes = [];
    this.uniforms.uCircuit.value?.dispose();
    this.uniforms.uCircuit.value = null;
    if (this.bars) {
      this.bars.removeFromParent();
      this.bars.geometry.dispose();
      this.bars.dispose();
      this.bars = null;
    }
    this.particles = null;
  }

  private buildQualityObjects(): void {
    this.clearQualityObjects();
    const profile = QUALITY_PROFILES[this.quality];

    this.uniforms.uCircuit.value = buildCircuitTexture(
      profile.textureSize,
      this.renderer.capabilities.getMaxAnisotropy(),
    );

    const { geometry, neck } = buildFaceGeometry(profile.headDetail);
    const faceMaterial = new THREE.ShaderMaterial({
      vertexShader: FACE_VERTEX,
      fragmentShader: FACE_FRAGMENT,
      uniforms: this.uniforms,
      transparent: true,
    });
    const face = new THREE.Mesh(geometry, faceMaterial);
    const neckMesh = new THREE.Mesh(neck, faceMaterial);
    // Drawn after the head, so the top of the neck stays hidden inside it.
    neckMesh.renderOrder = 1;
    this.head.add(face, neckMesh);

    const wires = new THREE.LineSegments(
      buildWireGeometry(profile.wireArcs, profile.neckStrands),
      new THREE.ShaderMaterial({
        vertexShader: WIRE_VERTEX,
        fragmentShader: WIRE_FRAGMENT,
        uniforms: this.uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    wires.renderOrder = 2;
    this.root.add(wires);
    this.qualityMeshes.push(face, neckMesh, wires);

    const bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.barMaterial, profile.ringBars);
    bars.frustumCulled = false;
    bars.position.z = -0.7;
    this.root.add(bars);
    this.bars = bars;
    this.barLevels = new Float32Array(profile.ringBars);

    if (profile.particles > 0) {
      const positions = new Float32Array(profile.particles * 3);
      for (let i = 0; i < profile.particles; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 1.95 + Math.random() * 1.1;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = Math.sin(angle) * radius;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
      }
      const particleGeometry = new THREE.BufferGeometry();
      particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      this.particles = new THREE.Points(
        particleGeometry,
        new THREE.PointsMaterial({
          color: "#6fdcff",
          size: 0.014,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.root.add(this.particles);
      this.qualityMeshes.push(this.particles);
    }
  }

  private buildRings(): void {
    const shapes: [number, number, number, number][] = [
      // radius, thickness, arc length, starting rotation
      [RING_RADIUS, 0.007, Math.PI * 2, 0],
      [RING_RADIUS + 0.2, 0.012, Math.PI * 0.62, 0.4],
      [RING_RADIUS + 0.2, 0.012, Math.PI * 0.34, 3.2],
    ];
    for (const [radius, thickness, arc, rotation] of shapes) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius, radius + thickness, 96, 1, 0, arc),
        this.ringMaterial,
      );
      ring.rotation.z = rotation;
      ring.position.z = -0.7;
      this.root.add(ring);
      this.rings.push(ring);
    }
  }

  private updateBars(time: number): void {
    if (!this.bars) return;
    const count = this.barLevels.length;
    const audio = this.smoothedAudio;
    const quiet = this.state === "thinking" ? 0.16 : 0.035;

    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      // Layered waves keep the ring lively without a full audio spectrum.
      const wave =
        0.5 +
        0.3 * Math.sin(angle * 5 + time * 3.1) +
        0.2 * Math.sin(angle * 11 - time * 4.7);
      const orbit = this.state === "thinking" ? Math.max(0, Math.cos(angle - time * 2.6)) ** 6 : 0;
      const target = quiet * (0.5 + wave * 0.5) + audio * (0.2 + wave * 0.8) + orbit * 0.34;
      this.barLevels[i] += (target - this.barLevels[i]) * 0.3;

      const length = 0.01 + this.barLevels[i] * 0.26;
      const radius = RING_RADIUS + 0.03 + length / 2;
      this.dummy.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      this.dummy.rotation.z = angle - Math.PI / 2;
      this.dummy.scale.set(((Math.PI * 2 * RING_RADIUS) / count) * 0.3, length, 1);
      this.dummy.updateMatrix();
      this.bars.setMatrixAt(i, this.dummy.matrix);
    }
    this.bars.instanceMatrix.needsUpdate = true;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.animationFrame = requestAnimationFrame(this.frame);

    // Skipping frames above the cap is the main saving on integrated graphics.
    const profile = QUALITY_PROFILES[this.quality];
    const interval = 1000 / profile.frameRate;
    const sinceLast = now - this.lastRender;
    if (sinceLast < interval - 1) return;
    const delta = Math.min(sinceLast / 1000, 0.1);
    // Keeping the remainder stops small timer jitter from skipping a frame.
    this.lastRender = now - Math.max(0, sinceLast - interval) % interval;
    this.elapsed += delta;

    const time = this.elapsed;
    const visual = STATE_VISUALS[this.state];

    this.uniforms.uTime.value = time;
    this.uniforms.uPrimary.value.lerp(new THREE.Color(visual.primary), 1 - Math.exp(-5 * delta));
    this.uniforms.uAccent.value.lerp(new THREE.Color(visual.accent), 1 - Math.exp(-5 * delta));
    this.uniforms.uShimmer.value = damp(this.uniforms.uShimmer.value, visual.shimmer, 4, delta);
    this.ringMaterial.color.copy(this.uniforms.uPrimary.value);
    this.barMaterial.color.copy(this.uniforms.uAccent.value);

    this.motion = damp(this.motion, visual.motion, 3, delta);
    this.ringSpeed = damp(this.ringSpeed, visual.ringSpeed, 3, delta);
    this.eyeOpen = damp(this.eyeOpen, visual.eyeOpen, 6, delta);
    this.smoothedAudio = damp(this.smoothedAudio, this.readAudioLevel(), 16, delta);

    // Only the speaking state moves the mouth.
    const mouthTarget = this.state === "speaking" ? this.smoothedAudio : 0;
    this.uniforms.uMouth.value = damp(this.uniforms.uMouth.value, mouthTarget, 22, delta);
    this.uniforms.uRipple.value = damp(
      this.uniforms.uRipple.value,
      this.state === "listening" || this.state === "speaking" ? this.smoothedAudio : 0,
      10,
      delta,
    );

    // The head leans gently toward the pointer and sways on its own.
    this.smoothedPointer.x = damp(this.smoothedPointer.x, this.pointer.x, 2.5, delta);
    this.smoothedPointer.y = damp(this.smoothedPointer.y, this.pointer.y, 2.5, delta);
    const errorShake = this.state === "error" ? Math.sin(time * 34) * 0.012 * Math.exp(-(time % 3) * 3) : 0;
    this.head.rotation.y = this.smoothedPointer.x * 0.2 + Math.sin(time * 0.5) * 0.11 * this.motion + errorShake;
    this.head.rotation.x = this.smoothedPointer.y * 0.1 + Math.sin(time * 0.37) * 0.05 * this.motion;
    this.head.rotation.z = Math.sin(time * 0.29) * 0.018 * this.motion;
    this.head.position.y = -0.04 + Math.sin(time * 0.8) * 0.02;

    if (time > this.nextBlink) {
      this.blink = 1;
      this.nextBlink = time + 2.5 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - delta * 7);
    this.uniforms.uEyeOpen.value = this.eyeOpen * (1 - Math.sin(this.blink * Math.PI));
    // The eyes follow the pointer a little further than the head does.
    this.uniforms.uGaze.value.set(this.smoothedPointer.x * 0.3, -this.smoothedPointer.y * 0.12);

    this.rings.forEach((ring, index) => {
      ring.rotation.z += delta * this.ringSpeed * (index % 2 === 0 ? 1 : -1) * (0.6 + index * 0.25);
    });
    if (this.particles) this.particles.rotation.z += delta * 0.02 * (1 + this.ringSpeed);
    this.updateBars(time);

    this.renderer.render(this.scene, this.camera);
    this.onFirstFrame?.();
    this.onFirstFrame = undefined;

    this.fpsFrames += 1;
    if (now - this.fpsStart >= 1000) {
      this.onFrameRate?.(Math.round((this.fpsFrames * 1000) / (now - this.fpsStart)));
      this.fpsFrames = 0;
      this.fpsStart = now;
    }
  };
}
