"""Short-term memory for the current conversation.

It lives only in RAM and is lost on restart. Long-term memory arrives with
SQLite in Milestone 5.
"""

from dataclasses import dataclass
from typing import Literal

Role = Literal["user", "assistant"]

# Keeps the prompt small enough to stay fast on a CPU.
MAX_TURNS = 12
MAX_CHARACTERS = 9000


@dataclass(frozen=True)
class Turn:
    role: Role
    text: str


class Conversation:
    def __init__(self) -> None:
        self._turns: list[Turn] = []

    def add(self, role: Role, text: str) -> None:
        self._turns.append(Turn(role, text))
        self._trim()

    def clear(self) -> None:
        self._turns.clear()

    def forget_last_user_turn(self) -> None:
        if self._turns and self._turns[-1].role == "user":
            self._turns.pop()

    def turns(self) -> list[Turn]:
        return list(self._turns)

    def messages(self) -> list[dict[str, str]]:
        return [{"role": turn.role, "content": turn.text} for turn in self._turns]

    def _trim(self) -> None:
        # Oldest turns go first, but the newest turn always stays.
        while len(self._turns) > 1 and (
            len(self._turns) > MAX_TURNS
            or sum(len(turn.text) for turn in self._turns) > MAX_CHARACTERS
        ):
            del self._turns[0]
