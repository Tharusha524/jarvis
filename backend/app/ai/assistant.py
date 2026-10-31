"""Connects a user message to the model and keeps the conversation up to date."""

import asyncio
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime

from app.ai.conversation import Conversation
from app.ai.language import Language, detect_language
from app.ai.ollama_client import ChatStats, OllamaClient
from app.ai.prompts import build_system_prompt
from app.ai.singlish import singlish_to_sinhala
from app.ai.translator import SentenceBuffer, Translator
from app.config.preferences import Preferences
from app.config.settings import Settings

logger = logging.getLogger(__name__)

MODEL_PREFERENCE = "active_model"


class AssistantBusy(Exception):
    """A reply is already being written."""


@dataclass(frozen=True)
class ReplyInfo:
    language: Language
    stats: ChatStats | None


class Assistant:
    def __init__(self, client: OllamaClient, settings: Settings, preferences: Preferences, translator: Translator) -> None:
        self._client = client
        self._settings = settings
        self._preferences = preferences
        self._translator = translator
        self._lock = asyncio.Lock()
        self.conversation = Conversation()

    @property
    def active_model(self) -> str:
        return self._preferences.get(MODEL_PREFERENCE) or self._settings.default_model

    def set_model(self, name: str) -> None:
        self._preferences.set(MODEL_PREFERENCE, name)

    @property
    def is_busy(self) -> bool:
        return self._lock.locked()

    async def _to_english(self, message: str, language: Language) -> str:
        sinhala = singlish_to_sinhala(message) if language == "singlish" else message
        english = await self._translator.translate(sinhala, "sinhala", "english")
        logger.info("Understood %s as: %s", language, english)
        return english

    async def _stream_model(self, stats: list[ChatStats], system: str) -> AsyncIterator[str]:
        messages = [{"role": "system", "content": system}, *self.conversation.messages()]
        options = {"num_ctx": self._settings.context_tokens, "num_thread": self._settings.cpu_threads}
        async for piece in self._client.chat_stream(self.active_model, messages, options, self._settings.keep_alive, stats):
            yield piece

    async def reply(self, message: str, info: list[ReplyInfo]) -> AsyncIterator[str]:
        """Streams the reply. If the user stops it, the part written so far is kept.

        Sinhala and Singlish go through the translator, because the AI model
        reasons far better in English. The conversation is remembered in English.
        """
        if self.is_busy:
            raise AssistantBusy
        async with self._lock:
            language = detect_language(message)
            translated = language != "english" and self._translator.available
            self.conversation.add("user", await self._to_english(message, language) if translated else message)
            system = build_system_prompt(language, datetime.now(), translated)

            pieces: list[str] = []
            stats: list[ChatStats] = []
            buffer = SentenceBuffer()
            try:
                async for piece in self._stream_model(stats, system):
                    pieces.append(piece)
                    if not translated:
                        yield piece
                        continue
                    for sentence in buffer.push(piece):
                        yield await self._translator.translate(sentence, "english", "sinhala") + " "
                if translated:
                    for sentence in buffer.flush():
                        yield await self._translator.translate(sentence, "english", "sinhala")
            finally:
                if pieces:
                    self.conversation.add("assistant", "".join(pieces))
                else:
                    # A failed message would confuse the model on the next try.
                    self.conversation.forget_last_user_turn()
                info.append(ReplyInfo(language, stats[0] if stats else None))
                logger.info("Reply finished: language=%s, stats=%s", language, stats)
