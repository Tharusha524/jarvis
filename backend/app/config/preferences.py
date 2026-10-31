"""Small choices that must survive a restart. Memory moves to SQLite in Milestone 5."""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class Preferences:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._values = self._read()

    def _read(self) -> dict[str, str]:
        try:
            values = json.loads(self._path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}
        except (OSError, json.JSONDecodeError):
            logger.exception("Could not read preferences, using defaults")
            return {}
        return values if isinstance(values, dict) else {}

    def get(self, key: str) -> str | None:
        return self._values.get(key)

    def set(self, key: str, value: str) -> None:
        self._values[key] = value
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._values, indent=2), encoding="utf-8")
