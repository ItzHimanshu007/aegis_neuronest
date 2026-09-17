"""VLM adapter interface. An adapter turns a validated PayloadV2 into a PlanV2.

Adapters never see anything the extension didn't already sanitize — see AGENTS.md invariant 1.
"""

from __future__ import annotations

from typing import Protocol

from app.schemas.payload import PayloadV2
from app.schemas.plan import PlanV2


class VLMAdapter(Protocol):
    async def plan(self, payload: PayloadV2) -> PlanV2: ...
