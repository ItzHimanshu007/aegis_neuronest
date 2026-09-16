/**
 * Redactor. TODO(stage-2): apply solid fill for text PII and irreversible blur for faces only
 * (never pixelate text — see AGENTS.md invariant 5) to the captured screenshot.
 */

export function redact(_image: unknown, _redactions: unknown[]): never {
  throw new Error('NotImplemented: privacy/redactor.ts lands in Stage 2');
}
