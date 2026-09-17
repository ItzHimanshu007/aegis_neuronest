"""Server configuration. Adapter selection, model endpoint and CORS are environment-driven so a
deployment can move between the mock adapter (default, used in dev and tests) and a real model
without a code change.

`AEGIS_LLM_API_KEY` is read here and passed straight to the adapter. It is never logged, never
included in a response, and never sent to the extension — see `server/.env.example`.
"""

from __future__ import annotations

import os
from functools import lru_cache

from app.vlm.base import VLMAdapter
from app.vlm.mock_adapter import MockAdapter

VERSION = "0.1.0"

JsonMode = str


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ[name])
    except (KeyError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ[name])
    except (KeyError, ValueError):
        return default


class Settings:
    def __init__(self) -> None:
        self.version = VERSION
        self.adapter_name = os.environ.get("AEGIS_ADAPTER", "mock")
        self.cors_origins = [
            origin.strip()
            for origin in os.environ.get("AEGIS_CORS_ORIGINS", "").split(",")
            if origin.strip()
        ]

        # Model endpoint. Local runtimes (Ollama, vLLM) usually need no key at all.
        self.llm_base_url = os.environ.get("AEGIS_LLM_BASE_URL", "http://localhost:11434/v1")
        self.llm_model = os.environ.get("AEGIS_LLM_MODEL", "qwen2.5vl")
        self.llm_api_key = os.environ.get("AEGIS_LLM_API_KEY") or None
        self.llm_timeout_s = _env_float("AEGIS_LLM_TIMEOUT_S", 90.0)
        self.llm_max_tokens = _env_int("AEGIS_LLM_MAX_TOKENS", 1024)
        self.llm_temperature = _env_float("AEGIS_LLM_TEMPERATURE", 0.0)
        # json_schema is strictest and what we want where a provider supports it; json_object is
        # the widely-available fallback; none means "ask in the prompt and hope", which the repair
        # pass exists to catch.
        self.llm_json_mode: JsonMode = os.environ.get("AEGIS_LLM_JSON_MODE", "json_object")
        self.llm_image_detail = os.environ.get("AEGIS_LLM_IMAGE_DETAIL", "auto")

        self.session_ttl_s = _env_float("AEGIS_SESSION_TTL_S", 900.0)

        self.adapter: VLMAdapter = self._build_adapter()

    def _build_adapter(self) -> VLMAdapter:
        if self.adapter_name == "mock":
            return MockAdapter()
        if self.adapter_name in ("openai_compat", "openai_compatible"):
            from app.vlm.openai_compatible_adapter import OpenAICompatibleAdapter

            return OpenAICompatibleAdapter(
                base_url=self.llm_base_url,
                model=self.llm_model,
                api_key=self.llm_api_key,
                timeout_s=self.llm_timeout_s,
                max_tokens=self.llm_max_tokens,
                temperature=self.llm_temperature,
                json_mode=self.llm_json_mode,
                image_detail=self.llm_image_detail,
            )
        raise ValueError(f"Unknown AEGIS_ADAPTER: {self.adapter_name!r}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
