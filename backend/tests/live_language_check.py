"""Tests one model on single fresh questions, talking to Ollama directly.

Not part of pytest because it needs a downloaded model:
    python tests/live_language_check.py gemma3:4b
"""

import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.language import detect_language  # noqa: E402
from app.ai.prompts import build_system_prompt  # noqa: E402

OLLAMA = "http://127.0.0.1:11434"
QUESTIONS = [
    "Tell me about Asian elephants.",
    "jarvis mata asiyanu aliyage wisthara tikk kiyanna",
    "ආසියානු අලියා ගැන විස්තර කියන්න.",
    "ශ්‍රී ලංකාවේ දිගම ගඟ කුමක්ද?",
    "oya kohomada?",
    "Python kiyanne mokakda?",
    "VS Code eka open karanna puluwanda?",
]


def main() -> None:
    model = sys.argv[1]
    with httpx.Client(timeout=300) as client:
        loaded = client.get(f"{OLLAMA}/api/ps").json().get("models", [])
        for other in loaded:
            if other["name"] != model:
                client.post(f"{OLLAMA}/api/generate", json={"model": other["name"], "keep_alive": 0})
                print("unloaded", other["name"])

        for question in QUESTIONS:
            system = build_system_prompt(detect_language(question), datetime.now())
            started = time.perf_counter()
            answer = client.post(
                f"{OLLAMA}/api/chat",
                json={
                    "model": model,
                    "stream": False,
                    "think": False,
                    "keep_alive": "10m",
                    "options": {"num_ctx": 4096, "num_thread": 4, "num_predict": 120},
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": question}],
                },
            ).json()
            seconds = time.perf_counter() - started
            speed = answer["eval_count"] / (answer["eval_duration"] / 1e9)
            print(f"\nUSER: {question}\nJARVIS: {answer['message']['content']}\n  [{seconds:.1f}s total, {speed:.1f} tokens/s]", flush=True)


if __name__ == "__main__":
    main()
