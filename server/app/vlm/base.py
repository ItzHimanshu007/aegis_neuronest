"""VLM adapter interface. An adapter turns a validated PayloadV1 into a PlanV1.

Adapters never see anything the extension didn't already sanitize — see AGENTS.md invariant 1.
"""

from __future__ import annotations

from typing import Protocol

from app.schemas.payload import PayloadV1
from app.schemas.plan import PlanV1


class VLMAdapter(Protocol):
    async def plan(self, payload: PayloadV1) -> PlanV1: ...
