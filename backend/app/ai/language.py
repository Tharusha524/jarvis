"""Works out which language a message is in, so the reply can match it."""

from typing import Literal

from app.ai.singlish import COMMON_WORDS

Language = Literal["sinhala", "singlish", "english"]

# Also normal English words or names, so alone they prove nothing.
AMBIGUOUS_WORDS = frozenset({"ada", "ai", "ali", "api", "dan", "dena", "hari", "inna", "mama", "ow", "wada", "wage"})
SINGLISH_WORDS = frozenset(COMMON_WORDS) - AMBIGUOUS_WORDS

SINGLISH_MIN_MATCHES = 2


def _has_sinhala_letters(text: str) -> bool:
    return any("඀" <= character <= "෿" for character in text)


def detect_language(text: str) -> Language:
    if _has_sinhala_letters(text):
        return "sinhala"

    words = [word.strip(".,!?\"'()").lower() for word in text.split()]
    matches = sum(word in SINGLISH_WORDS for word in words)
    if matches >= SINGLISH_MIN_MATCHES or (len(words) <= 3 and matches == 1):
        return "singlish"
    return "english"
