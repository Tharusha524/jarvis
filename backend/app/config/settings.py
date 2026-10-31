"""Backend settings. Any value can be overridden with a JARVIS_* variable."""

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
MODELS_DIR = BACKEND_DIR.parent / "models"


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    ollama_url: str
    ollama_exe: Path
    ollama_models_dir: Path
    default_model: str
    data_dir: Path
    # Rough room for the conversation. More memory lets the model recall more,
    # but it uses more RAM and runs slower.
    context_tokens: int
    # Physical cores only. Hyper-threads slow this kind of work down.
    cpu_threads: int
    # How long the model stays in memory after a reply, so the next one is fast.
    keep_alive: str
    whisper_model_dir: Path
    piper_voice: Path
    piper_voice_sinhala: Path
    translator_dir: Path


def load_settings() -> Settings:
    return Settings(
        host=os.getenv("JARVIS_HOST", "127.0.0.1"),
        port=int(os.getenv("JARVIS_PORT", "8765")),
        ollama_url=os.getenv("JARVIS_OLLAMA_URL", "http://127.0.0.1:11434"),
        ollama_exe=Path(os.getenv("JARVIS_OLLAMA_EXE", r"D:\devtools\ollama\ollama.exe")),
        ollama_models_dir=Path(os.getenv("JARVIS_OLLAMA_MODELS", r"D:\devtools\ollama\models")),
        default_model=os.getenv("JARVIS_MODEL", "gemma3:4b"),
        data_dir=Path(os.getenv("JARVIS_DATA_DIR", str(BACKEND_DIR / "data"))),
        context_tokens=int(os.getenv("JARVIS_CONTEXT_TOKENS", "4096")),
        cpu_threads=int(os.getenv("JARVIS_CPU_THREADS", "4")),
        keep_alive=os.getenv("JARVIS_KEEP_ALIVE", "10m"),
        whisper_model_dir=Path(os.getenv("JARVIS_WHISPER_DIR", str(MODELS_DIR / "whisper-small.en"))),
        piper_voice=Path(os.getenv("JARVIS_PIPER_VOICE", str(MODELS_DIR / "piper/en/en_US/lessac/medium/en_US-lessac-medium.onnx"))),
        piper_voice_sinhala=Path(os.getenv("JARVIS_PIPER_VOICE_SI", str(MODELS_DIR / "piper-dilu/onnx/si_LK-dilu-medium.onnx"))),
        translator_dir=Path(os.getenv("JARVIS_TRANSLATOR_DIR", str(MODELS_DIR / "nllb-600m"))),
    )
