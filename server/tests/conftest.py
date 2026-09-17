import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "shared" / "schema" / "examples"


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def kyc_payload() -> dict:
    return json.loads((FIXTURES_DIR / "payload.kyc.json").read_text())


@pytest.fixture
def kyc_plan() -> dict:
    return json.loads((FIXTURES_DIR / "plan.kyc.json").read_text())


@pytest.fixture
def anyio_backend() -> str:
    """Async tests run on asyncio only; trio isn't a dependency."""
    return "asyncio"
