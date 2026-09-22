from fastapi import APIRouter

from app.config import get_settings

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    """Liveness, plus which models this server can actually reach.

    The panel's model picker is built from `providers`. Listing them here rather than inventing a
    new endpoint keeps the extension's permitted requests exactly as they were (AGENTS.md
    invariant 2): `/health` already carries no page data in either direction.

    Building the adapter can raise on a misconfiguration (a provider named in AEGIS_LLM_PROVIDERS
    with no API key, say). Health must still answer in that case — a server you cannot ask "what
    is wrong" is worse than one that is merely misconfigured — so the reason is reported as a
    field. Only our own configuration errors are surfaced verbatim; anything else is generic,
    because an arbitrary exception string is not a thing to hand to a client.
    """
    settings = get_settings()
    providers: list[dict[str, str]] = []
    adapter_error: str | None = None
    try:
        adapter = settings.adapter
        if hasattr(adapter, "providers"):
            providers = [
                {"name": name, "model": getattr(impl, "model", "")}
                for name, impl in adapter.providers
            ]
        elif hasattr(adapter, "model"):
            providers = [{"name": settings.adapter_name, "model": adapter.model}]
        else:
            providers = [{"name": settings.adapter_name, "model": settings.adapter_name}]
    except ValueError as exc:
        adapter_error = str(exc)
    except Exception:
        adapter_error = "The model adapter could not be constructed."

    return {
        "status": "ok",
        "version": settings.version,
        "model_adapter": settings.adapter_name,
        "providers": providers,
        **({"adapter_error": adapter_error} if adapter_error else {}),
    }
