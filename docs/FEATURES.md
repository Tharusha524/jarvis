# Feature status

**Tested** means an automated check or a person confirmed it. **Not tested** means it was built, but nobody has tried it in real conditions yet.

## Working (Milestone 1)

| Feature | How it was tested |
|---|---|
| Desktop window with custom title bar | Desktop test |
| Minimize, maximize and close buttons | Desktop test |
| Loading animation tied to real startup checks | Browser and desktop tests |
| Sculpted 3D digital face with a glowing circuit head, blinking, and eyes that follow the pointer | Screenshots |
| Glowing wires behind the head, with light pulses | Screenshots |
| Circular audio visualizer | Screenshots |
| Six visual states with their own colours and motion | Browser test, screenshots |
| Live clock and date | Browser test |
| Real CPU, memory and disk readings | Desktop test |
| Real internet status | Desktop test (online only) |
| AI model status (detects that Ollama is not running) | Desktop test |
| Animation quality setting, remembered after restart | Browser test |
| Microphone on and off, with the face reacting to loudness | Fake test microphone only |
| Clear error if the microphone is blocked | Browser test |
| Clear error if 3D graphics fail | Not tested |
| Internet status when offline | Not tested |

## Working (Milestone 2)

| Feature | How it was tested |
|---|---|
| Real AI replies from Ollama in English | Real model, in the app window |
| Stopping a reply, clearing a conversation | Real model, in the app window |
| Choosing a model, remembered after restart | Backend tests, real model |
| Refusing tasks it can't do yet | Real model |
| Ollama starts by itself, and restarts after a crash | Real Ollama |
| Clean shutdown of everything when the app closes | Desktop test |

Sinhala and Singlish replies run but are **not reliable**. See [PROGRESS.md](PROGRESS.md).

| Feature | How it was tested |
|---|---|
| Python backend that starts and stops with the app | Desktop test |
| Backend restarts correctly when the app is reopened quickly | Desktop test |
| Ollama and model status from the backend | Desktop test, backend tests |
| Clear messages when the backend or Ollama is unavailable | Backend tests, browser test |
| Conversation screen: send, stop button present, clear, model picker | Browser test with a pretend backend |
| Short-term conversation memory in RAM | Backend tests |
| Language detection for English, Sinhala and Singlish text | Backend tests |
| Stops drawing while minimized | Desktop test counted the draw calls |

## Working (Milestone 3, English voice)

| Feature | How it was tested |
|---|---|
| Speech recognition in English | Real model, recorded computer voice. Not tested with a real person |
| Spoken replies in English, with the face following the voice | Real model, in the app window |
| Detecting when speech starts and ends | Unit tests, and once in the app |
| Interrupting by speaking | Unit tests only |

## Working (Milestone 3, Sinhala and Singlish)

| Feature | How it was tested |
|---|---|
| Typed Sinhala and Singlish, answered in Sinhala | Real models, through the backend |
| Offline translation with NLLB | Real model |
| Singlish conversion | 16 of 18 test sentences |
| Sinhala voice | Real model. Google could read back what it said. A person hasn't judged it yet |
| Hearing Sinhala through Google (online) | Real service, using the Sinhala voice as the speaker. Not tested with a real person |

## Preview only

These show how a state will look, but nothing real is driving them yet:

| Feature | Real version arrives in |
|---|---|
| Executing state | Milestone 4 |

## Not built yet

| Feature | Milestone |
|---|---|
| AI agent, task planning, Windows control | 4 |
| Memory, internet search, file operations | 5 |
| Permission system and approval dialogs | 6 |
| Full settings screen | 6 |
| Windows installer | 6 |
