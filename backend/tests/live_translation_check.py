"""Tests translation quality, then translation with the AI model in the middle.

Not part of pytest because it needs downloaded models. Ollama must be running:
    python tests/live_translation_check.py gemma3:4b
"""

import asyncio
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.prompts import build_system_prompt  # noqa: E402
from app.ai.translator import Translator  # noqa: E402
from app.config.settings import MODELS_DIR, load_settings  # noqa: E402

OLLAMA = "http://127.0.0.1:11434"
TO_ENGLISH = [
    "ආසියානු අලියා ගැන විස්තර කියන්න.",
    "ශ්‍රී ලංකාවේ දිගම ගඟ කුමක්ද?",
    "මට අද කාලගුණය කියන්න.",
    "ඔයාට කොහොමද?",
    "පයිතන් කියන්නේ මොකක්ද?",
]
TO_SINHALA = [
    "Good evening, sir. How can I help you?",
    "Asian elephants are smaller than African elephants and live in South and Southeast Asia.",
    "I cannot open applications yet.",
    "Python is a popular programming language that is easy to learn.",
]


def ask_ai(model: str, question: str) -> str:
    response = httpx.post(
        f"{OLLAMA}/api/chat",
        timeout=300,
        json={
            "model": model,
            "stream": False,
            "think": False,
            "options": {"num_ctx": 4096, "num_thread": 4, "num_predict": 120},
            "messages": [
                {"role": "system", "content": build_system_prompt("english", datetime.now())},
                {"role": "user", "content": question},
            ],
        },
    )
    return response.json()["message"]["content"]


async def main() -> None:
    translator = Translator(MODELS_DIR / "nllb-600m", load_settings().cpu_threads)

    print("--- Sinhala to English ---")
    for text in TO_ENGLISH:
        started = time.perf_counter()
        print(f"{text}\n  -> {await translator.translate(text, 'sinhala', 'english')}  [{time.perf_counter() - started:.1f}s]", flush=True)

    print("\n--- English to Sinhala ---")
    for text in TO_SINHALA:
        started = time.perf_counter()
        print(f"{text}\n  -> {await translator.translate(text, 'english', 'sinhala')}  [{time.perf_counter() - started:.1f}s]", flush=True)

    if len(sys.argv) > 1:
        print("\n--- Whole path: Sinhala, English, AI, Sinhala ---")
        for question in TO_ENGLISH[:2] + TO_ENGLISH[4:]:
            started = time.perf_counter()
            english = await translator.translate(question, "sinhala", "english")
            answer = ask_ai(sys.argv[1], english)
            sinhala = await translator.translate(answer, "english", "sinhala")
            print(f"USER: {question}\nAS ENGLISH: {english}\nAI: {answer}\nJARVIS: {sinhala}\n  [{time.perf_counter() - started:.1f}s]\n", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
