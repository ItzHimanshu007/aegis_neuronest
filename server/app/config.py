"""Server configuration. Adapter selection, model endpoint and CORS are environment-driven so a
deployment can move between the mock adapter (default, used in dev and tests) and a real model
without a code change.

`AEGIS_LLM_API_KEY` is read here and passed straight to the adapter. It is never logged, never
included in a response, and never sent to the extension — see `server/.env.example`.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.vlm.base import VLMAdapter
from app.vlm.mock_adapter import MockAdapter

VERSION = "0.1.0"

JsonMode = str

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def load_env_file(path: Path = ENV_FILE) -> None:
    """Loads `server/.env` into the process environment, without overwriting anything already set.

    Neither uvicorn nor pytest reads it on its own, and the alternative is every developer
    exporting five variables by hand. A real environment variable always wins, so CI and container
    deployments are unaffected by a stray local file.

    Tests set `AEGIS_IGNORE_ENV_FILE=1`. Without that, a developer who has pointed `.env` at a live
    model would silently change what the suite exercises — which is what happened the first time
    this function existed.
    """
    if os.environ.get("AEGIS_IGNORE_ENV_FILE") == "1" or not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


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


# Endpoints for providers that speak the OpenAI chat-completions shape, so a rotating setup needs
# only a key per provider. An unknown name is fine — supply its BASE_URL and MODEL explicitly.
PROVIDER_DEFAULTS: dict[str, dict[str, Any]] = {
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "model": "qwen/qwen3.8-27b",
    },
    "gemini": {
        # AI Studio's OpenAI-compatible surface.
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        # A *lite* model on purpose. Measured on the real sealed KYC payload, 3 runs each:
        #   gemini-3.6-flash       9973ms   ~640 thinking tokens before any output
        #   gemini-3.1-flash-lite  3445ms   0 thinking tokens, still plans BOTH fields in one call
        #   gemini-flash-lite-latest 1626ms 0 thinking tokens, but plans ONE field per call
        # The last is fastest per call and slowest per TASK: a second round trip costs another
        # observation and another chance for the page to move under us. Planning is a short,
        # heavily-constrained JSON emission against an explicit element list — the reasoning a
        # thinking model spends ten seconds on buys nothing here.
        "model": "gemini-3.1-flash-lite",
        # Thinking tokens are billed against max_tokens, so a budget sized for Groq truncated the
        # answer to nothing on a reasoning model: finish_reason "length" with zero completion
        # tokens. Gemini meters requests per minute rather than output tokens per minute, so the
        # headroom costs nothing here in a way it would on Groq.
        "max_tokens": 2000,
    },
    "openai": {"base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "model": "qwen/qwen2.5-vl-72b-instruct",
    },
    # Local runtimes need no credential.
    "ollama": {"base_url": "http://localhost:11434/v1", "model": "qwen2.5vl", "needs_key": False},
}


class Settings:
    def __init__(self) -> None:
        load_env_file()
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

        # Rotation (AEGIS_ADAPTER=rotating). An ordered, explicit list — a provider is never
        # inferred, because adding one decides who receives sealed payloads.
        self.llm_providers = [
            name.strip().lower()
            for name in os.environ.get("AEGIS_LLM_PROVIDERS", "").split(",")
            if name.strip()
        ]

        self.session_ttl_s = _env_float("AEGIS_SESSION_TTL_S", 900.0)

        self._adapter: VLMAdapter | None = None

    @property
    def adapter(self) -> VLMAdapter:
        """Built on first use, not in __init__.

        `app/main.py` calls `get_settings()` at module import to name the app version, so an
        eagerly-built adapter made merely IMPORTING the app read this machine's `server/.env` and
        construct real provider clients from it. The test suite's `_isolate_environment` fixture
        sets AEGIS_IGNORE_ENV_FILE, but a fixture cannot run before conftest's own imports — so a
        developer's private .env decided whether the suite could even be collected. A misconfigured
        provider list took every test down with an ImportError in conftest.
        """
        if self._adapter is None:
            self._adapter = self._build_adapter()
        return self._adapter

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
        if self.adapter_name == "rotating":
            return self._build_rotating_adapter()
        raise ValueError(f"Unknown AEGIS_ADAPTER: {self.adapter_name!r}")

    def _provider_setting(self, provider: str, suffix: str, default: str | None) -> str | None:
        """Per-provider override, else the known default. Never falls back to another provider's
        value: a missing key must fail loudly, not silently reuse the wrong credential."""
        return os.environ.get(f"AEGIS_LLM_{provider.upper()}_{suffix}") or default

    def _build_rotating_adapter(self) -> VLMAdapter:
        from app.vlm.openai_compatible_adapter import OpenAICompatibleAdapter
        from app.vlm.rotating_adapter import RotatingAdapter

        if not self.llm_providers:
            raise ValueError("AEGIS_ADAPTER=rotating requires AEGIS_LLM_PROVIDERS")

        providers: list[tuple[str, object]] = []
        for name in self.llm_providers:
            known = PROVIDER_DEFAULTS.get(name, {})
            base_url = self._provider_setting(name, "BASE_URL", known.get("base_url"))
            model = self._provider_setting(name, "MODEL", known.get("model"))
            api_key = self._provider_setting(name, "API_KEY", None)
            max_tokens = _env_int(
                f"AEGIS_LLM_{name.upper()}_MAX_TOKENS",
                int(known.get("max_tokens", self.llm_max_tokens)),
            )
            if not base_url or not model:
                raise ValueError(
                    f"Provider {name!r} needs AEGIS_LLM_{name.upper()}_BASE_URL and "
                    f"AEGIS_LLM_{name.upper()}_MODEL (no built-in default for this name)"
                )
            if api_key is None and known.get("needs_key", True):
                raise ValueError(f"Provider {name!r} needs AEGIS_LLM_{name.upper()}_API_KEY")
            providers.append(
                (
                    name,
                    OpenAICompatibleAdapter(
                        base_url=base_url,
                        model=model,
                        api_key=api_key,
                        timeout_s=self.llm_timeout_s,
                        max_tokens=max_tokens,
                        temperature=self.llm_temperature,
                        json_mode=self._provider_setting(name, "JSON_MODE", self.llm_json_mode)
                        or self.llm_json_mode,
                        image_detail=self.llm_image_detail,
                    ),
                )
            )
        return RotatingAdapter(providers)


@lru_cache
def get_settings() -> Settings:
    return Settings()
