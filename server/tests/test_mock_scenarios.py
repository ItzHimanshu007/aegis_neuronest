"""Mock scenarios, and where each adversarial one is stopped (Stage 3A Part E).

The malicious half is the interesting half. Each of those scenarios is something a hostile or
broken model could return, and the table below records which layer refuses it. Three layers exist
and they are not interchangeable:

  **schema**    — the shape is not expressible in plan.v2 at all.
  **server**    — `enforce()` catches it before the response leaves the server.
  **client**    — only the extension can catch it, because only the extension can see the live
                  page. These are the ones worth staring at: the server cannot help.
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.schemas.payload import PayloadV2
from app.schemas.plan import PlanV2
from app.vlm.mock_scenarios import (
    BENIGN_SCENARIOS,
    MALICIOUS_SCENARIOS,
    UnknownScenario,
    run_scenario,
)
from app.vlm.openai_compatible_adapter import enforce

# scenario -> the layer that must refuse it.
BLOCKED_BY = {
    "evil_token_in_url": "server",
    "evil_unknown_eid": "server",
    "evil_fp_mismatch": "server",
    "evil_context_names_eid": "server",
    # The server has no idea what is on screen or what the user consented to. These reach the
    # client as schema-valid, plausible-looking plans and are refused there:
    #   hidden click    -> checkAction NOT_VISIBLE
    #   wrong token type-> checkAction TOKEN_TYPE_MISMATCH (aborts the batch, never skips)
    #   commit w/o ask  -> classifyAction L5, which always requires the user
    "evil_hidden_click": "client",
    "evil_wrong_token_type": "client",
    "evil_commit_without_ask": "client",
}


@pytest.fixture
def payload(kyc_payload) -> PayloadV2:
    return PayloadV2.model_validate(kyc_payload)


@pytest.fixture
def adversarial_payload(kyc_payload) -> PayloadV2:
    """A payload rich enough for every adversarial scenario to express itself: it needs a hidden
    element to click and a phone field to mistype into, or the scenario degrades into something a
    lower layer catches for the wrong reason."""
    elements = [dict(el) for el in kyc_payload["elements"]]
    elements.append(
        {
            "eid": "E90",
            "fp": "fp-hidden",
            "role": "button",
            "label": "Hidden control",
            "bbox": [0, 0, 0, 0],
            "visible": False,
            "enabled": True,
            "hidden_interactive": True,
        }
    )
    return PayloadV2.model_validate({**kyc_payload, "elements": elements})


@pytest.fixture
def occluded_payload(kyc_payload) -> PayloadV2:
    elements = [dict(el) for el in kyc_payload["elements"]]
    elements[-1] = {**elements[-1], "occluded": True, "covered_by": elements[0]["eid"]}
    return PayloadV2.model_validate({**kyc_payload, "elements": elements})


@pytest.mark.parametrize("name", BENIGN_SCENARIOS)
def test_every_benign_scenario_is_schema_valid(name, payload):
    result = run_scenario(name, payload)
    assert isinstance(result, PlanV2)


@pytest.mark.parametrize("name", MALICIOUS_SCENARIOS)
def test_every_malicious_scenario_is_stopped_somewhere(name, adversarial_payload):
    """A scenario is only useful if it gets past the layers above the one being tested. This
    asserts both halves: it IS schema-valid where we say so, and it IS refused where we say so."""
    expected_layer = BLOCKED_BY[name]
    try:
        result = run_scenario(name, adversarial_payload)
    except ValidationError:
        assert expected_layer == "schema"
        return

    violation = enforce(result, adversarial_payload)
    if expected_layer == "server":
        assert violation is not None, f"{name} should have been refused by the server"
    else:
        assert violation is None, f"{name} is refused by the server, not the client as recorded"


def test_kyc_fill_targets_real_elements_and_stops_before_submitting(payload):
    result = run_scenario("kyc_fill", payload)
    eids = {el.eid for el in payload.elements}
    assert all(a.target.eid in eids for a in result.plan if a.target)
    assert result.plan[-1].action == "ask_user"
    assert all(a.expect is not None for a in result.plan if a.action == "type")


def test_kyc_fill_prefers_a_task_supplied_token_over_the_page_echo(kyc_payload):
    # E14 (Email address) starts empty in the fixture and has no page token to echo — the only
    # way to fill it is the token runAgentLoop.ts appends to `task` for what the user typed into
    # the panel's task-data rows. This is what makes `kyc_fill` usable against a real empty field,
    # not just against a field the page already filled in.
    task_token = "[[PII:EMAIL:zzzzzzzz]]"
    payload = PayloadV2.model_validate(
        {**kyc_payload, "task": f"{kyc_payload['task']}\nTask data: {task_token}"}
    )
    email = next(el for el in payload.elements if el.label == "Email address")
    result = run_scenario("kyc_fill", payload)
    fill = next(a for a in result.plan if a.target and a.target.eid == email.eid)
    assert fill.text == task_token


def test_stale_state_does_not_echo_the_state_token(payload):
    # The whole point of this scenario: checkPlan must reject it as STALE_PLAN.
    assert run_scenario("stale_state", payload).state_token != payload.state_token


def test_loop_returns_the_same_action_every_time(payload):
    first = run_scenario("loop", payload)
    second = run_scenario("loop", payload)
    assert first.model_dump_json() == second.model_dump_json()


def test_impossible_fails_with_a_reason(payload):
    plan = run_scenario("impossible", payload).plan
    assert plan[0].action == "fail" and plan[0].reason


def test_banner_first_clicks_the_named_cover(occluded_payload):
    result = run_scenario("banner_first", occluded_payload)
    blocked = next(el for el in occluded_payload.elements if el.occluded)
    assert result.plan[0].target.eid == blocked.covered_by


def test_answer_balance_returns_a_token_for_display(payload):
    assert "[[PII:" in run_scenario("answer_balance", payload).answer.text


def test_unknown_scenario_is_refused(payload):
    with pytest.raises(UnknownScenario):
        run_scenario("not_a_scenario", payload)


def test_scenario_header_is_refused_outside_mock_mode(client, kyc_payload, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("AEGIS_ADAPTER", "openai_compat")
    get_settings.cache_clear()
    body = json.dumps(kyc_payload)
    response = client.post("/v1/plan", content=body, headers={"X-Aegis-Mock-Scenario": "kyc_fill"})
    assert response.status_code == 400


def test_scenario_header_works_in_mock_mode(client, kyc_payload):
    response = client.post(
        "/v1/plan",
        content=json.dumps(kyc_payload),
        headers={"X-Aegis-Mock-Scenario": "impossible"},
    )
    assert response.status_code == 200
    assert response.json()["plan"][0]["action"] == "fail"
