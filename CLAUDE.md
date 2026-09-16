# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first.** It holds the non-negotiable invariants for this repository,
and they override anything you would otherwise infer from the code.

Then read:

- [`docs/architecture.md`](docs/architecture.md) — what Aegis is and how the seven layers fit together.
- [`docs/STAGES.md`](docs/STAGES.md) — the build plan. **Only implement the current stage.**
- [`docs/threat_model.md`](docs/threat_model.md) — what we defend against, and what we do not.
- [`docs/policy.yaml`](docs/policy.yaml) — the PII policy matrix.

## The short version

Aegis keeps every raw pixel and every raw string inside the browser. The server sees tokens and
redacted images, and it only ever *proposes* actions — the extension validates, reacquires,
re-hydrates and executes them.

The two rules that break the project if you get them wrong:

1. `net/network.ts → send()` is the only network path, and only `privacy/firewall.ts → seal()` can
   mint the `SanitizedPayload` it accepts.
2. Tokens re-hydrate only inside a `type` action, into a type-matched field, on a consented origin.

## Before you say you are done

Run `pnpm check`. It must pass — typecheck, ESLint, Vitest, ruff, pytest, and schema fixtures.
Then write the STAGE REPORT described in `AGENTS.md` §11.
