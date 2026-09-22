"""Rotates across several model providers, so one provider's rate limit is not the whole agent's.

Why this exists: a single agent task makes many model calls, and free provider tiers meter output
tokens per MINUTE. Groq's free tier allows 1000 output tokens/min and bills the REQUESTED
`max_tokens` against it, so at `max_tokens=400` a task gets ~2 calls a minute and then every
subsequent call comes back `MODEL_UNAVAILABLE`. That is not a failure the agent loop can plan
around — it looks exactly like the model refusing to answer.

Two behaviours, both needed:

- **Round-robin** the starting provider per call, so the load is spread and each provider's
  per-minute budget is drawn down evenly rather than exhausting one before touching the next.
- **Fail over** within a call: if a provider returns a transport-level failure (rate limited,
  unreachable, timed out), try the next one before giving up. Only transport failures fail over.
  A model that answered but answered badly (`MODEL_OUTPUT_INVALID`) has already had its repair
  pass inside its own adapter, and retrying that elsewhere would just spend another provider's
  budget on the same prompt.

Privacy note: this changes WHO receives sealed payloads, not WHAT they contain. Each provider
receives exactly the same already-sanitized, already-redacted payload the single-provider path
sent, built by the extension's `seal()` and unchanged here. Adding a provider means that provider
now sees redacted screenshots and tokenized text, so the list is explicit configuration and never
inferred.
"""

from __future__ import annotations

import logging
import time
from itertools import count
from typing import Any

from app.schemas.payload import PayloadV2
from app.schemas.plan import PlanV2

logger = logging.getLogger("aegis.vlm")

# Reasons that mean "this provider did not answer" — worth asking the next one.
# A provider that answered with unusable content is NOT retried elsewhere.
RETRYABLE_REASONS = frozenset({"MODEL_UNAVAILABLE", "MODEL_TIMEOUT"})


def is_transport_failure(plan: PlanV2) -> bool:
    """True when a plan is an adapter-generated failure, not a real model answer."""
    actions = plan.plan or []
    if len(actions) != 1:
        return False
    action = actions[0]
    return action.action == "fail" and action.reason in RETRYABLE_REASONS


class RotatingAdapter:
    """Presents one VLMAdapter over several. `providers` is an ordered list of (name, adapter)."""

    def __init__(self, providers: list[tuple[str, Any]], cooldown_s: float = 60.0) -> None:
        if not providers:
            raise ValueError("RotatingAdapter needs at least one provider")
        self.providers = providers
        self.cooldown_s = cooldown_s
        # When each provider may be tried again. A provider that just refused is very likely to
        # refuse again: free-tier limits are measured per minute and per DAY, so after a daily
        # token budget is spent, every further attempt on that provider is a wasted round trip
        # that delays the answer the other provider could have given immediately. Measured on the
        # real thing: one observation costs ~4,700 tokens (the screenshot dominates), against a
        # 200,000 tokens/day free-tier budget — roughly 40 calls before a provider is done until
        # the daily reset.
        self._until: dict[str, float] = {}
        self._turn = count()
        # The route reads `adapter.last_metrics` to report timings; expose whichever provider
        # actually produced the answer.
        self.last_metrics = getattr(providers[0][1], "last_metrics", None)
        self.last_provider = providers[0][0]

    @property
    def names(self) -> list[str]:
        return [name for name, _ in self.providers]

    def _available_first(self, order: list[tuple[str, Any]]) -> list[tuple[str, Any]]:
        """Providers not in cool-down first, the rest after — never dropped entirely, because a
        cool-down is a guess about the near future and being wrong about it must cost latency, not
        the whole task."""
        now = time.monotonic()
        ready = [p for p in order if self._until.get(p[0], 0.0) <= now]
        resting = [p for p in order if self._until.get(p[0], 0.0) > now]
        return ready + resting

    async def plan(
        self,
        payload: PayloadV2,
        history: list[str] | None = None,
        provider: str | None = None,
    ) -> PlanV2:
        """`provider` pins this call to one named provider, for a user who picked a model in the
        panel. An unknown name is ignored rather than rejected: the picker is a preference, and a
        stale choice must not take the task down. Pinning still fails over — a user asking for a
        model is asking for it where possible, not asking to fail without it."""
        if provider is not None:
            pinned = [p for p in self.providers if p[0] == provider]
            rest = [p for p in self.providers if p[0] != provider]
            if pinned:
                # An explicit choice is honoured even while cooling down: the user asked for it,
                # and a failure will simply fall through to the others.
                order = pinned + self._available_first(rest)
                return await self._first_answer(order, payload, history)

        start = next(self._turn) % len(self.providers)
        n = len(self.providers)
        order = [self.providers[(start + i) % n] for i in range(n)]
        return await self._first_answer(self._available_first(order), payload, history)

    async def _first_answer(
        self,
        order: list[tuple[str, Any]],
        payload: PayloadV2,
        history: list[str] | None,
    ) -> PlanV2:

        result: PlanV2 | None = None
        for name, adapter in order:
            try:
                result = await adapter.plan(payload, history)
            except TypeError:
                result = await adapter.plan(payload)

            self.last_metrics = getattr(adapter, "last_metrics", None)
            self.last_provider = name

            if not is_transport_failure(result):
                self._until.pop(name, None)
                return result
            self._until[name] = time.monotonic() + self.cooldown_s
            # Reason codes only — never payload or model text.
            reason = result.plan[0].reason
            logger.warning("provider %s did not answer (%s); trying next", name, reason)

        logger.warning("no provider answered; tried %s", ",".join(self.names))
        assert result is not None
        return result
