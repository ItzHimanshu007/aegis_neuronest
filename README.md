# Aegis

A privacy-preserving browser vision agent for **SIH26171** (ISRO / Department of Space).

Aegis reads and acts on web pages from inside the browser, using a local vision model to see the
screen and a local privacy pipeline to strip PII before anything reaches the server. The server
only ever sees tokens and redacted pixels, and only ever proposes actions — the extension validates,
reacquires, re-hydrates and executes them. See [`docs/architecture.md`](docs/architecture.md) for
the full design and [`AGENTS.md`](AGENTS.md) for the invariants every change must respect.

This repository is currently at **Stage 0 — Foundations** (see [`docs/STAGES.md`](docs/STAGES.md)):
repo structure, contracts, extension and server shells. There is no agent logic, ML or PII
detection yet — those land in later stages.

## Prerequisites

- Node.js 22+ and [pnpm](https://pnpm.io) 10+ (`corepack enable` or `npm i -g pnpm`)
- Python 3.12 and [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Chrome and/or Firefox for loading the extension
- [`web-ext`](https://github.com/mozilla/web-ext) is installed automatically as a dev dependency

## Setup

```sh
pnpm install
```

This also runs `wxt prepare` in `extension/` (via `postinstall`) to generate WXT's internal types.

## Running things

### Server (FastAPI, mock adapter by default)

```sh
pnpm server
```

Serves on `http://localhost:8000`. `GET /health` and `POST /v1/plan` are available; see
[`shared/schema/examples`](shared/schema/examples) for example request/response bodies.

### Demo portal (Vite)

```sh
pnpm portal
```

Serves on `http://localhost:5174`. Open `/kyc.html` for the synthetic KYC form, or
`/kyc.html?banner=1` to test a cookie banner covering the Submit button. **All data on these pages
is synthetic** — see the "DEMO — SYNTHETIC DATA" badge on every page.

### Extension — Chrome

```sh
pnpm dev:chrome
```

Or build and load unpacked:

```sh
pnpm build   # writes extension/.output/chrome-mv3 and extension/.output/firefox-mv3
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** →
select `extension/.output/chrome-mv3`. Click the Aegis toolbar icon to open the side panel.

### Extension — Firefox

```sh
pnpm dev:firefox
```

This runs `wxt --browser firefox`, which launches Firefox via `web-ext` with the extension loaded
temporarily. To load manually instead: `about:debugging#/runtime/this-firefox` → **Load Temporary
Add-on** → select any file inside `extension/.output/firefox-mv3` (e.g. `manifest.json`).

Firefox is built as **MV3** (event-page background, `sidebar_action`), not WXT's MV2 default —
see `extension/wxt.config.ts`. Click the Aegis toolbar icon to open the sidebar.

If the panel shows a host-permission warning, grant `<all_urls>` via `about:addons` → Aegis →
Permissions, or accept the prompt shown after loading.

## Checks

```sh
pnpm check
```

Runs, in order: JSON Schema fixture validation, extension typecheck, ESLint (including the rule
that forbids `fetch`/`XMLHttpRequest`/`WebSocket` outside `extension/net/network.ts`), extension
Vitest suite, server `ruff check`/`ruff format --check`, and server `pytest`.

Individual pieces:

```sh
pnpm gen:types      # regenerate extension/shared/schema/*.d.ts from /shared/schema/*.schema.json
pnpm schema:check    # validate shared/schema/examples/* against the JSON Schemas
pnpm typecheck        # extension TypeScript
pnpm lint             # ESLint across the repo
pnpm test             # extension Vitest suite
pnpm server:lint      # ruff check + ruff format --check
pnpm server:test      # server pytest
pnpm zip              # package both browser builds as .zip
```

## Repository layout

```
extension/    WXT-based MV3 extension (Chrome + Firefox), React side panel, plain-TS content script
server/       FastAPI server, Pydantic schemas, VLM adapter interface + MockAdapter
shared/schema/  JSON Schema contracts (payload.v1, plan.v1) — the single source of truth
demo-portal/  Vite static site with the synthetic KYC demo form
eval/         Evaluation harness (not implemented yet — see eval/README.md)
docs/         Architecture, build stages, threat model, PII policy matrix
```

## Contributing / working on this repo

Read [`AGENTS.md`](AGENTS.md) first — it holds the non-negotiable invariants (network boundary,
token format, redaction rules, no-remote-code, etc.) that govern every change. `CLAUDE.md` points
here for the same reason.
