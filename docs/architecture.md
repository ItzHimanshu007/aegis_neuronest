# Aegis — Architecture

**Aegis** is a privacy-preserving browser vision agent built for Smart India Hackathon,
problem statement **SIH26171** (ISRO / Department of Space).

## Product summary

Aegis is a browser extension (Chrome + Firefox, both **MV3**) plus a **FastAPI** server.

The browser does the seeing and all of the privacy work:

1. It observes the page — DOM, a Set-of-Marks overlay, and a screenshot.
2. It runs a **local** vision model (WebGPU with a WASM fallback, via ONNX Runtime Web) to read the screen.
3. It fuses vision output with the DOM, detects PII locally, tokenizes and redacts it,
   verifies the result **fail-closed**, and only then sends a sanitized payload to the server.

The server hosts an **open-weight VLM behind an OpenAI-compatible API**. It returns a batched plan of
structured actions, or an `answer` / `extract` data response. It only ever sees **tokens and redacted
pixels** — never raw text, values, cookies, storage, or page `id`/`class` names.

The extension then validates each proposed action, reacquires the target element, restores tokens
locally, executes, checks the action's `expect` condition, and loops.

> The server **proposes**. The extension **decides, re-hydrates and acts**.

## Layers

### 0 — Runtime

Built on **WXT**, producing MV3 builds for both Chrome (service-worker background) and Firefox
(event-page background). The **side panel / sidebar** is the long-lived surface that hosts the ML
workers, because a service worker can be evicted mid-inference. React is used for panel UI only;
content scripts stay plain TypeScript to keep injection cost low.

### 1 — Observe

A Set-of-Marks harvester numbers every interactive element and records text rectangles, stable
element fingerprints, and visibility. A screenshot is taken only when the screen actually changes.
Side channels (title, URL, ARIA live regions, placeholders) are captured separately so they can be
sanitized on their own terms. An input watch tracks what the user types so those values are never
re-emitted.

### 2 — Perceive

A single unified detector covers UI classes plus `face`, `id_document`, `card`, `signature` and `qr`.
Detector boxes are fused with DOM rectangles by IoU, then occlusion-checked so a covered control is
never treated as actionable. **OCR runs only on detector-only regions** — areas the DOM cannot
explain — which keeps the cost bounded. The output is a screen-state JSON document. An image-only
mode covers canvas, PDF and video surfaces where the DOM tells us nothing.

### 3 — Detect PII

Layered, cheapest first: privacy tags (`data-pii`, `autocomplete`, `type=password`) → regex plus
checksums (**Luhn**, **Verhoeff** for Aadhaar, **PAN**, **IFSC**, **UPI**) → field-context label
pairing, so a bare number next to "Account number" is treated as one → visual classes from the
detector → lazily loaded NER for free-text names and addresses → OCR spans inside images.

### 4 — Protect

A **policy matrix** (`docs/policy.yaml`) maps each PII type to an action. An **HMAC token vault**
holds the mapping in memory only, keyed by a non-extractable per-session Web Crypto key. The
redactor applies **solid fill for text PII** and **irreversible blur for faces only** — text is never
pixelated, because pixelation is reversible. A side-channel sanitizer cleans titles, URLs and ARIA
text. Everything funnels through `firewall.seal()`, which is the only way to produce a
`SanitizedPayload`.

### 5 — Route

A new screen sends the redacted image plus screen state plus a redaction manifest. The same screen
sends only a text delta. A verdict cache avoids re-deciding identical regions. Three modes —
**Fast / Balanced / Accurate** — trade latency against perception depth. **Judge Mode** exposes the
exact bytes leaving the browser, side by side with the original, for evaluation.

### 6 — Server

**FastAPI + vLLM.** A static prompt prefix keeps the KV cache warm across requests. Output is
constrained to the `plan.v1` JSON schema. Plans are batched and every action carries the element
fingerprint it was planned against plus an `expect` post-condition.

### 7 — Act

A validator rejects malformed or out-of-policy actions, and an approval gate handles anything the
policy marks as needing consent — collected **upfront**, not mid-flow. Reacquire re-finds the target
and verifies its fingerprint, falling back to coordinates only when the fingerprint still matches.
Re-hydration is **type-bound and origin-bound**: a token only expands inside a `type` action, into a
field whose type matches the token type, on the origin the user consented to. The executor performs
the action, then the `expect` check decides whether the loop continues.

## Judging metrics

| Weight | Metric |
| -----: | ------ |
| 25% | Visual context accuracy |
| 20% | PII detection recall / precision |
| 20% | Redaction precision |
| 20% | Client resource use |
| 15% | End-to-end latency |

Every design decision in this document is meant to be defensible against that table: local-first
perception protects the privacy metrics, batching and the verdict cache protect latency, and the
Fast/Balanced/Accurate modes let us trade resource use against accuracy on demand.

## Related documents

- [`STAGES.md`](./STAGES.md) — build plan, stages 0–9.
- [`threat_model.md`](./threat_model.md) — what Aegis defends against, and what it does not.
- [`policy.yaml`](./policy.yaml) — the PII policy matrix (data only at this stage).
- [`../AGENTS.md`](../AGENTS.md) — non-negotiable invariants.
