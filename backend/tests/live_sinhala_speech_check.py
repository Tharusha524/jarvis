"""Tests hearing Sinhala: the Dilu voice speaks and multi-language Whisper listens.

Not part of pytest because it needs the speech models:
    python tests/live_sinhala_speech_check.py
"""

import asyncio
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from faster_whisper import WhisperModel  # noqa: E402

from app.ai.translator import Translator  # noqa: E402
from app.config.settings import MODELS_DIR, load_settings  # noqa: E402
from app.speech.engines import create_engines  # noqa: E402

SINHALA = [
    "මට ආසියානු අලියා ගැන විස්තර කියන්න.",
    "ශ්‍රී ලංකාවේ දිගම ගඟ මොකක්ද?",
    "අද කාලගුණය කොහොමද?",
    "ඔයාගේ නම මොකක්ද?",
    "පයිතන් කියන්නේ මොකක්ද?",
]
ENGLISH = ["What is machine learning?", "The Asian elephant is smaller than the African elephant."]


async def main() -> None:
    settings = load_settings()
    _, synthesizer = create_engines(settings)
    translator = Translator(MODELS_DIR / "nllb-600m", settings.cpu_threads)
    model = WhisperModel(str(MODELS_DIR / "whisper-small"), device="cpu", compute_type="int8", cpu_threads=settings.cpu_threads)

    for sentence in SINHALA + ENGLISH:
        audio = await synthesizer.synthesize(sentence)
        started = time.perf_counter()
        pieces, info = model.transcribe(
            io.BytesIO(audio),
            language=None,
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        heard = " ".join(piece.text.strip() for piece in pieces)
        seconds = time.perf_counter() - started
        print(f"SAID:  {sentence}\nHEARD: {heard}\n  [language {info.language} {info.language_probability:.2f}, {seconds:.1f}s]", flush=True)

        if sentence in SINHALA:
            pieces, _ = model.transcribe(io.BytesIO(audio), language="si", beam_size=5, vad_filter=True, condition_on_previous_text=False)
            forced = " ".join(piece.text.strip() for piece in pieces)
            print(f"AS SI: {forced}\n  -> {await translator.translate(forced, 'sinhala', 'english')}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
