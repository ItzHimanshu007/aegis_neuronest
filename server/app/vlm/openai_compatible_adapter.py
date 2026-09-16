"""Adapter for an open-weight VLM served behind an OpenAI-compatible API (vLLM).

TODO(stage-3): implement — static prompt prefix for KV-cache reuse, JSON-schema-constrained
output against plan.v1.schema.json, batched plans with fingerprints + expect. See
docs/architecture.md layer 6.
"""

from __future__ import annotations

from app.schemas.payload import PayloadV1
from app.schemas.plan import PlanV1


class OpenAICompatibleAdapter:
    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url
        self.model = model

    async def plan(self, payload: PayloadV1) -> PlanV1:
        raise NotImplementedError(
            "OpenAICompatibleAdapter lands in Stage 3 — see AGENTS.md and docs/STAGES.md"
        )
