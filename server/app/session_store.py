"""Per-session server-side state. TODO(stage-8): verdict cache, same-screen delta tracking.

Never stores raw page data — the server never receives any (AGENTS.md invariant 1), so there is
nothing sensitive to protect here beyond the usual "don't log it" discipline.
"""


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, dict] = {}

    def get(self, session_id: str) -> dict:
        return self._sessions.setdefault(session_id, {})
