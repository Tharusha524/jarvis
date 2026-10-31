"""Real conversation test against a running backend and Ollama.

Not part of pytest because it needs a downloaded model. Start the backend, then run:
    python tests/live_chat_check.py gemma3:1b
"""

import json
import sys
import time

import httpx

BASE = "http://127.0.0.1:8765"
QUESTIONS = [
    "What is machine learning?",
    "Explain a Python list in one sentence.",
    "My favourite colour is green. Please remember that.",
    "What is my favourite colour?",
    "jarvis mata asiyanu aliyage wisthara tikk kiyanna",
    "මට අද කාලගුණය කියන්න.",
    "ශ්‍රී ලංකාවේ අගනුවර කුමක්ද?",
    "Jarvis, VS Code eka open karanna.",
    "Open Chrome for me.",
]


def ask(client: httpx.Client, question: str, stop_after: int | None = None) -> None:
    print(f"\nUSER: {question}", flush=True)
    started = time.perf_counter()
    first = None
    text = ""
    pieces = 0
    with client.stream("POST", f"{BASE}/chat/stream", json={"message": question}, timeout=600) as response:
        for line in response.iter_lines():
            if not line:
                continue
            event = json.loads(line)
            if event["type"] == "token":
                first = first or time.perf_counter() - started
                text += event["text"]
                pieces += 1
                if stop_after and pieces >= stop_after:
                    print(f"JARVIS (stopped after {pieces} pieces): {text}", flush=True)
                    return
            elif event["type"] == "done":
                speed = event["tokensPerSecond"]
                print(f"JARVIS: {text}")
                print(f"  [language={event['language']} first word {first:.1f}s, total {event['seconds']}s, {speed:.1f} tokens/s]", flush=True)
            else:
                print(f"ERROR: {event}", flush=True)


def main() -> None:
    model = sys.argv[1]
    with httpx.Client() as client:
        client.delete(f"{BASE}/chat/history")
        print(client.put(f"{BASE}/ai/model", json={"name": model}).json())
        print(client.get(f"{BASE}/ai/status").json())
        for question in QUESTIONS:
            ask(client, question)

        print("\n--- stopping a reply part way ---")
        ask(client, "Write a long story about a robot.", stop_after=8)
        time.sleep(1.5)
        history = client.get(f"{BASE}/chat/history").json()
        print("kept partial reply:", history[-1]["role"] == "assistant", "| still busy:", client.delete(f"{BASE}/chat/history").status_code == 409)


if __name__ == "__main__":
    main()
