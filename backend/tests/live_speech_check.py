"""Real speech test: Piper speaks, Whisper listens, and the words are compared.

Not part of pytest because it needs the speech models. It also saves a WAV file
that the desktop test plays as a pretend microphone:
    python tests/live_speech_check.py ..\\frontend\\test-output\\fake-voice.wav
"""

import asyncio
import io
import sys
import time
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config.settings import load_settings  # noqa: E402
from app.speech.engines import create_engines  # noqa: E402

SENTENCES = [
    "Good evening, sir. All systems are ready.",
    "What is machine learning?",
    "Please explain how a Python list works.",
    "The Asian elephant is smaller than the African elephant.",
]
MICROPHONE_LINE = "What is the capital of France?"


def seconds_of(audio: bytes) -> float:
    with wave.open(io.BytesIO(audio)) as file:
        return file.getnframes() / file.getframerate()


def with_silence(audio: bytes, before: float, after: float) -> bytes:
    with wave.open(io.BytesIO(audio)) as file:
        rate, width, frames = file.getframerate(), file.getsampwidth(), file.readframes(file.getnframes())
    output = io.BytesIO()
    with wave.open(output, "wb") as file:
        file.setnchannels(1)
        file.setsampwidth(width)
        file.setframerate(rate)
        file.writeframes(bytes(int(rate * before) * width) + frames + bytes(int(rate * after) * width))
    return output.getvalue()


async def main() -> None:
    transcriber, synthesizer = create_engines(load_settings())

    for sentence in SENTENCES:
        started = time.perf_counter()
        audio = await synthesizer.synthesize(sentence)
        spoken = time.perf_counter() - started
        started = time.perf_counter()
        text = await transcriber.transcribe(audio)
        heard = time.perf_counter() - started
        print(f"SAID:  {sentence}\nHEARD: {text}")
        print(f"  [{seconds_of(audio):.1f}s of speech, voice took {spoken:.2f}s, hearing took {heard:.2f}s]", flush=True)

    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_bytes(with_silence(await synthesizer.synthesize(MICROPHONE_LINE), 3, 20))
        print("saved", sys.argv[1])


if __name__ == "__main__":
    asyncio.run(main())
