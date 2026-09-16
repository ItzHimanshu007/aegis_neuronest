"""Pydantic v2 mirror of shared/schema/plan.v1.schema.json.

The JSON Schema is the single source of truth (AGENTS.md). This mirror is proven to agree with it
by server/tests/test_schema_agreement.py.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class Target(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mark_id: int = Field(ge=0)
    fp: str = Field(min_length=1)


class Expect(BaseModel):
    """Post-condition checked locally after the action. All fields optional."""

    model_config = ConfigDict(extra="forbid")

    mark_id: int | None = Field(default=None, ge=0)
    has_value: bool | None = None
    visible: bool | None = None
    enabled: bool | None = None
    modal_open: bool | None = None
    url_path_prefix: str | None = None


class Action(BaseModel):
    """One proposed action. The server only proposes — see AGENTS.md invariant 6. Nothing here can
    carry code or a selector; `target` is only ever a (mark_id, fp) pair the extension must
    reacquire and verify before acting."""

    model_config = ConfigDict(extra="forbid")

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
        return self


class Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str


class Extract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data: dict


class PlanV1(BaseModel):
    """Server response. Exactly one of plan / answer / extract is present."""

    model_config = ConfigDict(extra="forbid")

    plan: Annotated[list[Action], Field(min_length=1)] | None = None
    answer: Answer | None = None
    extract: Extract | None = None

    @model_validator(mode="after")
    def _exactly_one_variant(self) -> PlanV1:
        present = [v is not None for v in (self.plan, self.answer, self.extract)]
        if sum(present) != 1:
            raise ValueError("exactly one of plan, answer, extract must be set")
        return self
