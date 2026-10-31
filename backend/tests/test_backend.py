"""Backend tests. A fake Ollama is used, so they need no model and no internet."""

import json
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai.conversation import MAX_TURNS, Conversation
from app.ai.language import detect_language
from app.ai.ollama_client import OllamaClient
from app.ai.prompts import build_system_prompt
from app.ai.singlish import convert_word, singlish_to_sinhala
from app.ai.translator import SentenceBuffer, Translator, repair_sinhala
from app.config.preferences import Preferences
from app.config.settings import load_settings
from app.main import create_app
from app.speech.engines import SpeechUnavailable, Synthesizer, Transcriber, tidy_sinhala_speech

from datetime import datetime


def fake_ollama(*, running: bool = True, models: tuple[str, ...] = ("gemma3:4b", "qwen3.5:4b"), chat_status: int = 200, seen: list | None = None):
    def handle(request: httpx.Request) -> httpx.Response:
        if not running:
            raise httpx.ConnectError("refused")
        if request.url.path == "/api/version":
            return httpx.Response(200, json={"version": "9.9.9"})
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": name} for name in models]})
        if request.url.path == "/api/chat":
            if seen is not None:
                seen.append(json.loads(request.content))
            if chat_status != 200:
                return httpx.Response(chat_status, json={"error": "nope"})
            lines = [
                {"message": {"content": "Good "}, "done": False},
                {"message": {"content": "evening, sir."}, "done": False},
                {"message": {"content": ""}, "done": True, "eval_count": 5, "prompt_eval_count": 9, "total_duration": 2_000_000_000, "eval_duration": 1_000_000_000},
            ]
            return httpx.Response(200, text="\n".join(json.dumps(line) for line in lines))
        return httpx.Response(404)

    return httpx.MockTransport(handle)


class FakeTranscriber(Transcriber):
    def __init__(self) -> None:
        super().__init__(Path("unused"), 1)

    available = True

    async def prepare(self) -> None:
        self.prepared = True

    async def transcribe(self, audio: bytes) -> str:
        return f"heard {len(audio)} bytes"


class FakeSynthesizer(Synthesizer):
    def __init__(self) -> None:
        super().__init__(Path(__file__), Path(__file__))

    async def prepare(self) -> None:
        self.prepared = True

    def _run(self, text: str, language: str) -> bytes:
        return f"RIFF {language} {text}".encode()


class FakeTranslator(Translator):
    """Marks text, so a test can see which way it went."""

    def __init__(self, available: bool = True) -> None:
        super().__init__(Path("unused"), 1)
        self.fake_available = available

    @property
    def available(self) -> bool:
        return self.fake_available

    async def translate(self, text: str, source: str, target: str) -> str:
        return f"[{source}>{target}] {text}"


@pytest.fixture
def make_client(tmp_path: Path):
    def build(*, speech=None, translator=None, sinhala_recognizer=None, **fake_options) -> TestClient:
        settings = replace(load_settings(), data_dir=tmp_path, ollama_exe=tmp_path / "missing.exe")
        ollama = OllamaClient("http://ollama.test", transport=fake_ollama(**fake_options))
        return TestClient(create_app(settings, ollama, start_ollama=False, speech=speech or (FakeTranscriber(), FakeSynthesizer()), translator=translator or FakeTranslator(), sinhala_recognizer=sinhala_recognizer))

    return build


def events(response: httpx.Response) -> list[dict]:
    return [json.loads(line) for line in response.text.splitlines() if line]


def test_health(make_client):
    assert make_client().get("/health").json() == {"status": "ok"}


def test_status_when_ollama_is_running(make_client):
    status = make_client().get("/ai/status").json()
    assert status["ollamaRunning"] is True
    assert status["version"] == "9.9.9"
    assert status["modelInstalled"] is True


def test_status_when_ollama_is_off(make_client):
    status = make_client(running=False).get("/ai/status").json()
    assert status["ollamaRunning"] is False
    assert status["ollamaFound"] is False
    assert status["models"] == []


def test_status_when_the_model_is_missing(make_client):
    status = make_client(models=("other:1b",)).get("/ai/status").json()
    assert status["modelInstalled"] is False


def test_chat_streams_tokens_and_remembers(make_client):
    client = make_client()
    result = events(client.post("/chat/stream", json={"message": "Hello there"}))
    assert [event["text"] for event in result if event["type"] == "token"] == ["Good ", "evening, sir."]
    assert result[-1] == {"type": "done", "language": "english", "seconds": 2.0, "tokensPerSecond": 5.0}

    history = client.get("/chat/history").json()
    assert history == [
        {"role": "user", "text": "Hello there"},
        {"role": "assistant", "text": "Good evening, sir."},
    ]


def test_chat_sends_history_and_the_language_rule(make_client):
    seen: list[dict] = []
    client = make_client(seen=seen)
    client.post("/chat/stream", json={"message": "Hello there"})
    client.post("/chat/stream", json={"message": "VS Code eka open karanna"})

    second = seen[1]["messages"]
    assert second[0]["role"] == "system"
    assert "translated into Sinhala" in second[0]["content"]
    assert second[-1]["content"].startswith("[sinhala>english] VS Code")
    assert [message["content"] for message in second[1:3]] == ["Hello there", "Good evening, sir."]


def test_sinhala_goes_through_the_translator_both_ways(make_client):
    seen: list[dict] = []
    client = make_client(seen=seen)
    result = events(client.post("/chat/stream", json={"message": "ඔයා කවුද"}))
    tokens = "".join(event["text"] for event in result if event["type"] == "token")
    assert seen[0]["messages"][-1]["content"] == "[sinhala>english] ඔයා කවුද"
    assert tokens == "[english>sinhala] Good evening, sir."
    assert result[-1]["language"] == "sinhala"


def test_singlish_becomes_sinhala_before_translation(make_client):
    seen: list[dict] = []
    make_client(seen=seen).post("/chat/stream", json={"message": "oya kohomada"})
    assert seen[0]["messages"][-1]["content"] == "[sinhala>english] ඔයා කොහොමද"


def test_english_skips_the_translator(make_client):
    seen: list[dict] = []
    result = events(make_client(seen=seen).post("/chat/stream", json={"message": "Hello there"}))
    assert seen[0]["messages"][-1]["content"] == "Hello there"
    assert "[" not in "".join(event["text"] for event in result if event["type"] == "token")


def test_without_a_translator_the_model_answers_directly(make_client):
    seen: list[dict] = []
    make_client(seen=seen, translator=FakeTranslator(available=False)).post("/chat/stream", json={"message": "ඔයා කවුද"})
    assert "Sinhala script" in seen[0]["messages"][0]["content"]
    assert seen[0]["messages"][-1]["content"] == "ඔයා කවුද"


def test_singlish_keeps_app_names_and_drops_the_wake_word():
    assert singlish_to_sinhala("Jarvis, Chrome eka open karanna.") == "Chrome එක open කරන්න."


def test_unknown_singlish_words_convert_by_sound():
    assert convert_word("potha") == "පොත"
    assert convert_word("rata") == "රට"


def test_broken_sinhala_letters_are_repaired():
    assert repair_sinhala("ශ\u0dca රී ලංකාව") == "ශ\u0dca\u200dරී ලංකාව"


def test_word_gaps_stay_when_repairing_sinhala():
    assert repair_sinhala("එක\u0dca රටක") == "එක\u0dca රටක"


def test_sentences_are_released_when_finished():
    buffer = SentenceBuffer()
    assert buffer.push("It is 3.5 metres") == []
    assert buffer.push(" long. Next") == ["It is 3.5 metres long."]
    assert buffer.flush() == ["Next"]


def test_chat_reports_ollama_off(make_client):
    client = make_client(running=False)
    result = events(client.post("/chat/stream", json={"message": "Hello"}))
    assert result[-1]["code"] == "ollama_unavailable"
    assert client.get("/chat/history").json() == []


def test_chat_reports_a_missing_model(make_client):
    result = events(make_client(chat_status=404).post("/chat/stream", json={"message": "Hello"}))
    assert result[-1]["code"] == "model_missing"


def test_chat_reports_an_ollama_failure(make_client):
    result = events(make_client(chat_status=500).post("/chat/stream", json={"message": "Hello"}))
    assert result[-1]["code"] == "ollama_error"


@pytest.mark.parametrize("body", [{"message": ""}, {"message": "x" * 4001}, {}])
def test_chat_rejects_bad_messages(make_client, body):
    assert make_client().post("/chat/stream", json=body).status_code == 422


def test_clear_history(make_client):
    client = make_client()
    client.post("/chat/stream", json={"message": "Hello"})
    client.delete("/chat/history")
    assert client.get("/chat/history").json() == []


def test_model_can_be_changed_and_is_remembered(make_client):
    client = make_client()
    assert client.put("/ai/model", json={"name": "qwen3.5:4b"}).status_code == 200
    assert client.get("/ai/status").json()["activeModel"] == "qwen3.5:4b"
    assert make_client().get("/ai/status").json()["activeModel"] == "qwen3.5:4b"


def test_model_must_be_installed(make_client):
    assert make_client().put("/ai/model", json={"name": "not:real"}).status_code == 404


def test_only_the_app_may_call_the_server(make_client):
    client = make_client()
    allowed = client.get("/health", headers={"Origin": "http://tauri.localhost"})
    blocked = client.get("/health", headers={"Origin": "https://evil.example"})
    assert allowed.headers["access-control-allow-origin"] == "http://tauri.localhost"
    assert "access-control-allow-origin" not in blocked.headers


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("What is machine learning?", "english"),
        ("Open the door", "english"),
        ("මට අද කාලගුණය කියන්න", "sinhala"),
        ("Jarvis, VS Code eka open karanna.", "singlish"),
        ("oya kohomada", "singlish"),
        ("What is AI?", "english"),
        ("Who is Ali?", "english"),
        ("mama heta colombo yanawa", "singlish"),
        ("mata help karanna puluwanda", "singlish"),
    ],
)
def test_language_detection(text, expected):
    assert detect_language(text) == expected


def test_speech_recognition_returns_text(make_client):
    response = make_client().post("/speech/transcribe", content=b"audio")
    assert response.json() == {"text": "heard 5 bytes"}


def test_speech_models_can_load_early(make_client):
    transcriber, synthesizer = FakeTranscriber(), FakeSynthesizer()
    client = make_client(speech=(transcriber, synthesizer))
    assert client.post("/speech/prepare").json() == {"status": "ready"}
    assert transcriber.prepared and synthesizer.prepared


def test_preparing_is_harmless_without_models(make_client, tmp_path):
    client = make_client(speech=(Transcriber(tmp_path, 1), Synthesizer(tmp_path / "none.onnx", tmp_path / "none2.onnx")))
    assert client.post("/speech/prepare").status_code == 200


class FakeOnlineRecognizer:
    def __init__(self, failure: Exception | None = None) -> None:
        self.calls = 0
        self.failure = failure

    async def transcribe(self, audio: bytes) -> str:
        self.calls += 1
        if self.failure:
            raise self.failure
        return "ඔයා කවුද"


def test_common_sinhala_hearing_slips_are_corrected():
    assert tidy_sinhala_speech("අද කලගුණය කොහොමද") == "අද කාලගුණය කොහොමද"
    assert tidy_sinhala_speech("පයිතන් කියන්නේ මොකද") == "පයිතන් කියන්නේ මොකක්ද"


def test_english_voice_never_goes_online(make_client):
    online = FakeOnlineRecognizer()
    response = make_client(sinhala_recognizer=online).post("/speech/transcribe", content=b"audio")
    assert response.json()["text"] == "heard 5 bytes"
    assert online.calls == 0


def test_sinhala_voice_uses_the_online_service(make_client):
    online = FakeOnlineRecognizer()
    response = make_client(sinhala_recognizer=online).post("/speech/transcribe?language=sinhala", content=b"audio")
    assert response.json() == {"text": "ඔයා කවුද"}
    assert online.calls == 1


def test_sinhala_voice_offline_is_explained(make_client):
    online = FakeOnlineRecognizer(SpeechUnavailable("Sinhala listening needs the internet."))
    response = make_client(sinhala_recognizer=online).post("/speech/transcribe?language=sinhala", content=b"audio")
    assert response.status_code == 503
    assert "internet" in response.json()["detail"]


def test_unknown_voice_language_is_refused(make_client):
    assert make_client().post("/speech/transcribe?language=french", content=b"audio").status_code == 422


def test_speech_recognition_rejects_empty_audio(make_client):
    assert make_client().post("/speech/transcribe", content=b"").status_code == 400


def test_speech_recognition_rejects_huge_audio(make_client):
    assert make_client().post("/speech/transcribe", content=b"x" * 12_000_001).status_code == 413


def test_voice_returns_wav_audio(make_client):
    response = make_client().post("/speech/synthesize", json={"text": "Hello"})
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == b"RIFF english Hello"


def test_sinhala_text_uses_the_sinhala_voice(make_client):
    response = make_client().post("/speech/synthesize", json={"text": "හරි සර්"})
    assert response.content.startswith("RIFF sinhala".encode())


def test_missing_sinhala_voice_is_explained(make_client, tmp_path):
    speech = (FakeTranscriber(), Synthesizer(Path(__file__), tmp_path / "none.onnx"))
    response = make_client(speech=speech).post("/speech/synthesize", json={"text": "හරි සර්"})
    assert response.status_code == 503
    assert "sinhala" in response.json()["detail"]


def test_missing_speech_models_are_explained(make_client, tmp_path):
    client = make_client(
        speech=(Transcriber(tmp_path, 1), Synthesizer(tmp_path / "none.onnx", tmp_path / "none2.onnx")),
        translator=FakeTranslator(available=False),
    )
    assert client.get("/speech/status").json() == {"recognition": False, "voice": False, "sinhalaVoice": False, "translator": False}
    assert client.post("/speech/transcribe", content=b"audio").status_code == 503
    assert client.post("/speech/synthesize", json={"text": "Hello"}).status_code == 503


def test_conversation_drops_the_oldest_turns():
    conversation = Conversation()
    for number in range(MAX_TURNS + 5):
        conversation.add("user", str(number))
    turns = conversation.turns()
    assert len(turns) == MAX_TURNS
    assert turns[-1].text == str(MAX_TURNS + 4)


def test_conversation_always_keeps_the_newest_turn():
    conversation = Conversation()
    conversation.add("user", "x" * 50000)
    assert len(conversation.turns()) == 1


def test_prompt_never_claims_abilities_it_lacks():
    prompt = build_system_prompt("english", datetime(2026, 10, 31, 12, 0))
    assert "Never pretend" in prompt
    assert "31 October 2026" in prompt


def test_preferences_survive_a_damaged_file(tmp_path: Path):
    path = tmp_path / "preferences.json"
    path.write_text("{broken", encoding="utf-8")
    assert Preferences(path).get("active_model") is None
