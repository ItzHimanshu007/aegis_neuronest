"""The compact scene format (Stage 3A Part D3).

One line per element beats JSON here: the model has to ground `target.eid` against what it sees,
and a flat line keeps the eid and fp adjacent and cheap. Everything in this module comes from an
already-sealed payload, so there is nothing to sanitize — but there is also nothing to add: this
renders what the payload holds and never invents a field.
"""

from __future__ import annotations

from app.schemas.payload import PayloadV2

# History is capped so a long task cannot grow the prompt without bound.
MAX_HISTORY_STEPS = 8
# Text blocks are budgeted for the same reason; the image carries the layout.
MAX_TEXT_BLOCKS = 40
MAX_TEXT_CHARS = 2000


def _bbox(bbox: list[int]) -> str:
    return f"[{','.join(str(int(v)) for v in bbox)}]"


def render_elements(payload: PayloadV2) -> str:
    hints = {hint.eid: hint for hint in (payload.field_hints or [])}
    lines: list[str] = []
    for el in payload.elements:
        parts = [el.eid, f"fp={el.fp}", el.role, f'"{el.label}"', _bbox(el.bbox)]
        if el.input_type:
            parts.append(f"type={el.input_type}")
        if not el.visible:
            parts.append("hidden")
        if not el.enabled:
            parts.append("disabled")
        if el.has_value is not None:
            parts.append("filled" if el.has_value else "empty")
        if el.value_token:
            parts.append(f"value={el.value_token}")
        hint = hints.get(el.eid)
        if hint is not None:
            parts.append(f"hint={hint.category}")
        if el.occluded:
            parts.append("occluded=true")
            if el.covered_by:
                parts.append(f"covered_by={el.covered_by}")
        lines.append(" ".join(parts))
    return "\n".join(lines)


def render_texts(payload: PayloadV2) -> str:
    lines: list[str] = []
    used = 0
    for block in (payload.texts or [])[:MAX_TEXT_BLOCKS]:
        text = block.text.strip()
        if not text:
            continue
        if used + len(text) > MAX_TEXT_CHARS:
            lines.append("… (text truncated)")
            break
        used += len(text)
        lines.append(f"{block.tid} {text}")
    return "\n".join(lines)


def render_regions(payload: PayloadV2) -> str:
    return "\n".join(f"{r.rid} {r.class_} {_bbox(r.bbox)}" for r in (payload.visual_regions or []))


def render_history(history: list[str]) -> str:
    return "\n".join(history[-MAX_HISTORY_STEPS:])


def build_user_message(payload: PayloadV2, history: list[str] | None = None) -> str:
    """The per-request half of the prompt. The system prompt is static and cached; everything that
    varies is here."""
    sections: list[str] = [
        f"task: {payload.task}",
        f"state_token: {payload.state_token}",
        f"page: {payload.page.url} | {payload.page.title} | {payload.page.type or 'unknown'}",
        f"mode: {payload.mode}",
        "",
        "elements:",
        render_elements(payload) or "(none)",
    ]

    texts = render_texts(payload)
    if texts:
        sections += ["", "text:", texts]

    regions = render_regions(payload)
    if regions:
        sections += ["", "regions (masked, contents unavailable):", regions]

    if payload.redactions:
        kinds = sorted({r.type for r in payload.redactions})
        sections += ["", f"redacted on screen: {', '.join(kinds)}"]

    rendered_history = render_history(history or [])
    if rendered_history:
        sections += ["", "history (most recent last):", rendered_history]

    if payload.image is None:
        sections += ["", "note: no screenshot this turn — the screen has not changed."]

    return "\n".join(sections)
