/**
 * HMAC token vault. TODO(stage-2): generate a non-extractable per-session Web Crypto
 * (HMAC-SHA-256) key, map PII values <-> tokens matching TOKEN_PATTERN, and keep everything
 * in memory only (see AGENTS.md invariant 8 — never localStorage/IndexedDB/chrome.storage.local).
 */

export function tokenize(_value: string, _type: string): never {
  throw new Error('NotImplemented: privacy/vault.ts lands in Stage 2');
}

export function rehydrate(_token: string): never {
  throw new Error('NotImplemented: privacy/vault.ts lands in Stage 2');
}
