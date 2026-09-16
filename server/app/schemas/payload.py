"""Pydantic v2 mirror of shared/schema/payload.v1.schema.json.

The JSON Schema is the single source of truth (AGENTS.md). This mirror is proven to agree with it
by server/tests/test_schema_agreement.py, which validates the same fixtures against both.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Mode = Literal["fast", "balanced", "accurate"]
ValueLenBucket = Literal["empty", "short", "medium", "long"]
RedactionKind = Literal["FILL", "BLUR", "FILL_REGION"]

BBox = Annotated[list[int], Field(min_length=4, max_length=4)]
DataUrlImage = Annotated[
    str, Field(pattern=r"^data:image/(webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$")
]


class Page(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    title: str
    type: str | None = None


class Element(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mark_id: int = Field(ge=0)
    fp: str = Field(min_length=1)
    role: str
    label: str
    input_type: str | None = None
    has_value: bool | None = None
    value_len_bucket: ValueLenBucket | None = None
    bbox: BBox
    visible: bool
    enabled: bool
    hidden_interactive: bool | None = None


class VisualRegion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rid: str = Field(min_length=1)
    class_: str = Field(alias="class")
    bbox: BBox
    ocr: str | None = None


class Redaction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rid: str = Field(min_length=1)
    kind: RedactionKind
    type: str
    bbox: BBox
    reason: str | None = None


class PayloadV1(BaseModel):
    """Sanitized payload sent from the extension to the server. See AGENTS.md invariant 1: this is
    the only shape of data the server is ever allowed to see."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    session: str = Field(min_length=1)
    capture_id: str = Field(min_length=1)
    schema_: Literal["aegis/1"] = Field(alias="schema")
    mode: Mode
    task: str
    page: Page
    elements: list[Element]
    visual_regions: list[VisualRegion] = Field(default_factory=list)
    redactions: list[Redaction]
    image: DataUrlImage | None = None
    delta: dict | None = None  # TODO(stage-8): define the delta shape
