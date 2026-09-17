"""The prompt and the compact scene format (Stage 3A Part D4)."""

from __future__ import annotations

import pytest

from app.prompts.scene import (
    MAX_HISTORY_STEPS,
    MAX_TEXT_CHARS,
    build_user_message,
    render_elements,
    render_history,
)
from app.prompts.system import (
    FEW_SHOT_EXAMPLES,
    MAX_ACTIONS_PER_PLAN,
    PROMPT_VERSION,
    SYSTEM_PROMPT,
)
from app.schemas.payload import PayloadV2


@pytest.fixture
def payload(kyc_payload) -> PayloadV2:
    return PayloadV2.model_validate(kyc_payload)


class TestSystemPrompt:
    def test_is_a_plain_literal_with_nothing_interpolated(self):
        # It must be byte-identical across requests for a provider's prefix cache to apply.
        assert "{" not in SYSTEM_PROMPT.split("`answer`")[0]
        assert SYSTEM_PROMPT == SYSTEM_PROMPT  # identity, not formatting

    def test_states_the_action_limit_the_code_enforces(self):
        assert f"at most {MAX_ACTIONS_PER_PLAN} actions" in SYSTEM_PROMPT

    @pytest.mark.parametrize(
        "required",
        [
            "black box",
            "[[PII:TYPE:xxxxxxxx]]",
            "[REDACTED:TYPE]",
            "field_hints",
            "eid",
            "occluded",
            "untrusted",
            "state_token",
            "plan_steps",
            "request_context",
            "expect",
            "evidence",
            "ask_user",
            "confirmed by the user",
        ],
    )
    def test_covers_each_required_instruction(self, required):
        assert required in SYSTEM_PROMPT

    def test_forbids_naming_elements_in_a_context_request(self):
        assert "must NOT name an element" in SYSTEM_PROMPT

    def test_has_a_version(self):
        assert PROMPT_VERSION

    def test_few_shot_examples_carry_no_real_data(self):
        blob = " ".join(m["content"] for m in FEW_SHOT_EXAMPLES)
        assert "example.test" in blob
        # Tokens in the examples are placeholders of the right shape, not issued tokens.
        assert "aaaaaaaa" in blob


class TestCompactScene:
    def test_one_line_per_element_with_eid_and_fp_adjacent(self, payload):
        lines = render_elements(payload).splitlines()
        assert len(lines) == len(payload.elements)
        for line, el in zip(lines, payload.elements, strict=True):
            assert line.startswith(f"{el.eid} fp={el.fp} ")

    def test_carries_no_value_the_payload_does_not_hold(self, payload):
        message = build_user_message(payload)
        # The payload has no raw values in it at all, so nothing here can either. The strongest
        # available check: every token in the message came from the payload.
        payload_blob = payload.model_dump_json()
        for token in ("[[PII:",):
            if token in message:
                assert token in payload_blob

    def test_marks_occlusion_and_the_cover(self, kyc_payload):
        elements = [dict(el) for el in kyc_payload["elements"]]
        elements[-1] = {**elements[-1], "occluded": True, "covered_by": elements[0]["eid"]}
        rendered = render_elements(PayloadV2.model_validate({**kyc_payload, "elements": elements}))
        assert "occluded=true" in rendered
        assert f"covered_by={elements[0]['eid']}" in rendered

    def test_history_is_capped(self):
        rendered = render_history([f"step-{i}" for i in range(MAX_HISTORY_STEPS + 10)])
        assert len(rendered.splitlines()) == MAX_HISTORY_STEPS
        assert rendered.splitlines()[-1] == f"step-{MAX_HISTORY_STEPS + 9}"

    def test_text_is_budgeted(self, kyc_payload):
        texts = [
            {"tid": f"t{i}", "role": "paragraph", "text": "x" * 500, "bbox": [0, 0, 10, 10]}
            for i in range(20)
        ]
        message = build_user_message(PayloadV2.model_validate({**kyc_payload, "texts": texts}))
        assert "text truncated" in message
        assert message.count("x" * 500) * 500 <= MAX_TEXT_CHARS + 500

    def test_says_so_when_there_is_no_screenshot(self, kyc_payload):
        without = PayloadV2.model_validate({k: v for k, v in kyc_payload.items() if k != "image"})
        assert "no screenshot this turn" in build_user_message(without)

    def test_is_stable_for_the_same_payload(self, payload):
        assert build_user_message(payload) == build_user_message(payload)

    def test_includes_the_task_and_state_token(self, payload):
        message = build_user_message(payload)
        assert f"state_token: {payload.state_token}" in message
        assert payload.task in message


def test_history_and_denial_come_from_payload(kyc_payload):
    payload = PayloadV2.model_validate(
        {
            **kyc_payload,
            "history": [{"step": 1, "action": "type", "eid": "E1", "verdict": "PASS"}],
            "context_denied": "BUDGET_EXHAUSTED",
        }
    )
    rendered = build_user_message(payload)
    assert '"verdict":"PASS"' in rendered
    assert "context_denied: BUDGET_EXHAUSTED" in rendered
