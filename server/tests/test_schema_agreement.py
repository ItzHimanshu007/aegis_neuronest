"""Proves that the Pydantic mirrors (app/schemas) agree with the JSON Schema (single source of
truth, /shared/schema) on the shared fixtures, and that the two token patterns match.

See AGENTS.md: "Pydantic models mirror them and a test proves the two agree on the fixtures."
"""

import json
import re
from pathlib import Path

import jsonschema
import pytest

from app.schemas.payload import PayloadV2
from app.schemas.plan import PlanV2
from app.schemas.tokens import TOKEN_PATTERN as PY_TOKEN_PATTERN

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = REPO_ROOT / "shared" / "schema"
FIXTURES_DIR = SCHEMA_DIR / "examples"


def _load(name: str) -> dict:
    return json.loads((SCHEMA_DIR / name).read_text())


def _load_example(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text())


@pytest.mark.parametrize(
    ("schema_file", "example_file", "model"),
    [
        ("payload.v2.schema.json", "payload.kyc.json", PayloadV2),
        ("plan.v2.schema.json", "plan.kyc.json", PlanV2),
    ],
)
def test_fixture_matches_json_schema_and_pydantic(schema_file, example_file, model):
    schema = _load(schema_file)
    example = _load_example(example_file)

    # 1. The fixture matches the JSON Schema (source of truth).
    jsonschema.Draft202012Validator(schema).validate(example)

    # 2. The fixture also matches the Pydantic mirror.
    instance = model.model_validate(example)

    # 3. Round-tripping through the Pydantic model and back to the JSON Schema still validates —
    #    this is what actually proves the two agree, not just that both accept the same fixture.
    round_tripped = json.loads(instance.model_dump_json(by_alias=True, exclude_none=True))
    jsonschema.Draft202012Validator(schema).validate(round_tripped)


def test_token_pattern_matches_typescript_source():
    ts_source = (REPO_ROOT / "extension" / "shared" / "schema" / "tokens.ts").read_text()
    match = re.search(r"TOKEN_PATTERN = /(.+)/;", ts_source)
    assert match, "could not find TOKEN_PATTERN in tokens.ts"
    ts_pattern = match.group(1)
    assert ts_pattern == PY_TOKEN_PATTERN, (
        "server/app/schemas/tokens.py TOKEN_PATTERN has drifted from "
        "extension/shared/schema/tokens.ts — see AGENTS.md invariant 3"
    )


@pytest.mark.parametrize("fixture", _load("agreement-cases.json"), ids=lambda f: f["name"])
def test_v2_agreement_matrix(fixture):
    schema = _load(f"{fixture['kind']}.v2.schema.json")
    validator = jsonschema.Draft202012Validator(schema)
    assert validator.is_valid(fixture["value"]) is fixture["valid"]
    model = PayloadV2 if fixture["kind"] == "payload" else PlanV2
    if fixture["valid"]:
        result = model.model_validate(fixture["value"])
        validator.validate(json.loads(result.model_dump_json(by_alias=True, exclude_none=True)))
    else:
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            model.model_validate(fixture["value"])
