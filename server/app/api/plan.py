"""The /v1/plan and /v1/session/end routes.

Stage 2 Part F.6: the extension sends the EXACT bytes it sealed and digested, with the digest in
`X-Aegis-Digest`. This route recomputes SHA-256 over the raw request body and rejects a mismatch —
that makes any mutation in transit (a proxy rewriting JSON, a middleware "helpfully" reformatting)
a hard failure rather than a silent acceptance of something the extension never checked.

Stage 3A adds the session history the planner sees (sanitized, text-only, no images), a
`X-Aegis-Timings` response header carrying model/validation shape, and the deterministic mock
scenarios used by the Stage 3B tests.

Logging discipline: only the digest and byte size are ever logged. The request body is never
logged, even at debug level (AGENTS.md invariant 1 — the server is honest-but-curious in our
threat model, and this is the courtesy half of that; the design does not depend on it).
"""

import hashlib
import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.schemas.payload import PayloadV2
from app.schemas.plan import PlanV2
from app.session_store import SessionStore
from app.vlm.base import VLMAdapter

router = APIRouter()
logger = logging.getLogger("aegis.plan")

_store: SessionStore | None = None


def get_store(settings: Settings = Depends(get_settings)) -> SessionStore:
    global _store
    if _store is None:
        _store = SessionStore(ttl_s=settings.session_ttl_s)
    return _store


@router.post(
    "/v1/plan",
    response_model=PlanV2,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
async def plan(
    request: Request,
    response: Response,
    x_aegis_digest: str | None = Header(default=None),
    x_aegis_mock_scenario: str | None = Header(default=None),
    x_aegis_provider: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
    store: SessionStore = Depends(get_store),
) -> PlanV2:
    raw_body = await request.body()
    computed = hashlib.sha256(raw_body).hexdigest()

    if x_aegis_digest is not None and x_aegis_digest != computed:
        logger.warning(
            "digest mismatch: header=%s computed=%s size=%d",
            x_aegis_digest,
            computed,
            len(raw_body),
        )
        raise HTTPException(
            status_code=400, detail="X-Aegis-Digest does not match the request body"
        )

    # Only ever the digest and size — never the body itself.
    logger.info("plan request digest=%s size=%d", computed, len(raw_body))

    try:
        payload = PayloadV2.model_validate(json.loads(raw_body))
    except (ValidationError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=_safe_validation_detail(exc)) from exc

    store.record_state_token(payload.session, payload.state_token)

    if x_aegis_mock_scenario is not None:
        # Scenarios are a test affordance. Honouring the header against a real model would let a
        # caller pin the server's answer, so it is refused outside mock mode.
        if settings.adapter_name != "mock":
            raise HTTPException(
                status_code=400, detail="X-Aegis-Mock-Scenario requires AEGIS_ADAPTER=mock"
            )
        from app.vlm.mock_scenarios import run_scenario

        result = run_scenario(x_aegis_mock_scenario, payload)
        _record_and_annotate(store, payload, result, response, timings=None)
        return result

    adapter: VLMAdapter = settings.adapter
    history = store.history_for_prompt(payload.session)
    result = await _call_adapter(adapter, payload, history, x_aegis_provider)
    _record_and_annotate(
        store, payload, result, response, timings=getattr(adapter, "last_metrics", None)
    )
    return result


async def _call_adapter(
    adapter: VLMAdapter,
    payload: PayloadV2,
    history: list[str],
    provider: str | None = None,
) -> PlanV2:
    """Adapters were added in layers: the mock predates the history argument, and only the
    rotating adapter understands a provider pin. Offer each argument, fall back when it is not
    accepted. The pin names a provider this server already has configured — it can never introduce
    an endpoint, so it carries no ability to redirect where a payload goes."""
    if provider:
        try:
            return await adapter.plan(payload, history, provider)  # type: ignore[call-arg]
        except TypeError:
            pass
    try:
        return await adapter.plan(payload, history)  # type: ignore[call-arg]
    except TypeError:
        return await adapter.plan(payload)


def _record_and_annotate(
    store: SessionStore,
    payload: PayloadV2,
    result: PlanV2,
    response: Response,
    timings: object | None,
) -> None:
    if result.plan_steps:
        store.record_plan_steps(payload.session, result.plan_steps)
    if timings is not None:
        response.headers["X-Aegis-Timings"] = json.dumps(
            {
                "model_ms": round(getattr(timings, "model_latency_ms", 0.0), 1),
                "validation_ms": round(getattr(timings, "validation_ms", 0.0), 1),
                "repairs": getattr(timings, "repairs", 0),
                "prompt_tokens": getattr(timings, "prompt_tokens", None),
                "completion_tokens": getattr(timings, "completion_tokens", None),
                "image_bytes": getattr(timings, "image_bytes", 0),
                "outcome": getattr(timings, "outcome", "ok"),
            }
        )


@router.post("/v1/session/end", status_code=204)
async def end_session(
    request: Request,
    store: SessionStore = Depends(get_store),
) -> Response:
    """Drops a session's stored history. The client calls this when a task ends; the TTL is the
    backstop for a client that never does."""
    try:
        body = json.loads(await request.body() or b"{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="invalid JSON body") from exc
    if not isinstance(body, dict) or set(body) != {"session"}:
        raise HTTPException(status_code=400, detail="session only")
    session_id = body.get("session")
    if not isinstance(session_id, str) or not session_id:
        raise HTTPException(status_code=400, detail="session is required")
    store.end(session_id)
    return Response(status_code=204)


def _safe_validation_detail(exc: Exception) -> list[dict] | str:
    """Validation errors can echo the offending input back to the client. Strip the `input` and
    `ctx` fields so a 422 response never reflects payload content into logs or error trackers."""
    if isinstance(exc, ValidationError):
        return [{"type": e["type"], "loc": e["loc"], "msg": e["msg"]} for e in exc.errors()]
    return "invalid JSON body"
