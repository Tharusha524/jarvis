# Architecture

## Overview

```
Tauri window (Rust)
  └─ Interface (React + Three.js)
        │  Today: Tauri commands for status readings
        │  Milestone 2: local connection to the backend
        ▼
Python backend (FastAPI)       planned
  ├─ Ollama (local AI model)
  ├─ SQLite (memory)
  ├─ Speech (Whisper, Piper)
  └─ Controlled tools + permission checks
```

## Decisions

**The face is built from maths, not a downloaded model.** `faceGeometry.ts` sculpts the head and features with formulas, and `circuitTexture.ts` draws the circuit board. This keeps the app small, needs no paid or licensed 3D asset, and gives direct control of the jaw for lip movement. The eyes and mouth opening are drawn in the face shader, so they follow the head with no extra meshes. The style follows a reference picture the user supplied, but no part of that picture is used. The result is a stylized digital face, not a photorealistic person, because a realistic face would take GPU power the AI needs on this laptop.

**React does not draw the animation.** `FaceScene.ts` runs its own drawing loop, and React only tells it the current state. Redrawing React panels 30 times a second would waste CPU.

**Animation has three quality levels.** Each level sets mesh detail, frame rate and resolution. Drawing stops completely when the window is hidden. Medium is the default, and Windows' "reduce animations" setting selects Low.

**Status readings come from Rust.** A browser can't read CPU, memory or disk figures. A small set of read-only Tauri commands provides them.

**Internet status is a real connection test.** The app tries a network connection to public DNS servers every 15 seconds. No data is sent. `navigator.onLine` alone only says a network adapter is connected.

**Local-only permissions.** The window has a strict content security policy and a short allowlist of window actions in `src-tauri/capabilities/default.json`.

**The installer format is NSIS (.exe).** It installs per user without needing administrator rights.

**Disk use.** C: has about 2 GB free, so caches and models stay on D:. D: is a hard disk, so AI models will take longer to load the first time.

## Hardware notes

The project brief lists 8 GB RAM. The computer actually has 15.7 GB, but other apps can leave as little as 3.5 GB free. Model choices in Milestone 2 should still target low memory use.
