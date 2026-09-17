"""OpenAI-compatible chat-completions adapter (Stage 3A Part C2).

Talks to any endpoint exposing `/chat/completions` with image input: Ollama, vLLM, or a hosted
provider serving an open-weight VLM. The model is untrusted — it proposes, and both this module
and the extension check what it proposed (AGENTS.md invariant 6).

Three things this module is careful about:

  **Nothing is logged but shape.** Latency, token counts and image size are recorded; request and
  response bodies never are, at any level, and neither is the API key. `tests/test_adapter.py`
  asserts this against captured log output.

  **One repair attempt, then give up.** Invalid JSON or a schema failure gets a single follow-up
  carrying only the validation error codes. A second failure returns a `fail` plan rather than
  anything half-understood.

  **Server-side enforcement before returning.** The client re-checks everything anyway, so this is
  defence in depth, not the guarantee: it catches a broken or hostile model early and gives the
  probe a place to measure how often that happens.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from pydantic import ValidationError

from app.prompts.scene import build_user_message
from app.prompts.system import FEW_SHOT_EXAMPLES, MAX_ACTIONS_PER_PLAN, SYSTEM_PROMPT
from app.schemas.payload import PayloadV2
from app.schemas.plan import Action, PlanV2
from app.schemas.tokens import TOKEN_RE

logger = logging.getLogger("aegis.vlm")

# Closed vocabulary. A reason code never contains model or page text.
FAIL_MODEL_OUTPUT_INVALID = "MODEL_OUTPUT_INVALID"
FAIL_MODEL_TIMEOUT = "MODEL_TIMEOUT"
FAIL_MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE"
FAIL_MODEL_UNGROUNDED = "MODEL_OUTPUT_UNGROUNDED"


@dataclass
class CallMetrics:
    """Per-call shape, for the response header and the model probe. No content, ever."""

    model_latency_ms: float = 0.0
    validation_ms: float = 0.0
    repairs: int = 0
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    image_bytes: int = 0
    outcome: str = "ok"
    json_valid_first_try: bool | None = None
    schema_valid_first_try: bool | None = None
    schema_valid_final: bool = False
    state_token_echoed: bool | None = None
    errors: list[str] = field(default_factory=list)


class OpenAICompatibleAdapter:
    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str | None = None,
        timeout_s: float = 90.0,
        max_tokens: int = 1024,
        temperature: float = 0.0,
        json_mode: str = "json_object",
        image_detail: str = "auto",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._api_key = api_key
        self.timeout_s = timeout_s
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.json_mode = json_mode
        self.image_detail = image_detail
        self._client = client
        # Populated on every call so the route can surface timings without threading a return value
        # through the adapter Protocol.
        self.last_metrics = CallMetrics()

    async def plan(self, payload: PayloadV2, history: list[str] | None = None) -> PlanV2:
        metrics = CallMetrics()
        self.last_metrics = metrics
        metrics.image_bytes = len(payload.image) if payload.image else 0

        messages = self._build_messages(payload, history or [])

        try:
            raw = await self._complete(messages, metrics)
        except httpx.TimeoutException:
            metrics.outcome = FAIL_MODEL_TIMEOUT
            logger.warning("model timeout after %.0fms", metrics.model_latency_ms)
            return _fail_plan(payload.state_token, FAIL_MODEL_TIMEOUT)
        except httpx.HTTPError:
            metrics.outcome = FAIL_MODEL_UNAVAILABLE
            logger.warning("model unavailable")
            return _fail_plan(payload.state_token, FAIL_MODEL_UNAVAILABLE)

        started = time.perf_counter()
        parsed, errors = _parse_and_validate(raw)
        metrics.json_valid_first_try = errors != ["INVALID_JSON"]
        metrics.schema_valid_first_try = parsed is not None

        if parsed is None:
            # One repair pass, carrying only error codes — the conversation already holds the
            # scene, and re-sending it would double the cost of a bad response.
            metrics.repairs = 1
            messages = [
                *messages,
                {"role": "assistant", "content": raw},
                {"role": "user", "content": _repair_instruction(errors)},
            ]
            try:
                raw = await self._complete(messages, metrics)
            except httpx.HTTPError:
                metrics.outcome = FAIL_MODEL_UNAVAILABLE
                return _fail_plan(payload.state_token, FAIL_MODEL_UNAVAILABLE)
            parsed, errors = _parse_and_validate(raw)

        metrics.validation_ms = (time.perf_counter() - started) * 1000

        if parsed is None:
            metrics.outcome = FAIL_MODEL_OUTPUT_INVALID
            metrics.errors = errors
            logger.warning("model output invalid after repair: %s", ",".join(errors))
            return _fail_plan(payload.state_token, FAIL_MODEL_OUTPUT_INVALID)

        metrics.schema_valid_final = True
        metrics.state_token_echoed = parsed.state_token == payload.state_token
        violation = enforce(parsed, payload)
        if violation is not None:
            metrics.outcome = FAIL_MODEL_UNGROUNDED
            metrics.errors = [violation]
            logger.warning("model output rejected: %s", violation)
            return _fail_plan(payload.state_token, FAIL_MODEL_UNGROUNDED)

        return parsed

    # -- request building ---------------------------------------------------------------------

    def _build_messages(self, payload: PayloadV2, history: list[str]) -> list[dict[str, Any]]:
        content: list[dict[str, Any]] = [
            {"type": "text", "text": build_user_message(payload, history)}
        ]
        if payload.image:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": payload.image, "detail": self.image_detail},
                }
            )
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            *FEW_SHOT_EXAMPLES,
            {"role": "user", "content": content},
        ]

    def _response_format(self) -> dict[str, Any] | None:
        if self.json_mode == "json_object":
            return {"type": "json_object"}
        if self.json_mode == "json_schema":
            return {
                "type": "json_schema",
                "json_schema": {"name": "aegis_plan_v2", "strict": False, "schema": _plan_schema()},
            }
        return None

    async def _complete(self, messages: list[dict[str, Any]], metrics: CallMetrics) -> str:
        body: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
        }
        response_format = self._response_format()
        if response_format is not None:
            body["response_format"] = response_format

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        started = time.perf_counter()
        client = self._client or httpx.AsyncClient(timeout=self.timeout_s)
        try:
            response = await client.post(
                f"{self.base_url}/chat/completions", json=body, headers=headers
            )
            response.raise_for_status()
            data = response.json()
        finally:
            if self._client is None:
                await client.aclose()
            metrics.model_latency_ms += (time.perf_counter() - started) * 1000

        usage = data.get("usage") or {}
        metrics.prompt_tokens = usage.get("prompt_tokens")
        metrics.completion_tokens = usage.get("completion_tokens")
        logger.info(
            "model call latency=%.0fms prompt_tokens=%s completion_tokens=%s image_bytes=%d",
            metrics.model_latency_ms,
            metrics.prompt_tokens,
            metrics.completion_tokens,
            metrics.image_bytes,
        )
        return (data["choices"][0]["message"].get("content") or "").strip()


# -- validation and enforcement ---------------------------------------------------------------


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if not text.startswith("```"):
        return text
    body = text.split("\n", 1)[1] if "\n" in text else ""
    return body.rsplit("```", 1)[0].strip()


def _parse_and_validate(raw: str) -> tuple[PlanV2 | None, list[str]]:
    try:
        value = json.loads(_strip_code_fence(raw))
    except json.JSONDecodeError:
        return None, ["INVALID_JSON"]
    try:
        return PlanV2.model_validate(value), []
    except ValidationError as exc:
        # Error TYPE and LOCATION only. The `input` field would echo model output into the next
        # prompt and into any error tracker.
        return None, [f"{'.'.join(str(p) for p in e['loc'])}:{e['type']}" for e in exc.errors()[:8]]


def _repair_instruction(errors: list[str]) -> str:
    return (
        "Your previous response was rejected by the schema. Error codes:\n"
        + "\n".join(errors)
        + "\nReturn the corrected JSON object only. No prose, no code fences."
    )


def enforce(plan: PlanV2, payload: PayloadV2) -> str | None:
    """Server-side checks before a plan is returned. Returns a closed reason code, or None.

    The extension re-checks all of this against the live page, which is the check that actually
    protects the user. This one catches a broken model before its output travels, and gives the
    probe something to count.
    """
    if plan.state_token != payload.state_token:
        return "STATE_TOKEN_MISMATCH"

    if plan.request_context is not None:
        # The schema forbids identifier fields; this catches an eid smuggled into the free text.
        if _mentions_identifier(plan.request_context.reason, payload):
            return "CONTEXT_REQUEST_NAMES_ELEMENT"
        return None

    # `answer` and `extract` carry no targets and no navigation. Tokens inside them are expected:
    # the panel resolves them for display only (AGENTS.md invariant 4's display exception).
    if plan.plan is None:
        return None

    if len(plan.plan) > MAX_ACTIONS_PER_PLAN:
        return "TOO_MANY_ACTIONS"

    by_eid = {el.eid: el for el in payload.elements}
    for action in plan.plan:
        violation = _check_action(action, by_eid)
        if violation is not None:
            return violation
    return None


def _check_action(action: Action, by_eid: dict[str, Any]) -> str | None:
    if action.target is not None:
        element = by_eid.get(action.target.eid)
        if element is None:
            return "UNKNOWN_EID"
        if element.fp != action.target.fp:
            return "FP_MISMATCH"

    # A token belongs in exactly one place: the text of a `type` action.
    if action.url and TOKEN_RE.search(action.url):
        return "TOKEN_IN_URL"
    if action.key and TOKEN_RE.search(action.key):
        return "TOKEN_IN_KEY"
    if action.value and TOKEN_RE.search(action.value):
        return "TOKEN_IN_SELECT_VALUE"
    if action.action != "type" and action.text and TOKEN_RE.search(action.text):
        return "TOKEN_OUTSIDE_TYPE"
    return None


def _mentions_identifier(reason: str, payload: PayloadV2) -> bool:
    lowered = reason.lower()
    return any(el.eid.lower() in lowered.split() for el in payload.elements)


def _fail_plan(state_token: str, reason: str) -> PlanV2:
    return PlanV2.model_validate(
        {
            "schema": "aegis/2",
            "state_token": state_token,
            "plan": [{"action": "fail", "reason": reason}],
        }
    )


def _plan_schema() -> dict[str, Any]:
    """The plan schema for providers supporting `json_schema` response format. Loaded from the
    shared contract so there is still exactly one source of truth."""
    from pathlib import Path

    schema_path = Path(__file__).resolve().parents[3] / "shared" / "schema" / "plan.v2.schema.json"
    return json.loads(schema_path.read_text())
