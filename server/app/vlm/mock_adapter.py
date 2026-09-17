"""Deterministic adapter used for Stage 0 wiring and tests. No model, no network call.

Echoes the KYC example plan when the page is classified as a KYC form; otherwise returns a
trivial `done` plan. This lets the extension shell, the demo portal and `pnpm check` exercise the
full request/response shape before a real model is wired in (Stage 3).
"""

from __future__ import annotations

from app.schemas.payload import PayloadV2
from app.schemas.plan import Action, Expect, PlanV2, Target


class MockAdapter:
    async def plan(self, payload: PayloadV2) -> PlanV2:
        if payload.page.type == "kyc_form":
            name_el = next((e for e in payload.elements if e.input_type == "text"), None)
            email_el = next((e for e in payload.elements if e.input_type == "email"), None)
            actions: list[Action] = []
            if name_el is not None and name_el.value_token is not None:
                actions.append(
                    Action(
                        action="type",
                        target=Target(eid=name_el.eid, fp=name_el.fp),
                        text=name_el.value_token,
                    )
                )
            if email_el is not None and email_el.value_token is not None:
                actions.append(
                    Action(
                        action="type",
                        target=Target(eid=email_el.eid, fp=email_el.fp),
                        text=email_el.value_token,
                    )
                )
            actions.append(
                Action(
                    action="ask_user",
                    reason=(
                        "Mock preview only. Credentials require explicit user consent "
                        "and entry in the Aegis panel in Stage 3."
                    ),
                )
            )
            return PlanV2(schema="aegis/2", state_token=payload.state_token, plan=actions)

        return PlanV2(
            schema="aegis/2",
            state_token=payload.state_token,
            plan=[Action(action="done", evidence=Expect(url_path_prefix="/"))],
        )
