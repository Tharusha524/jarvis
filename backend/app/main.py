"""The JARVIS backend. Run with: python -m uvicorn app.main:app --port 8765"""

import asyncio
import ctypes
import json
import logging
import os
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from ctypes import wintypes
from dataclasses import asdict
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from app.ai.assistant import Assistant, AssistantBusy, ReplyInfo
from app.ai.ollama_client import ModelNotInstalled, OllamaClient, OllamaError, OllamaUnavailable
from app.ai.translator import Translator
from app.config.preferences import Preferences
from app.config.settings import Settings, load_settings
from app.services.ollama_runtime import OllamaRuntime
from app.speech.engines import OnlineSinhalaRecognizer, SpeechUnavailable, Synthesizer, Transcriber, create_engines

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

# Only the JARVIS window may call this server, not websites in a browser.
ALLOWED_ORIGINS = ["http://127.0.0.1:1420", "http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"]

SYNCHRONIZE = 0x00100000
WAIT_FOREVER = 0xFFFFFFFF
MAX_MESSAGE_CHARACTERS = 4000
MAX_AUDIO_BYTES = 12_000_000
MAX_SPOKEN_CHARACTERS = 1000


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARACTERS)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_SPOKEN_CHARACTERS)


class ModelRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


def _event(**fields: object) -> bytes:
    return (json.dumps(fields, ensure_ascii=False) + "\n").encode("utf-8")


def _error_event(error: OllamaError) -> bytes:
    if isinstance(error, OllamaUnavailable):
        return _event(type="error", code="ollama_unavailable", message="Ollama is not running. Start Ollama, then try again.")
    if isinstance(error, ModelNotInstalled):
        return _event(type="error", code="model_missing", message=f"{error}. Download it with: ollama pull <model name>")
    return _event(type="error", code="ollama_error", message=str(error))


def create_app(
    settings: Settings | None = None,
    client: OllamaClient | None = None,
    start_ollama: bool = True,
    speech: tuple[Transcriber, Synthesizer] | None = None,
    translator: Translator | None = None,
    sinhala_recognizer: OnlineSinhalaRecognizer | None = None,
) -> FastAPI:
    config = settings or load_settings()
    ollama = client or OllamaClient(config.ollama_url)
    bridge = translator or Translator(config.translator_dir, config.cpu_threads)
    assistant = Assistant(ollama, config, Preferences(config.data_dir / "preferences.json"), bridge)
    runtime = OllamaRuntime(ollama, config)
    transcriber, synthesizer = speech or create_engines(config)
    sinhala_hearing = sinhala_recognizer or OnlineSinhalaRecognizer()
    background: set[asyncio.Task] = set()

    def stop_when_parent_exits(parent_id: int) -> None:
        # Waiting on the process itself also works if the app crashes. Reading
        # from a pipe instead would freeze model loading on Windows.
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        handle = kernel.OpenProcess(SYNCHRONIZE, False, parent_id)
        if handle:
            kernel.WaitForSingleObject(handle, WAIT_FOREVER)
        logger.info("JARVIS closed, shutting down")
        runtime.stop()
        os._exit(0)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        # Runs in the background, so the health check answers straight away.
        startup = asyncio.create_task(runtime.ensure_started()) if start_ollama else None
        parent_id = os.getenv("JARVIS_PARENT_PID")
        if parent_id:
            threading.Thread(target=stop_when_parent_exits, args=(int(parent_id),), daemon=True).start()
        yield
        if startup:
            startup.cancel()
        runtime.stop()
        await ollama.close()

    app = FastAPI(title="JARVIS backend", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ai/status")
    async def ai_status() -> dict[str, object]:
        try:
            version = await ollama.version()
            models = await ollama.list_models()
        except OllamaError:
            # Covers a crash after startup. It does nothing if a start is under way.
            if start_ollama:
                background.add(asyncio.create_task(runtime.ensure_started()))
                background.difference_update({task for task in background if task.done()})
            return {
                "ollamaRunning": False,
                "ollamaFound": config.ollama_exe.exists(),
                "version": None,
                "models": [],
                "activeModel": assistant.active_model,
                "modelInstalled": False,
            }
        return {
            "ollamaRunning": True,
            "ollamaFound": True,
            "version": version,
            "models": models,
            "activeModel": assistant.active_model,
            "modelInstalled": assistant.active_model in models,
        }

    @app.put("/ai/model")
    async def choose_model(request: ModelRequest) -> dict[str, str]:
        try:
            models = await ollama.list_models()
        except OllamaError as error:
            raise HTTPException(503, "Ollama is not running") from error
        if request.name not in models:
            raise HTTPException(404, f"The model {request.name} is not installed")
        assistant.set_model(request.name)
        return {"activeModel": request.name}

    @app.get("/speech/status")
    async def speech_status() -> dict[str, bool]:
        return {
            "recognition": transcriber.available,
            "voice": synthesizer.available,
            "sinhalaVoice": synthesizer.sinhala_available,
            "translator": bridge.available,
        }

    @app.post("/speech/prepare")
    async def prepare_speech() -> dict[str, str]:
        await asyncio.gather(transcriber.prepare(), synthesizer.prepare())
        return {"status": "ready"}

    @app.post("/speech/transcribe")
    async def transcribe(request: Request, language: Literal["english", "sinhala"] = Query("english")) -> dict[str, str]:
        audio = await request.body()
        if not audio:
            raise HTTPException(400, "No audio was sent")
        if len(audio) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "That recording is too long")
        try:
            engine = sinhala_hearing if language == "sinhala" else transcriber
            return {"text": await engine.transcribe(audio)}
        except SpeechUnavailable as error:
            raise HTTPException(503, str(error)) from error

    @app.post("/speech/synthesize")
    async def synthesize(request: SpeakRequest) -> Response:
        try:
            return Response(await synthesizer.synthesize(request.text), media_type="audio/wav")
        except SpeechUnavailable as error:
            raise HTTPException(503, str(error)) from error

    @app.get("/chat/history")
    async def chat_history() -> list[dict[str, str]]:
        return [asdict(turn) for turn in assistant.conversation.turns()]

    @app.delete("/chat/history")
    async def clear_history() -> dict[str, str]:
        if assistant.is_busy:
            raise HTTPException(409, "JARVIS is still replying")
        assistant.conversation.clear()
        return {"status": "cleared"}

    @app.post("/chat/stream")
    async def chat_stream(request: ChatRequest) -> StreamingResponse:
        if assistant.is_busy:
            raise HTTPException(409, "JARVIS is still replying")

        async def events() -> AsyncIterator[bytes]:
            info: list[ReplyInfo] = []
            try:
                async for piece in assistant.reply(request.message, info):
                    yield _event(type="token", text=piece)
            except AssistantBusy:
                yield _event(type="error", code="busy", message="JARVIS is still replying.")
                return
            except OllamaError as error:
                logger.warning("Chat failed: %s", error)
                yield _error_event(error)
                return

            result = info[0]
            stats = result.stats
            yield _event(
                type="done",
                language=result.language,
                seconds=round(stats.seconds, 1) if stats else 0,
                tokensPerSecond=round(stats.reply_tokens / stats.writing_seconds, 1) if stats and stats.writing_seconds else 0,
            )

        return StreamingResponse(events(), media_type="application/x-ndjson")

    return app


app = create_app()
