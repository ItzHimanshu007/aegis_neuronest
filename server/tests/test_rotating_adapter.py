"""Rotation exists because a free tier's per-minute output-token budget is smaller than one agent
task. These pin the two behaviours that make that survivable: spread the load, and fail over when a
provider does not answer — without failing over when it DID answer and simply answered badly.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.payload import PayloadV2
from app.schemas.plan import PlanV2
from app.vlm.rotating_adapter import RotatingAdapter, is_transport_failure

EXAMPLES = Path(__file__).resolve().parents[2] / "shared" / "schema" / "examples"


@pytest.fixture
def payload() -> PayloadV2:
    return PayloadV2.model_validate(json.loads((EXAMPLES / "payload.kyc.json").read_text()))


def _plan(state_token: str, **body: object) -> PlanV2:
    return PlanV2.model_validate({"schema": "aegis/2", "state_token": state_token, **body})


def _fail(state_token: str, reason: str) -> PlanV2:
    return _plan(state_token, plan=[{"action": "fail", "reason": reason}])


def _done(state_token: str) -> PlanV2:
    done = {"action": "done", "evidence": {"eid": "E14", "has_value": True}}
    return _plan(state_token, plan=[done])


class FakeProvider:
    """Records every call and returns queued results, so ordering is observable."""

    def __init__(self, name: str, results: list[PlanV2]) -> None:
        self.name = name
        self.results = list(results)
        self.calls = 0
        self.last_metrics = f"metrics-{name}"

    async def plan(self, payload: PayloadV2, history: list[str] | None = None) -> PlanV2:
        self.calls += 1
        return self.results.pop(0) if self.results else _done(payload.state_token)


class TestTransportFailureDetection:
    @pytest.mark.parametrize("reason", ["MODEL_UNAVAILABLE", "MODEL_TIMEOUT"])
    def test_a_provider_that_did_not_answer_is_retryable(self, reason):
        assert is_transport_failure(_fail("Sabcdefghij", reason)) is True

    def test_a_bad_answer_is_not_retried_elsewhere(self):
        """MODEL_OUTPUT_INVALID means the provider answered and its own repair pass already ran.
        Spending a second provider's budget on the same prompt would buy nothing."""
        assert is_transport_failure(_fail("Sabcdefghij", "MODEL_OUTPUT_INVALID")) is False

    def test_the_models_own_fail_action_is_not_a_transport_failure(self):
        """A model legitimately saying "I cannot do this here" must reach the client untouched."""
        plan = _plan("Sabcdefghij", plan=[{"action": "fail", "reason": "No form on this page"}])
        assert is_transport_failure(plan) is False

    def test_a_real_plan_is_never_a_transport_failure(self):
        assert is_transport_failure(_done("Sabcdefghij")) is False


class TestRotation:
    @pytest.mark.anyio
    async def test_spreads_consecutive_calls_across_providers(self, payload):
        """Round-robin, not always-primary: otherwise the first provider is exhausted before the
        second is touched, which is exactly the rate-limit wall this exists to avoid."""
        a, b = FakeProvider("a", []), FakeProvider("b", [])
        adapter = RotatingAdapter([("a", a), ("b", b)])
        for _ in range(4):
            await adapter.plan(payload)
        assert (a.calls, b.calls) == (2, 2)

    @pytest.mark.anyio
    async def test_fails_over_when_the_first_provider_is_rate_limited(self, payload):
        a = FakeProvider("a", [_fail(payload.state_token, "MODEL_UNAVAILABLE")])
        b = FakeProvider("b", [_done(payload.state_token)])
        adapter = RotatingAdapter([("a", a), ("b", b)])
        result = await adapter.plan(payload)
        assert result.plan[0].action == "done"
        assert (a.calls, b.calls) == (1, 1)

    @pytest.mark.anyio
    async def test_does_not_fail_over_on_a_usable_answer(self, payload):
        a = FakeProvider("a", [_fail(payload.state_token, "MODEL_OUTPUT_INVALID")])
        b = FakeProvider("b", [_done(payload.state_token)])
        adapter = RotatingAdapter([("a", a), ("b", b)])
        result = await adapter.plan(payload)
        assert result.plan[0].reason == "MODEL_OUTPUT_INVALID"
        assert b.calls == 0

    @pytest.mark.anyio
    async def test_reports_the_last_failure_when_no_provider_answers(self, payload):
        a = FakeProvider("a", [_fail(payload.state_token, "MODEL_UNAVAILABLE")])
        b = FakeProvider("b", [_fail(payload.state_token, "MODEL_TIMEOUT")])
        adapter = RotatingAdapter([("a", a), ("b", b)])
        result = await adapter.plan(payload)
        assert result.plan[0].action == "fail"
        assert (a.calls, b.calls) == (1, 1)

    @pytest.mark.anyio
    async def test_surfaces_the_metrics_of_whichever_provider_answered(self, payload):
        a = FakeProvider("a", [_fail(payload.state_token, "MODEL_UNAVAILABLE")])
        b = FakeProvider("b", [_done(payload.state_token)])
        adapter = RotatingAdapter([("a", a), ("b", b)])
        await adapter.plan(payload)
        assert adapter.last_metrics == "metrics-b"
        assert adapter.last_provider == "b"

    def test_refuses_to_start_with_no_providers(self):
        with pytest.raises(ValueError):
            RotatingAdapter([])


class TestCooldown:
    """A free tier meters per DAY as well as per minute. Once a provider has refused, trying it
    first on every subsequent call spends a round trip to learn what we already knew, and delays
    the answer the other provider could have given straight away."""

    @pytest.mark.anyio
    async def test_a_refused_provider_is_not_tried_first_again(self, payload):
        a = FakeProvider("a", [_fail(payload.state_token, "MODEL_UNAVAILABLE")])
        b = FakeProvider("b", [_done(payload.state_token), _done(payload.state_token)])
        adapter = RotatingAdapter([("a", a), ("b", b)], cooldown_s=60.0)
        await adapter.plan(payload)
        assert (a.calls, b.calls) == (1, 1)
        await adapter.plan(payload)
        assert a.calls == 1, "a was still cooling down and should have been skipped"
        assert b.calls == 2

    @pytest.mark.anyio
    async def test_a_cooling_provider_is_still_tried_when_it_is_the_only_hope(self, payload):
        """Cool-down is a guess about the near future. Being wrong must cost latency, never the
        whole task, so a resting provider is reordered rather than dropped."""
        a = FakeProvider(
            "a", [_fail(payload.state_token, "MODEL_UNAVAILABLE"), _done(payload.state_token)]
        )
        adapter = RotatingAdapter([("a", a)], cooldown_s=60.0)
        assert (await adapter.plan(payload)).plan[0].action == "fail"
        assert (await adapter.plan(payload)).plan[0].action == "done"
        assert a.calls == 2

    @pytest.mark.anyio
    async def test_recovering_clears_the_cooldown(self, payload):
        a = FakeProvider("a", [_fail(payload.state_token, "MODEL_UNAVAILABLE")])
        b = FakeProvider("b", [_done(payload.state_token)])
        adapter = RotatingAdapter([("a", a), ("b", b)], cooldown_s=0.0)
        await adapter.plan(payload)
        assert adapter._until.get("a", 0.0) <= __import__("time").monotonic()

    @pytest.mark.anyio
    async def test_an_explicit_pin_is_honoured_even_while_cooling_down(self, payload):
        """The user chose this model. Skipping it silently would make the picker a lie."""
        a = FakeProvider(
            "a", [_fail(payload.state_token, "MODEL_UNAVAILABLE"), _done(payload.state_token)]
        )
        b = FakeProvider("b", [_done(payload.state_token)])
        adapter = RotatingAdapter([("a", a), ("b", b)], cooldown_s=60.0)
        await adapter.plan(payload, None, "a")
        await adapter.plan(payload, None, "a")
        assert a.calls == 2
