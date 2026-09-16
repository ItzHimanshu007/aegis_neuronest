"""Server configuration. Adapter selection and CORS are environment-driven so the deployment can
choose between the mock adapter (default, used in dev/tests) and a real one without a code change.
"""

from __future__ import annotations

from functools import lru_cache

from app.vlm.base import VLMAdapter
from app.vlm.mock_adapter import MockAdapter

VERSION = "0.1.0"


class Settings:
    def __init__(self) -> None:
        import os

        self.version = VERSION
        self.adapter_name = os.environ.get("AEGIS_ADAPTER", "mock")
        self.cors_origins = [
            origin.strip()
            for origin in os.environ.get("AEGIS_CORS_ORIGINS", "").split(",")
            if origin.strip()
        ]
        self.adapter: VLMAdapter = self._build_adapter()

    def _build_adapter(self) -> VLMAdapter:
        if self.adapter_name == "mock":
            return MockAdapter()
        if self.adapter_name == "openai_compatible":
            # TODO(stage-3): read base_url/model from env once the adapter is implemented.
            from app.vlm.openai_compatible_adapter import OpenAICompatibleAdapter

            return OpenAICompatibleAdapter(base_url="http://localhost:8001/v1", model="aegis-vlm")
        raise ValueError(f"Unknown AEGIS_ADAPTER: {self.adapter_name!r}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
