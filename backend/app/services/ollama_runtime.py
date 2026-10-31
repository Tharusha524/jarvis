"""Starts the local Ollama server when JARVIS needs it, and stops it afterwards."""

import asyncio
import logging
import os
import subprocess

from app.ai.ollama_client import OllamaClient, OllamaUnavailable
from app.config.settings import Settings

logger = logging.getLogger(__name__)

STARTUP_SECONDS = 15


class OllamaRuntime:
    def __init__(self, client: OllamaClient, settings: Settings) -> None:
        self._client = client
        self._settings = settings
        self._process: subprocess.Popen | None = None
        self._starting = False

    async def _is_running(self) -> bool:
        try:
            await self._client.version()
        except OllamaUnavailable:
            return False
        return True

    async def ensure_started(self) -> None:
        """Leaves an Ollama that is already running alone, and only stops its own."""
        if self._starting:
            return
        self._starting = True
        try:
            await self._start_if_needed()
        finally:
            self._starting = False

    async def _start_if_needed(self) -> None:
        if await self._is_running():
            return
        if not self._settings.ollama_exe.exists():
            logger.warning("Ollama was not found at %s", self._settings.ollama_exe)
            return

        environment = {
            **os.environ,
            "OLLAMA_MODELS": str(self._settings.ollama_models_dir),
            # Two models in memory at once would use most of the free RAM.
            "OLLAMA_MAX_LOADED_MODELS": "1",
        }
        self._process = subprocess.Popen(
            [str(self._settings.ollama_exe), "serve"],
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        for _ in range(STARTUP_SECONDS * 2):
            if await self._is_running():
                logger.info("Ollama started")
                return
            await asyncio.sleep(0.5)
        logger.error("Ollama did not start in time")

    def stop(self) -> None:
        if self._process and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None
