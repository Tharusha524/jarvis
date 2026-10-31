"""Offline translation between Sinhala and English with the NLLB model.

Small AI models write Sinhala badly, so JARVIS thinks in English and this turns
questions and answers across. NLLB's licence is non-commercial only, which
suits a personal assistant but rules out selling the app with it.
"""

import asyncio
import logging
import re
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

TranslatorLanguage = Literal["english", "sinhala"]

LANGUAGE_CODES: dict[TranslatorLanguage, str] = {"english": "eng_Latn", "sinhala": "sin_Sinh"}

# Long text loses quality, so it is translated a sentence at a time.
SENTENCE_END = re.compile(r"(?<=[.!?।])\s+|\n+")

# The tokenizer drops the invisible joiner in Sinhala letters such as the first
# letter of Sri Lanka, leaving a stray space. These joins are safe to restore,
# because almost no real word boundary looks like them.
_JOINER = "‍"
_HAL = "්"
_BROKEN_LETTERS = re.compile(
    f"(?:(?<=[පදශගබධත]){_HAL} (?=ර))"
    f"|(?:(?<=ක){_HAL} (?=ර[මිී]))"
    f"|(?:(?<=[දශව]){_HAL} (?=ය))"
    f"|(?:(?<=ත){_HAL} (?=යා|යව))"
)


def repair_sinhala(text: str) -> str:
    return _BROKEN_LETTERS.sub(_HAL + _JOINER, text)


class TranslationUnavailable(Exception):
    """The translation model is missing."""


def split_sentences(text: str) -> list[str]:
    return [part.strip() for part in SENTENCE_END.split(text) if part.strip()]


class SentenceBuffer:
    """Collects streamed text and releases it one finished sentence at a time."""

    _END = re.compile(r"[.!?][\"'’)\]]*\s|\n")

    def __init__(self) -> None:
        self._text = ""

    def push(self, piece: str) -> list[str]:
        self._text += piece
        sentences = []
        while match := self._END.search(self._text):
            sentence = self._text[: match.end()].strip()
            self._text = self._text[match.end() :]
            if sentence:
                sentences.append(sentence)
        return sentences

    def flush(self) -> list[str]:
        sentence = self._text.strip()
        self._text = ""
        return [sentence] if sentence else []


class Translator:
    def __init__(self, model_dir: Path, cpu_threads: int) -> None:
        self._model_dir = model_dir
        self._cpu_threads = cpu_threads
        self._model = None
        self._tokenizer = None
        self._lock = asyncio.Lock()

    @property
    def available(self) -> bool:
        return (self._model_dir / "model.bin").exists() and (self._model_dir / "tokenizer.json").exists()

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        import ctranslate2
        from tokenizers import Tokenizer

        logger.info("Loading NLLB from %s", self._model_dir)
        self._tokenizer = Tokenizer.from_file(str(self._model_dir / "tokenizer.json"))
        self._model = ctranslate2.Translator(
            str(self._model_dir), device="cpu", compute_type="int8", intra_threads=self._cpu_threads
        )

    def _translate_sentences(self, sentences: list[str], source: str, target: str) -> list[str]:
        batch = [
            [source, *self._tokenizer.encode(sentence, add_special_tokens=False).tokens, "</s>"]
            for sentence in sentences
        ]
        results = self._model.translate_batch(
            batch,
            target_prefix=[[target]] * len(batch),
            beam_size=4,
            max_decoding_length=200,
            repetition_penalty=1.15,
            no_repeat_ngram_size=4,
        )
        translated = []
        for result in results:
            tokens = result.hypotheses[0][1:]
            ids = [self._tokenizer.token_to_id(token) for token in tokens]
            translated.append(self._tokenizer.decode([token for token in ids if token is not None]))
        return translated

    def _run(self, text: str, source: TranslatorLanguage, target: TranslatorLanguage) -> str:
        self._ensure_loaded()
        sentences = split_sentences(text)
        if not sentences:
            return ""
        translated = " ".join(self._translate_sentences(sentences, LANGUAGE_CODES[source], LANGUAGE_CODES[target]))
        return repair_sinhala(translated) if target == "sinhala" else translated

    async def translate(self, text: str, source: TranslatorLanguage, target: TranslatorLanguage) -> str:
        if not self.available:
            raise TranslationUnavailable("The translation model is not installed.")
        async with self._lock:
            return await asyncio.to_thread(self._run, text, source, target)
