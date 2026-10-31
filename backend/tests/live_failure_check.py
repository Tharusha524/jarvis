"""Real failure test: starts its own backend and stops Ollama on purpose.

Not part of pytest. Close JARVIS first, then run:
    python tests/live_failure_check.py
"""

import json
import os
import subprocess
import sys
import time

import httpx

BASE = "http://127.0.0.1:8765"
PYTHON = sys.executable
START = [PYTHON, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8765", "--log-level", "warning"]


def start_backend(**env: str) -> subprocess.Popen:
    process = subprocess.Popen(START, env={**os.environ, **env}, stdin=subprocess.PIPE)
    for _ in range(60):
        try:
            httpx.get(f"{BASE}/health", timeout=1)
            return process
        except httpx.HTTPError:
            time.sleep(0.5)
    raise RuntimeError("Backend did not start")


def stop_ollama() -> None:
    subprocess.run(["taskkill", "/F", "/IM", "ollama.exe"], capture_output=True)
    subprocess.run(["taskkill", "/F", "/IM", "llama-server.exe"], capture_output=True)


def status() -> dict:
    return httpx.get(f"{BASE}/ai/status", timeout=5).json()


def chat_events(message: str) -> list[dict]:
    with httpx.stream("POST", f"{BASE}/chat/stream", json={"message": message}, timeout=200) as response:
        return [json.loads(line) for line in response.iter_lines() if line]


def wait_for_ollama(seconds: int = 30) -> bool:
    for _ in range(seconds * 2):
        if status()["ollamaRunning"]:
            return True
        time.sleep(0.5)
    return False


def main() -> None:
    stop_ollama()

    print("--- Ollama not installed ---")
    backend = start_backend(JARVIS_OLLAMA_EXE=r"D:\does\not\exist\ollama.exe")
    time.sleep(1)
    current = status()
    print("found:", current["ollamaFound"], "running:", current["ollamaRunning"])
    print("chat answer:", chat_events("hello")[-1])
    print("memory stays clean:", httpx.get(f"{BASE}/chat/history").json() == [])
    backend.stdin.close()
    backend.terminate()
    backend.wait(10)
    time.sleep(1)

    print("--- Ollama crashes, then recovers ---")
    backend = start_backend()
    print("started by itself:", wait_for_ollama())
    stop_ollama()
    time.sleep(1)
    print("chat during the crash:", chat_events("hello")[-1])
    print("restarted by itself:", wait_for_ollama())
    print("chat after recovery:", chat_events("Say the word ready.")[-1])

    backend.terminate()
    backend.wait(10)
    stop_ollama()


if __name__ == "__main__":
    main()
