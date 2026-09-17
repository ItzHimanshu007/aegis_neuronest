"""Per-session server-side state (Stage 3A Part C3).

Holds the sanitized history a multi-step task needs: what the planner said it would do, what the
client reported back about each action, and the last state token. All of it is already sanitized —
the server never receives anything else (AGENTS.md invariant 1) — but three limits apply anyway:

  **No images.** Only the current turn's image is ever in a prompt. Keeping past ones would grow
  the context without bound and would be the one place the server accumulated pixels.

  **Closed vocabulary.** Clients append short action/verdict records, not free text. A page string
  that reached this store would end up in the next prompt.

  **It expires.** Entries are evicted after `AEGIS_SESSION_TTL_S`, and `POST /v1/session/end`
  deletes one immediately.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

# A session that somehow never ends still cannot grow without bound.
MAX_HISTORY_RECORDS = 64
MAX_PLAN_STEPS = 8
MAX_RECORD_CHARS = 120


@dataclass
class SessionState:
    created_at: float
    last_seen: float
    plan_steps: list[str] = field(default_factory=list)
    history: list[str] = field(default_factory=list)
    last_state_token: str | None = None


class SessionStore:
    def __init__(self, ttl_s: float = 900.0) -> None:
        self._ttl_s = ttl_s
        self._sessions: dict[str, SessionState] = {}

    def _evict_expired(self, now: float) -> None:
        expired = [
            key for key, state in self._sessions.items() if now - state.last_seen > self._ttl_s
        ]
        for key in expired:
            del self._sessions[key]

    def get(self, session_id: str) -> SessionState:
        now = time.monotonic()
        self._evict_expired(now)
        state = self._sessions.get(session_id)
        if state is None:
            state = SessionState(created_at=now, last_seen=now)
            self._sessions[session_id] = state
        state.last_seen = now
        return state

    def record_plan_steps(self, session_id: str, steps: list[str]) -> None:
        state = self.get(session_id)
        if not state.plan_steps:
            state.plan_steps = [s[:MAX_RECORD_CHARS] for s in steps[:MAX_PLAN_STEPS]]

    def record_state_token(self, session_id: str, state_token: str) -> None:
        self.get(session_id).last_state_token = state_token

    def append_history(self, session_id: str, records: list[str]) -> None:
        """Appends client-reported action/verdict records. Each is truncated, and the list is
        capped from the front so a long task keeps only its recent past."""
        state = self.get(session_id)
        state.history.extend(record[:MAX_RECORD_CHARS] for record in records)
        if len(state.history) > MAX_HISTORY_RECORDS:
            del state.history[: len(state.history) - MAX_HISTORY_RECORDS]

    def history_for_prompt(self, session_id: str) -> list[str]:
        state = self.get(session_id)
        steps = [f"planned: {step}" for step in state.plan_steps]
        return steps + state.history

    def end(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    def __len__(self) -> int:
        self._evict_expired(time.monotonic())
        return len(self._sessions)
