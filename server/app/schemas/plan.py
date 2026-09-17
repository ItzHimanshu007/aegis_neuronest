"""Pydantic v2 mirror of shared/schema/plan.v2.schema.json.

The JSON Schema is the single source of truth (AGENTS.md). This mirror is proven to agree with it
by server/tests/test_schema_agreement.py.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.schemas.common import EID, StateTokenId, StrictObject

ActionName = Literal[
    "click",
    "type",
    "select",
    "check",
    "scroll",
    "hover",
    "key",
    "wait",
    "navigate",
    "ask_user",
    "done",
    "fail",
]

_REQUIRES_TARGET = {"click", "type", "select", "check", "hover"}


class Target(StrictObject):
    eid: EID
    fp: str = Field(min_length=1)


class Expect(StrictObject):
    """Post-condition checked locally after the action. All fields optional."""

    eid: EID | None = None
    has_value: bool | None = None
    visible: bool | None = None
    enabled: bool | None = None
    modal_open: bool | None = None
    url_path_prefix: str | None = None
    no_validation_error: bool | None = None
    text_present: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def nonempty(self):
        if not self.model_fields_set:
            raise ValueError("evidence or expect must contain a condition")
        return self


class Action(StrictObject):
    """One proposed action. The server only proposes — see AGENTS.md invariant 6. Nothing here can
    carry code or a selector; `target` is only ever a (eid, fp) pair the extension must
    reacquire and verify before acting."""

    action: ActionName
    target: Target | None = None
    text: str | None = None
    value: str | None = None
    direction: Literal["up", "down"] | None = None
    amount: int | None = None
    key: str | None = None
    ms: int | None = Field(default=None, ge=0)
    url: str | None = None
    reason: str | None = None
    expect: Expect | None = None
    evidence: Expect | None = None

    @model_validator(mode="after")
    def _check_action_specific_fields(self) -> Action:
        if self.action in _REQUIRES_TARGET and self.target is None:
            raise ValueError(f"action '{self.action}' requires 'target'")
        if self.action == "type" and self.text is None:
            raise ValueError("action 'type' requires 'text'")
        if self.action == "select" and self.value is None:
            raise ValueError("action 'select' requires 'value'")
        if self.action == "scroll" and (self.direction is None or self.amount is None):
            raise ValueError("action 'scroll' requires 'direction' and 'amount'")
        if self.action == "key" and self.key is None:
            raise ValueError("action 'key' requires 'key'")
        if self.action == "wait" and self.ms is None:
            raise ValueError("action 'wait' requires 'ms'")
        if self.action == "navigate" and self.url is None:
            raise ValueError("action 'navigate' requires 'url'")
        if self.action in ("ask_user", "fail") and self.reason is None:
            raise ValueError(f"action '{self.action}' requires 'reason'")
        if self.action == "done" and self.evidence is None:
            raise ValueError("done requires evidence")
        allowed = {
            "click": {"target"},
            "type": {"target", "text"},
            "select": {"target", "value"},
            "check": {"target"},
            "scroll": {"direction", "amount"},
            "hover": {"target"},
            "key": {"target", "key"},
            "wait": {"ms"},
            "navigate": {"url"},
            "ask_user": {"reason"},
            "done": {"evidence"},
            "fail": {"reason"},
        }[self.action] | {"action", "expect"}
        if self.model_fields_set - allowed:
            raise ValueError("properties not allowed for this action")
        return self


class Answer(StrictObject):
    text: str


class Extract(StrictObject):
    data: dict


class ContextRequest(StrictObject):
    reason: str = Field(min_length=1, max_length=300)
    kind: Literal["more_elements", "scroll_region", "higher_resolution"]


class PlanV2(StrictObject):
    """Server response. Exactly one of plan / answer / extract is present."""

    schema_: Literal["aegis/2"] = Field(alias="schema")
    state_token: StateTokenId
    plan_steps: list[Annotated[str, Field(min_length=1, max_length=200)]] | None = Field(
        default=None, min_length=1, max_length=8
    )
    request_context: ContextRequest | None = None
    plan: Annotated[list[Action], Field(min_length=1)] | None = None
    answer: Answer | None = None
    extract: Extract | None = None

    @model_validator(mode="after")
    def _exactly_one_variant(self) -> PlanV2:
        present = [
            v is not None for v in (self.plan, self.answer, self.extract, self.request_context)
        ]
        if sum(present) != 1:
            raise ValueError("exactly one of plan, answer, extract must be set")
        return self
