"""Pydantic v2 mirror of shared/schema/payload.v2.schema.json.

The JSON Schema is the single source of truth (AGENTS.md). This mirror is proven to agree with it
by server/tests/test_schema_agreement.py, which validates the same fixtures against both.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import ConfigDict, Field, model_validator

from app.schemas.common import EID, StateTokenId, StrictObject
from app.schemas.tokens import TOKEN_PATTERN

Mode = Literal["fast", "balanced", "accurate"]
ValueLenBucket = Literal["empty", "short", "medium", "long"]
RedactionKind = Literal["FILL", "LABELLED_FILL", "BLUR", "FILL_REGION"]
# An HMAC token minted by the extension vault — see AGENTS.md invariant 3 and
# app/schemas/tokens.py, which holds the single mirrored TOKEN_PATTERN.
PiiToken = Annotated[str, Field(pattern=rf"^{TOKEN_PATTERN}$")]

BBox = Annotated[list[int], Field(min_length=4, max_length=4)]
DataUrlImage = Annotated[
    str, Field(pattern=r"^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$")
]


class Page(StrictObject):
    model_config = ConfigDict(extra="forbid", strict=True)

    url: str
    title: str
    type: str | None = None


class Element(StrictObject):
    model_config = ConfigDict(extra="forbid", strict=True)

    eid: EID
    fp: str = Field(min_length=1)
    role: str
    label: str
    input_type: str | None = None
    has_value: bool | None = None
    value_len_bucket: ValueLenBucket | None = None
    value_token: PiiToken | None = None
    bbox: BBox
    visible: bool
    enabled: bool
    hidden_interactive: bool | None = None
    occluded: bool | None = None
    covered_by: EID | None = None

    @model_validator(mode="after")
    def password_has_no_length(self):
        if self.input_type == "password" and self.value_len_bucket is not None:
            raise ValueError("password length must not be included")
        return self


class VisualRegion(StrictObject):
    model_config = ConfigDict(extra="forbid", strict=True)

    rid: str = Field(min_length=1)
    class_: str = Field(alias="class")
    bbox: BBox
    ocr: str | None = None


class Redaction(StrictObject):
    eid: EID | None = None
    model_config = ConfigDict(extra="forbid", strict=True)

    rid: str = Field(min_length=1)
    kind: RedactionKind
    type: str
    bbox: BBox
    reason: str | None = None
    token: PiiToken | None = None


class TextBlock(StrictObject):
    """Sanitized visible text block (Stage 2 Part F.3). `text` may contain tokens, never raw PII."""

    model_config = ConfigDict(extra="forbid", strict=True)

    tid: str = Field(min_length=1)
    role: str
    text: str
    bbox: BBox


class FieldHint(StrictObject):
    eid: EID
    category: str = Field(min_length=1)
    fill: Literal["empty"]


class HistoryEntry(StrictObject):
    """Sealed client facts: closed enums only, never a page string."""

    step: int = Field(ge=0, le=100000)
    action: Literal[
        "observe",
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
        "request_context",
    ]
    eid: EID | None = None
    verdict: Literal[
        "PASS", "FAIL", "REJECT", "ABORT_BATCH", "DROP_REMAINING", "USER_REQUIRED", "STOPPED"
    ]
    code: (
        Literal[
            "STALE_PLAN",
            "INVALID_SCHEMA",
            "PLAN_STEPS_REPEATED",
            "NEW_SCREEN",
            "TARGET_MISSING",
            "FP_MISMATCH",
            "AMBIGUOUS_TARGET",
            "NOT_VISIBLE",
            "NOT_HITTABLE",
            "DISABLED",
            "TOKEN_TYPE_MISMATCH",
            "TOKEN_IN_URL",
            "TOKEN_IN_KEY",
            "TOKEN_OUTSIDE_TYPE",
            "UNSUPPORTED_URL",
            "NEVER_AUTOMATED",
            "CONSENT_DENIED",
            "APPROVAL_SKIPPED",
            "EXEC_FAILED",
            "EXEC_UNTRUSTED_REJECTED",
            "VALUE_MISMATCH",
            "EXPECT_FAILED",
            "UNVERIFIABLE",
            "DONE_UNVERIFIED",
            "REQUIREMENTS_UNMET",
            "BUDGET_EXHAUSTED",
            "LOOP_DETECTED",
            "NO_PROGRESS",
            "CONTEXT_DENIED",
            "NETWORK_ERROR",
            "STOPPED",
            "USER_HINT",
            "USER_RETRY",
            "MODEL_FAILED",
        ]
        | None
    ) = None


class PayloadV2(StrictObject):
    """Sanitized payload sent from the extension to the server. See AGENTS.md invariant 1: this is
    the only shape of data the server is ever allowed to see."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    session: str = Field(min_length=1)
    capture_id: str = Field(min_length=1)
    state_token: StateTokenId
    schema_: Literal["aegis/2"] = Field(alias="schema")
    mode: Mode
    task: str
    page: Page
    elements: list[Element]
    visual_regions: list[VisualRegion] = Field(default_factory=list)
    texts: list[TextBlock] = Field(default_factory=list)
    redactions: list[Redaction]
    image: DataUrlImage | None = None
    field_hints: list[FieldHint] = Field(default_factory=list)

    history: list[HistoryEntry] = Field(default_factory=list, max_length=25)
    context_denied: Literal["BUDGET_EXHAUSTED", "NO_SAFE_ELEMENTS", "INVALID_REQUEST"] | None = None
