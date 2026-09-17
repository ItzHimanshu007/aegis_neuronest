# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first.** It holds the **17 non-negotiable invariants** for this
repository, and they override anything you would otherwise infer from the code.

Then read:

- [`docs/architecture.md`](docs/architecture.md) — what Aegis is: a trusted local control plane
  around an untrusted remote agent, and how its modules fit together (v6).
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
   The one exception is display inside the Aegis panel — see invariant 4.

Three more that are easy to miss:

3. Every element is named by its **EID** from the Scene Graph, everywhere (invariant 12).
4. Every sealed payload carries a `state_token`, and every plan must echo it (invariant 13).
5. Every action passes the Authority Gate first. L5 (commit) always asks the user (invariant 14).

## Before you say you are done

Run `pnpm check`. It must pass — typecheck, ESLint, Vitest, ruff, pytest, and schema fixtures.
`pnpm e2e` (Chromium) and `pnpm e2e:firefox` need the demo portals running; both browsers are
supported targets, so a change that only works in one is not done.
Then write the STAGE REPORT described in `AGENTS.md` §11.
