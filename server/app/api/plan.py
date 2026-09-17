"""The /v1/plan route.

Stage 2 Part F.6: the extension sends the EXACT bytes it sealed and digested, with the digest in
`X-Aegis-Digest`. This route recomputes SHA-256 over the raw request body and rejects a mismatch —
that makes any mutation in transit (a proxy rewriting JSON, a middleware "helpfully" reformatting)
a hard failure rather than a silent acceptance of something the extension never checked.

Logging discipline: only the digest and byte size are ever logged. The request body is never
logged, even at debug level (AGENTS.md invariant 1 — the server is honest-but-curious in our
threat model, and this is the courtesy half of that; the design does not depend on it).
"""

import hashlib
import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.schemas.payload import PayloadV2
from app.schemas.plan import PlanV2
from app.vlm.base import VLMAdapter

router = APIRouter()
logger = logging.getLogger("aegis.plan")


@router.post(
    "/v1/plan",
    response_model=PlanV2,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
async def plan(
    request: Request,
    x_aegis_digest: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
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

    adapter: VLMAdapter = settings.adapter
    return await adapter.plan(payload)


def _safe_validation_detail(exc: Exception) -> list[dict] | str:
    """Validation errors can echo the offending input back to the client. Strip the `input` and
    `ctx` fields so a 422 response never reflects payload content into logs or error trackers."""
    if isinstance(exc, ValidationError):
        return [{"type": e["type"], "loc": e["loc"], "msg": e["msg"]} for e in exc.errors()]
    return "invalid JSON body"
