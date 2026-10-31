"""Talks to the local Ollama server. Nothing here uses the internet."""

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx


class OllamaError(Exception):
    """Ollama answered with a problem."""


class OllamaUnavailable(OllamaError):
    """Ollama is not running or cannot be reached."""


class ModelNotInstalled(OllamaError):
    """The chosen model has not been downloaded."""


@dataclass(frozen=True)
class ChatStats:
    prompt_tokens: int
    reply_tokens: int
    seconds: float
    # Writing time only. `seconds` also includes loading the model.
    writing_seconds: float


class OllamaClient:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        # Reading stays patient: loading a model from the hard disk is slow.
        self._client = httpx.AsyncClient(
            base_url=base_url,
            transport=transport,
            timeout=httpx.Timeout(connect=2.0, read=300.0, write=30.0, pool=5.0),
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _get_json(self, path: str) -> dict:
        try:
            response = await self._client.get(path, timeout=3.0)
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            raise OllamaError(f"Ollama answered with status {error.response.status_code}") from error
        except httpx.HTTPError as error:
            raise OllamaUnavailable("Ollama is not running") from error
        return response.json()

    async def version(self) -> str:
        return (await self._get_json("/api/version")).get("version", "unknown")

    async def list_models(self) -> list[str]:
        data = await self._get_json("/api/tags")
        return sorted(model["name"] for model in data.get("models", []))

    async def chat_stream(
        self,
        model: str,
        messages: list[dict[str, str]],
        options: dict[str, int],
        keep_alive: str,
        stats: list[ChatStats],
    ) -> AsyncIterator[str]:
        """Yields the reply piece by piece, then appends its numbers to `stats`."""
        body = {
            "model": model,
            "messages": messages,
            "stream": True,
            "think": False,
            "options": options,
            "keep_alive": keep_alive,
        }
        try:
            async with self._client.stream("POST", "/api/chat", json=body) as response:
                if response.status_code == 404:
                    raise ModelNotInstalled(f"The model {model} is not installed")
                if response.status_code >= 400:
                    detail = (await response.aread()).decode("utf-8", "replace")[:300]
                    raise OllamaError(f"Ollama could not answer: {detail}")

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    chunk = json.loads(line)
                    if "error" in chunk:
                        raise OllamaError(str(chunk["error"]))
                    text = chunk.get("message", {}).get("content", "")
                    if text:
                        yield text
                    if chunk.get("done"):
                        stats.append(
                            ChatStats(
                                prompt_tokens=chunk.get("prompt_eval_count", 0),
                                reply_tokens=chunk.get("eval_count", 0),
                                seconds=chunk.get("total_duration", 0) / 1e9,
                                writing_seconds=chunk.get("eval_duration", 0) / 1e9,
                            )
                        )
        except httpx.TransportError as error:
            raise OllamaUnavailable("Lost the connection to Ollama") from error
