# Aegis

A privacy-preserving browser vision agent for **SIH26171** (ISRO / Department of Space).

Aegis reads and acts on web pages from inside the browser, using a local vision model to see the
screen and a local privacy pipeline to strip PII before anything reaches the server. The server
only ever sees tokens and redacted pixels, and only ever proposes actions — the extension validates,
reacquires, re-hydrates and executes them. See [`docs/architecture.md`](docs/architecture.md) for
the full design and [`AGENTS.md`](AGENTS.md) for the invariants every change must respect.

This repository is currently at **Stage 3A** (see [`docs/STAGES.md`](docs/STAGES.md)). Stages 0-2
built the repo, the observation pipeline and the privacy core; Stage 2.5 added the Privacy Scene
Graph, stable element IDs, state tokens, schema v2, the authority classifier and Firefox bring-up.

Stage 3A adds the pieces the agent loop will call into:

- a **Privacy Set-of-Marks** — each outbound element's EID drawn on the sanitized image, never
  inside a mask, so the model can name what it can see;
- a **server reasoning adapter** for any OpenAI-compatible endpoint with image input, with schema
  validation, a single repair pass and server-side grounding checks;
- deterministic **mock scenarios**, including adversarial ones with a test recording which layer
  refuses each;
- a **model probe** that measures a candidate endpoint against this pipeline.

Everything the extension observes is **local only** — branded `LocalOnly<T>` (see
[`extension/observe/types.ts`](extension/observe/types.ts)) and provably unable to reach
`net/network.ts`. The agent loop, executor and consent UI land in Stage 3B.

**Where the privacy pipeline runs matters.** The detection cascade, the policy engine and the token
vault all live in the **side panel document**, not the background service worker: Chrome can
terminate an MV3 service worker after ~30 seconds idle, which would destroy the vault's session key
mid-task. Background stays a thin capture-only router that retains nothing raw (enforced by
[`extension/privacy/__tests__/backgroundNoRawCache.test.ts`](extension/privacy/__tests__/backgroundNoRawCache.test.ts)).

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
pnpm run server
```

Serves on `http://localhost:8000`. `GET /health` and `POST /v1/plan` are available; see
[`shared/schema/examples`](shared/schema/examples) for example request/response bodies.

### Demo portal (Vite)

```sh
pnpm portal
```

Serves on `http://localhost:5174`. **All data on these pages is synthetic** — see the
"DEMO — SYNTHETIC DATA" badge on every page. Scenario pages:

| Page | What it exercises |
| ---- | ----------------- |
| `/kyc.html` | Synthetic KYC form (Aadhaar, PAN, password, photo/ID placeholders). `?banner=1` adds a cookie banner over Submit |
| `/calibration.html` | Coloured squares at known positions — the screenshot/coordinate alignment gate |
| `/shadow.html` | Form fields inside open **and closed** shadow roots |
| `/frames.html` | A same-origin iframe and a cross-origin one (needs `pnpm portal:alt`) |
| `/dynamic.html` | A modal that opens after 1s, a form that re-renders with new ids/classes, three identical "Add" buttons |
| `/hidden.html` | Every visibility-hiding technique, plus a button covered by a banner |

For the cross-origin iframe on `frames.html`, also run a second origin:

```sh
pnpm portal:alt     # http://localhost:5175
```

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

### Permissions

Aegis installs with a deliberately small permission set: `activeTab`, `scripting`, `storage`
(plus `sidePanel` on Chrome) and one required host permission, `http://localhost/*`, purely so the
demo portal works without a prompt during development. There is **no required `<all_urls>`** and
**no statically-registered content script** — the harvester is injected on demand.

The first time you click **Observe**, the panel requests the `<all_urls>` *optional* permission.
That broad scope is unavoidable for screenshots specifically: `tabs.captureVisibleTab` only accepts
the literal `<all_urls>` permission or an active `activeTab` grant — a scoped per-origin host
permission is rejected even when it exactly matches the tab. See
[`extension/shared/permissions.ts`](extension/shared/permissions.ts) for the details.

## Checks

```sh
pnpm check
```

Runs, in order: JSON Schema fixture validation, extension typecheck, ESLint (including the rule
that forbids `fetch`/`XMLHttpRequest`/`WebSocket` outside `extension/net/network.ts`), extension
Vitest suite, server `ruff check`/`ruff format --check`, and server `pytest`.

Individual pieces:

```sh
pnpm gen:types       # regenerate extension/shared/schema/*.d.ts from /shared/schema/*.schema.json
pnpm gen:policy      # regenerate extension/privacy/policyData.ts from docs/policy.yaml
pnpm gen:validator   # precompile payload.v2 and plan.v2 into extension/privacy/generated/
pnpm schema:check    # validate shared/schema/examples/* against the JSON Schemas
pnpm typecheck        # extension TypeScript (includes the e2e specs and the LocalOnly type proof)
pnpm lint             # ESLint across the repo
pnpm test             # extension Vitest suite
pnpm server:lint      # ruff check + ruff format --check
pnpm server:test      # server pytest
pnpm zip              # package both browser builds as .zip
```

### End-to-end tests (Playwright, Chromium)

```sh
pnpm portal          # terminal 1 — http://localhost:5174
pnpm portal:alt      # terminal 2 — http://localhost:5175 (for frames.html)
pnpm e2e             # terminal 3 — builds the extension, then runs the suite
```

`pnpm e2e` is deliberately **not** part of `pnpm check`: it needs a real (headed) browser plus
both portal servers running, which doesn't belong in the fast feedback loop. One-off browser
setup: `npx playwright install chromium`.

Run `pnpm e2e:firefox` for the real Firefox MV3 suite. Setup, measured capability results and
remaining human checks are in [`docs/manual-test-firefox.md`](docs/manual-test-firefox.md).

## Repository layout

```
extension/
  observe/      Stage 1: harvester, fingerprints, visibility, change detection, overlay (LocalOnly)
  entrypoints/  background (capture pipeline), content (harvester), sidepanel (React UI + agentHost)
  agentHost/    Stage 2: the privacy pipeline, running in the SIDE PANEL document (see below)
  privacy/      Stage 2: detection cascade, policy engine, token vault, redactor, firewall.seal()
  scene/        Stage 2.5: EID registry, state tokens, local/outbound projections
  authority/    Stage 2.5: pure L0–L5 action classifier
  sensing/      Stage 2.5: sensing and context-expansion decisions
  audit/        Stage 2.5: bounded in-memory audit; replay remains a Stage 4 stub
  net/          network.ts — the ONLY network path out of the extension
  shared/       config.ts (all tuning thresholds), messages.ts, permissions.ts, schema types
  e2e/          Playwright specs (Chromium) — run with `pnpm e2e`
server/         FastAPI server, Pydantic schemas, VLM adapter interface + MockAdapter
shared/schema/  JSON Schema contracts (payload.v2, plan.v2) — the single source of truth
demo-portal/    Vite static site: kyc, calibration, shadow, frames, dynamic, hidden, pii-zoo,
                search (Enter authority), injection (planted instructions)
eval/           reports/ (baselines, timings, probe results), model_probe/ (sealed fixtures + probe)
docs/           Architecture, build stages, threat model, PII policy matrix, Firefox test checklist
```

## Contributing / working on this repo

Read [`AGENTS.md`](AGENTS.md) first — it holds the non-negotiable invariants (network boundary,
token format, redaction rules, no-remote-code, etc.) that govern every change. `CLAUDE.md` points
here for the same reason.
