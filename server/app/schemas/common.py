"""Strict objects with omitted optionals (JSON Schema does not allow explicit null)."""

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

EID = Annotated[str, Field(pattern=r"^E[0-9]{1,6}$")]
StateTokenId = Annotated[str, Field(pattern=r"^S[a-z2-7]{10}$")]


class StrictObject(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def no_explicit_null(cls, value: Any) -> Any:
        if isinstance(value, dict) and any(v is None for v in value.values()):
            raise ValueError("optional properties must be omitted, not null")
        return value
