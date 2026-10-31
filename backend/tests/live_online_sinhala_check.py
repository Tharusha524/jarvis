"""Tests Google's Sinhala speech service, using the Dilu voice as the speaker.

Not part of pytest because it needs the internet. It sends only these test
sentences:
    python tests/live_online_sinhala_check.py
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.translator import Translator  # noqa: E402
from app.config.settings import MODELS_DIR, load_settings  # noqa: E402
from app.speech.engines import OnlineSinhalaRecognizer, create_engines  # noqa: E402

SENTENCES = [
    "මට ආසියානු අලියා ගැන විස්තර කියන්න.",
    "ශ්‍රී ලංකාවේ දිගම ගඟ මොකක්ද?",
    "අද කාලගුණය කොහොමද?",
    "ඔයාගේ නම මොකක්ද?",
    "පයිතන් කියන්නේ මොකක්ද?",
]


async def main() -> None:
    settings = load_settings()
    _, synthesizer = create_engines(settings)
    translator = Translator(MODELS_DIR / "nllb-600m", settings.cpu_threads)
    recognizer = OnlineSinhalaRecognizer()

    for sentence in SENTENCES:
        audio = await synthesizer.synthesize(sentence)
        started = time.perf_counter()
        heard = await recognizer.transcribe(audio)
        seconds = time.perf_counter() - started
        english = await translator.translate(heard, "sinhala", "english") if heard else ""
        print(f"SAID:  {sentence}\nHEARD: {heard}\n  -> {english}  [{seconds:.1f}s]", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
