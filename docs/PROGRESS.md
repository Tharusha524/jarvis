# Development progress

## Environment (checked 2026-10-31)

| Item | Result |
|---|---|
| OS | Windows 10 Pro 64-bit, build 19045 |
| CPU and graphics | Intel i5-1135G7, Iris Xe |
| RAM | 15.7 GB |
| Python | 3.11.9 (use this one, not the 3.14 launcher) |
| Node and npm | 22.16.0 and 10.9.2 |
| Rust | 1.98.1, stored in `D:\devtools` |
| Ollama | Not installed |
| ffmpeg | Not installed |
| C: free space | About 2 GB, so nothing large should go here |
| D: free space | About 408 GB, on a hard disk |

## Milestone 1: interface and face

**Status: done, pending your own check of the real microphone.**

Built:

- Project structure, Tauri 2 desktop app, React and TypeScript interface
- Holographic 3D face, audio ring and six visual states
- Live status panels and animation quality setting
- Real microphone level input
- App icon

Test results:

- Type check: passed
- Unit tests: 21 passed
- Rust tests: 3 passed
- Browser test of every control: passed
- Desktop window test: passed

Measured in the desktop window on this laptop's Iris Xe:

| Quality | Frames per second |
|---|---|
| High | 60 |
| Medium (default) | 30 |
| Low | 20 |

Memory use was 530 to 560 MB in the release build after the face rebuild, including the WebView2 processes. It was 422 MB with the old face. The release `jarvis.exe` is 4.2 MB. Switching to High pauses for about 3 to 4 seconds the first time, then holds 60 FPS.

Disk use: Rust build files take 6.1 GB on D:. C: free space fell from 2.17 GB to 2.04 GB during this milestone.

Known gaps:

- **Microphone found already on during tests (solved):** the click recorder in the desktop test logged real clicks on the window at moments when the test wasn't clicking, so a person using the window caused this. The microphone doesn't turn on by itself. Leave the window alone while `npm run smoke:desktop` runs.
- The real microphone hasn't been used, because tests use a fake one. Windows may show a permission prompt the first time.
- Offline status and the graphics failure message haven't been tested.
- The installer isn't built yet. That's Milestone 6.
- WebView2 keeps a small app data folder on C:, in `%LOCALAPPDATA%\com.jarvis.assistant`.

## Milestone 2: backend and AI chat

**Status: done for typed chat in English. Sinhala and Singlish quality is unresolved and moves to Milestone 3.**

Built:

- Python FastAPI backend on port 8765, chosen so it can't clash with other projects on 8000
- Ollama client with streaming replies, model selection and clear errors
- Short-term conversation memory and language detection
- Conversation screen in the app
- The app starts and stops the backend, and the backend starts and stops Ollama

Decisions:

- **Portable Ollama:** using the zip in `D:\devtools\ollama` instead of the installer. It adds nothing to C:, needs no administrator rights and doesn't run at Windows startup.
- **WebView2 data:** moved to `D:\devtools\jarvis-data\webview`.

Known environment problem: the Windows variable `CURL_CA_BUNDLE` points to a PostgreSQL file that doesn't exist. It breaks `pip` and `curl` downloads. Clear it in the current terminal first with `Remove-Item Env:CURL_CA_BUNDLE`. The system setting was left unchanged.

Must do before Milestone 4: add a private token between the app and the backend. The backend blocks other websites from reading its replies, but it must also reject them outright before it controls the computer.

Real test results with `gemma3:1b` (806 MB):

| Test | Result |
|---|---|
| English answers | Correct and natural, 10 to 17 tokens/s in the first replies |
| First word | Usually about 1 second once the model is loaded, 3 seconds on first load. Slower while another download was running |
| Remembering within a conversation | Passed |
| Refusing what it can't do yet | Passed |
| Stop, Clear and replies in the app window | Passed |
| Sinhala | **Failed.** Garbled text, or weak answers |
| Singlish | **Failed.** Replied in English without answering |

Real test results with `gemma3:4b` (3.1 GB, default model), one fresh question at a time:

| Test | Result |
|---|---|
| English | Good, natural answers at about 10 tokens/s. Facts can still be wrong |
| Memory use | About 4.5 GB while loaded |
| Sinhala script | Writes Sinhala, but **unreliable**. It called the Asian elephant a bird, invented a river fact, and mixed in other alphabets |
| Singlish | **Unreliable.** It understood a VS Code request, but missed the elephant question and "oya kohomada" |
| Speed for Sinhala | About 8.5 tokens/s, so short replies take 10 to 17 seconds |

Conclusion: small local models on this laptop can't be trusted for Sinhala. Milestone 3 will test a separate offline translation model (NLLB) between Sinhala and English, so the AI can think in English, which it does well.

Failure and shutdown tests with real Ollama:

| Test | Result |
|---|---|
| App starts the backend, and the backend starts Ollama | Passed |
| Closing the app stops the backend, Ollama and the model | Passed |
| Ollama missing | Clear error, and a failed message isn't kept in memory |
| Ollama crashes while the backend runs | Clear error, then it restarts by itself and chat works again |
| Drawing while minimized | Stops: 0 draws in 2 seconds |

Not tested: using JARVIS with the internet actually turned off. The AI runs only on this computer, so it shouldn't matter, but that isn't proven yet.

## Milestone 3: voice

**Status: in progress. English voice works in the app with a recorded voice. The real microphone is not tested yet.**

Built:

- Speech recognition with faster-whisper
- Spoken replies with Piper (`en_US-lessac-medium`, 60 MB, in `models/piper`)
- Automatic detection of when speech starts and ends, with a short buffer so first words aren't cut off
- Replies spoken sentence by sentence, and code blocks skipped
- Speaking over JARVIS stops him, using a stricter loudness rule
- The face and audio ring follow the real voice
- Sinhala text is refused by the English voice, instead of making nonsense sounds

Test results:

| Test | Result |
|---|---|
| Piper voice read back by Whisper | 4 of 4 sentences word for word |
| Speed once loaded | Voice under 0.2 seconds per sentence, hearing about 0.7 to 1 second |
| First use | Voice about 6 seconds, hearing about 8 seconds, because the models load from the hard disk |
| Full loop in the app: hear, think, answer, speak, listen again | Passed once, using a recorded voice as a pretend microphone |

After the first real-voice try, the user reported wrong words and being cut off, so these changed:

- Speech model is now `small.en` (464 MB, in `models/whisper-small.en`), with `beam_size=5` and a vocabulary hint.
- Silence before a sentence ends rose from 0.8 to 1.4 seconds, and a fading voice keeps counting as speech.
- Speech models now load when the microphone turns on.
- Hearing now takes about 3.3 seconds per sentence, up from about 0.7. Test sentences are still word for word, but those use a computer voice, so the real improvement is not measured.
- The first typed reply took up to 80 seconds after a cold start, because the AI model loads from the hard disk.

Bugs found and fixed by the full test:

- The detector checked loudness too often and never heard a whole word. It now uses 20 ms windows.
- A pipe the backend waited on froze speech model loading when the app started it. The backend now watches the app's process instead, which also covers crashes.

Not tested yet:

- Your real voice and microphone. The tests used a clean computer voice.
- Interrupting JARVIS while he speaks. The detector has unit tests, but it hasn't been tried with real audio, and speaker sound reaching the microphone could cause false interruptions.

Licence notes: the Piper voice's data comes from the Blizzard Lessac dataset, whose licence hasn't been read yet. NLLB is non-commercial only. Both are fine to evaluate for a personal assistant, but check them before sharing the app.

Sinhala and Singlish:

The AI reasons badly in Sinhala, so JARVIS now thinks in English. Sinhala is translated to English, the AI answers, and the answer is translated back one sentence at a time. The conversation is remembered in English.

| Part | Choice | Result |
|---|---|---|
| Translation | NLLB 600M int8, 594 MB, offline | 5 of 5 Sinhala questions translated correctly, usually under 1 second |
| Singlish | Word list plus sound rules into Sinhala script, then NLLB | 16 of 18 correct. Asking the AI to read Singlish directly got about 3 of 10 |
| Your elephant question | Singlish, in the backend | Real Sinhala answer about Asian elephants |
| Reply time | | About 8 to 25 seconds once loaded. 151 seconds on a completely cold start |
| Sinhala voice | Dilu TTS, Piper, 61 MB, MIT | Produces audio. A person still has to judge how it sounds |
| Hearing Sinhala | faster-whisper `small`, 464 MB | **Failed.** Nonsense text and over a minute per sentence, using the Dilu voice as test audio |

Known weak spots: facts can still be wrong, and some joined Sinhala letters still show a stray space. Words not in the Singlish list can be misread.

Decision: Sinhala speech recognition uses Google's free online speech service, chosen by the user. Offline Sinhala-trained models are 922 MB each and report about 50 to 60% of words wrong. English listening stays offline.

- Voice language is a switch in the app, and it starts on English.
- Audio only goes to Google while the switch is on Sinhala, and the screen says so.
- With no internet, JARVIS says Sinhala listening needs the internet and suggests typing.
- The service is unofficial and could stop working.

Test with the Dilu voice as the speaker: 5 of 5 sentences heard almost word for word, in about 1 second each. That also suggests the Dilu voice is clear. A small correction list covers two slips that changed the meaning after translation.

Next:

1. Test the voice language switch in the app window.
2. Test English and Sinhala with the real microphone.
3. Test Sinhala replies spoken aloud in the app.
