"""Offline speech: Whisper turns speech into text, Piper turns text into speech.

Both load on first use, because they take memory and time. They run in a
worker thread, so a long sentence never blocks the rest of the backend.
"""

import asyncio
import io
import logging
import wave
from pathlib import Path

from app.config.settings import Settings

logger = logging.getLogger(__name__)


# Words Whisper would otherwise mishear. Telling it about them improves accuracy.
VOCABULARY = "Jarvis, Visual Studio Code, VS Code, Chrome, File Explorer, Notepad, Python, Sri Lanka."


class SpeechUnavailable(Exception):
    """A speech model is missing or the request can't be done."""


class Transcriber:
    def __init__(self, model_dir: Path, cpu_threads: int) -> None:
        self._model_dir = model_dir
        self._cpu_threads = cpu_threads
        self._model = None
        self._lock = asyncio.Lock()

    @property
    def available(self) -> bool:
        return (self._model_dir / "model.bin").exists()

    def _load(self):
        from faster_whisper import WhisperModel

        logger.info("Loading Whisper from %s", self._model_dir)
        return WhisperModel(str(self._model_dir), device="cpu", compute_type="int8", cpu_threads=self._cpu_threads)

    def _ensure_loaded(self) -> None:
        if self._model is None:
            self._model = self._load()

    async def prepare(self) -> None:
        """Loads the model early, so the first sentence isn't a long wait."""
        if self.available:
            async with self._lock:
                await asyncio.to_thread(self._ensure_loaded)

    def _run(self, audio: bytes) -> str:
        self._ensure_loaded()
        segments, _ = self._model.transcribe(
            io.BytesIO(audio),
            language="en",
            # Weighing several guesses is slower, but makes far fewer mistakes.
            beam_size=5,
            initial_prompt=VOCABULARY,
            # Skips silence, and stops Whisper inventing words from background noise.
            vad_filter=True,
            condition_on_previous_text=False,
        )
        return " ".join(segment.text.strip() for segment in segments).strip()

    async def transcribe(self, audio: bytes) -> str:
        if not self.available:
            raise SpeechUnavailable("The speech recognition model is not installed.")
        async with self._lock:
            return await asyncio.to_thread(self._run, audio)


# Small slips in speech recognition that change the meaning after translation.
SINHALA_SPEECH_FIXES = (
    ("කලගුණය", "කාලගුණය"),
    ("කියන්නේ මොකද", "කියන්නේ මොකක්ද"),
    ("ගඟ මොකද", "ගඟ මොකක්ද"),
    ("නම මොකද", "නම මොකක්ද"),
)


def tidy_sinhala_speech(text: str) -> str:
    for heard, meant in SINHALA_SPEECH_FIXES:
        text = text.replace(heard, meant)
    return text


class OnlineSinhalaRecognizer:
    """Hears Sinhala through Google's free speech service.

    Offline Sinhala models proved unusable, so this one exception goes online.
    It runs only when the user picks Sinhala as the voice language, and it sends
    that recording to Google. The service is unofficial and may change.
    """

    LANGUAGE = "si-LK"
    TIMEOUT_SECONDS = 15

    def _run(self, audio: bytes) -> str:
        import speech_recognition

        recognizer = speech_recognition.Recognizer()
        recognizer.operation_timeout = self.TIMEOUT_SECONDS
        with speech_recognition.AudioFile(io.BytesIO(audio)) as source:
            recording = recognizer.record(source)
        try:
            return tidy_sinhala_speech(recognizer.recognize_google(recording, language=self.LANGUAGE).strip())
        except speech_recognition.UnknownValueError:
            return ""
        except (speech_recognition.RequestError, TimeoutError, OSError) as error:
            logger.warning("Online Sinhala recognition failed: %s", error)
            raise SpeechUnavailable("Sinhala listening needs the internet. You can type in Sinhala instead.") from error

    async def transcribe(self, audio: bytes) -> str:
        return await asyncio.to_thread(self._run, audio)


class Synthesizer:
    """One voice for each language, because neither can read the other's script."""

    def __init__(self, voice_path: Path, sinhala_voice_path: Path) -> None:
        self._paths = {"english": voice_path, "sinhala": sinhala_voice_path}
        self._voices: dict[str, object] = {}
        self._lock = asyncio.Lock()

    @property
    def available(self) -> bool:
        return self._paths["english"].exists()

    @property
    def sinhala_available(self) -> bool:
        return self._paths["sinhala"].exists()

    def _voice(self, language: str):
        if language not in self._voices:
            from piper import PiperVoice

            logger.info("Loading Piper voice from %s", self._paths[language])
            self._voices[language] = PiperVoice.load(self._paths[language])
        return self._voices[language]

    async def prepare(self) -> None:
        async with self._lock:
            for language, path in self._paths.items():
                if path.exists():
                    await asyncio.to_thread(self._voice, language)

    def _run(self, text: str, language: str) -> bytes:
        output = io.BytesIO()
        with wave.open(output, "wb") as wav_file:
            self._voice(language).synthesize_wav(text, wav_file)
        return output.getvalue()

    async def synthesize(self, text: str) -> bytes:
        language = "sinhala" if any("\u0d80" <= character <= "\u0dff" for character in text) else "english"
        if not self._paths[language].exists():
            raise SpeechUnavailable(f"The {language} voice model is not installed. The reply is on screen.")
        async with self._lock:
            return await asyncio.to_thread(self._run, text, language)


def create_engines(settings: Settings) -> tuple[Transcriber, Synthesizer]:
    return (
        Transcriber(settings.whisper_model_dir, settings.cpu_threads),
        Synthesizer(settings.piper_voice, settings.piper_voice_sinhala),
    )
