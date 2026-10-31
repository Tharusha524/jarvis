"""Tests Singlish understanding: Singlish, then Sinhala script, then English.

Not part of pytest because it needs the translation model:
    python tests/live_singlish_check.py
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.singlish import singlish_to_sinhala  # noqa: E402
from app.ai.translator import Translator  # noqa: E402
from app.config.settings import MODELS_DIR, load_settings  # noqa: E402

CASES = [
    ("jarvis mata asiyanu aliyage wisthara tikk kiyanna", "tell me details about the Asian elephant"),
    ("oya kohomada?", "how are you"),
    ("Python kiyanne mokakda?", "what is Python"),
    ("VS Code eka open karanna puluwanda?", "can you open VS Code"),
    ("mata ada kalaguna kiyanna", "tell me today's weather"),
    ("lankawe digama ganga mokakda", "longest river in Sri Lanka"),
    ("oyage nama mokakda", "what is your name"),
    ("mama heta colombo yanawa", "I am going to Colombo tomorrow"),
    ("chrome eka open karanna", "open Chrome"),
    ("machine learning gana podi wisthara ekak denna", "give a short explanation of machine learning"),
    # Not written with the word list in mind.
    ("lankawe janagahanaya keeyada", "population of Sri Lanka"),
    ("mata bada gini", "I am hungry"),
    ("sigiriya gana kiyanna", "tell me about Sigiriya"),
    ("heta wahinawada", "will it rain tomorrow"),
    ("amma gedara innawa", "mother is at home"),
    ("mata potha denna", "give me the book"),
    ("oya kawda", "who are you"),
    ("rata gana podi kathawak kiyanna", "tell a short story about a country"),
]


async def main() -> None:
    translator = Translator(MODELS_DIR / "nllb-600m", load_settings().cpu_threads)
    for question, meaning in CASES:
        started = time.perf_counter()
        sinhala = singlish_to_sinhala(question)
        english = await translator.translate(sinhala, "sinhala", "english")
        print(f"{question}\n  sinhala: {sinhala}\n  wanted:  {meaning}\n  got:     {english}  [{time.perf_counter() - started:.1f}s]", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
