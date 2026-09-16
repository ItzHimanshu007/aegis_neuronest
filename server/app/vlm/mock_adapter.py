"""Deterministic adapter used for Stage 0 wiring and tests. No model, no network call.

Echoes the KYC example plan when the page is classified as a KYC form; otherwise returns a
trivial `done` plan. This lets the extension shell, the demo portal and `pnpm check` exercise the
full request/response shape before a real model is wired in (Stage 3).
"""

from __future__ import annotations

from app.schemas.payload import PayloadV1
from app.schemas.plan import Action, PlanV1, Target


class MockAdapter:
    async def plan(self, payload: PayloadV1) -> PlanV1:
        if payload.page.type == "kyc_form":
            name_el = next((e for e in payload.elements if e.input_type == "text"), None)
            email_el = next((e for e in payload.elements if e.input_type == "email"), None)
            actions: list[Action] = []
            if name_el is not None:
                actions.append(
                    Action(
                        action="type",
                        target=Target(mark_id=name_el.mark_id, fp=name_el.fp),
                        text="[[PII:NAME:k4m2xq7b]]",
                    )
                )
            if email_el is not None:
                actions.append(
                    Action(
                        action="type",
                        target=Target(mark_id=email_el.mark_id, fp=email_el.fp),
                        text="[[PII:EMAIL:t5z5n7vd]]",
                    )
                )
            actions.append(
                Action(
                    action="ask_user",
                    reason=(
                        "The Password field is marked never_automated. "
                        "The user must enter it directly."
                    ),
                )
            )
            return PlanV1(plan=actions)

        return PlanV1(plan=[Action(action="done", reason="mock")])
