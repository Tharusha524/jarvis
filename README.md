# JARVIS – Personal AI Desktop Assistant

A futuristic Windows desktop assistant with a 3D holographic face. The goal is a local AI that talks in English, Sinhala and Singlish, and controls the computer through safe, permission-checked tools.

**Current status: Milestone 3 in progress.** Typed chat and English voice work. Sinhala and Singlish replies are unreliable so far, and there is no Sinhala voice or computer control yet. See [docs/FEATURES.md](docs/FEATURES.md) for exactly what works and [docs/PROGRESS.md](docs/PROGRESS.md) for the development log.

## What you need

| Tool | Version used | Needed for |
|---|---|---|
| Node.js | 22.16 | Interface |
| Rust | 1.98 | Desktop app |
| Visual Studio Build Tools | 2022 | Compiling Rust on Windows |
| WebView2 | Included with Windows | Displaying the interface |
| Python | 3.11 | AI backend |
| Ollama | 0.40.13, in `D:\devtools\ollama` | Running AI models |
| `gemma3:4b` | 3.1 GB, in `D:\devtools\ollama\models` | Main AI model |

## First-time setup

Run these in PowerShell. The first line clears a broken certificate setting for this window only.

```powershell
Remove-Item Env:CURL_CA_BUNDLE -ErrorAction SilentlyContinue
cd D:\javis\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
cd ..\frontend
npm install
```

To download another AI model, run this while JARVIS is open:

```powershell
$env:OLLAMA_MODELS = "D:\devtools\ollama\models"
D:\devtools\ollama\ollama.exe pull gemma3:4b
```

## Run the desktop app

To use the built app, double-click `D:\javis\frontend\src-tauri\target\release\jarvis.exe`. It starts the backend and Ollama by itself, and stops them when closed. If you minimize it, they keep running.

For development, run:

```powershell
cd D:\javis\frontend
npm run tauri dev
```

The first run compiles Rust and takes several minutes. Later runs start in seconds. The first AI reply after opening takes about 25 seconds, because the model loads from the hard disk.

## Run the tests

From `D:\javis\frontend`:

```powershell
npm run typecheck     # checks the TypeScript code
npm test              # unit tests for the interface logic
npm run smoke         # opens Chrome and presses every button
npm run smoke:desktop # opens the real app window and tests it
```

Rust tests, from `D:\javis\frontend\src-tauri`:

```powershell
cargo test
```

Backend tests, from `D:\javis\backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest                                # no model needed
.\.venv\Scripts\python.exe tests\live_chat_check.py gemma3:4b       # real chat, needs JARVIS open
.\.venv\Scripts\python.exe tests\live_language_check.py gemma3:4b   # language quality, needs Ollama running
.\.venv\Scripts\python.exe tests\live_failure_check.py              # stops Ollama on purpose, close JARVIS first
```

`npm run smoke` saves screenshots to `frontend/test-output/`.

## Project layout

```
frontend/             Interface (React, TypeScript, Three.js)
  src/animations/     3D face, rings and state visuals
  src/components/     On-screen panels and controls
  src/hooks/          Clock, microphone, system status, quality setting
  src/services/       Link to the desktop layer, state rules
  src-tauri/          Desktop layer (Rust)
backend/              Python AI backend (FastAPI, port 8765)
  app/ai/             Ollama client, prompts, language detection, conversation
  app/services/       Starts and stops Ollama
  app/config/         Settings and saved choices
models/               Downloaded AI models, not stored in git
resources/            App icon and other assets
docs/                 Architecture, progress and feature list
```

## Disk space

C: is nearly full, so downloads go to D:. The npm cache is set in `frontend/.npmrc`, and Rust already uses `D:\devtools`.
