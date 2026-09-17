/**
 * HMAC token vault (Stage 2 Part E). Holds the per-session mapping between real values and their
 * `[[PII:TYPE:xxxxxxxx]]` tokens.
 *
 * Lives in the agentHost (side panel document), never the background service worker — a service
 * worker can be evicted after ~30s idle, which would wipe the vault mid-task and lose both the
 * user's credential and every token the server is still referencing. Closing the panel destroys
 * the whole JS context, which IS the session end: the key reference and every entry go with it
 * (AGENTS.md invariant 8 — in-memory only, never localStorage/IndexedDB/chrome.storage.local).
 */

import { TOKEN_PATTERN } from '../shared/schema/tokens';
import type { Category } from './categoryTypes';

export type TokenSource = 'page' | 'task' | 'profile' | 'credential';

export interface VaultEntry {
  token: string;
  type: Category;
  /** The original value, preserved exactly for filling/display (normalization is for hashing). */
  value: string;
  normalized: string;
  origins: Set<string>;
  source: TokenSource;
  requiresApproval: boolean;
}

export interface TokenizeOptions {
  origin: string;
  source: TokenSource;
}

export interface RehydrateContext {
  actionType: string;
  fieldCategory?: Category;
  fieldInputType?: string;
  origin: string;
  consentedOrigins: Set<string>;
}

const BASE32_LOWER = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Lower(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_LOWER[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_LOWER[(value << (5 - bits)) & 31];
  return output;
}

/** Category-specific normalization (Stage 2 Part E). Two values that normalize the same share a
 * token — "+91 98765 43210" and "9876543210" are the same phone number. */
export function normalizeValue(category: Category, value: string): string {
  const nfkc = value.normalize('NFKC').trim();
  switch (category) {
    case 'EMAIL':
      return nfkc.toLowerCase();
    case 'PHONE': {
      const digits = nfkc.replace(/\D/g, '');
      const withoutCountry = digits.startsWith('91') && digits.length > 10 ? digits.slice(-10) : digits;
      return withoutCountry.replace(/^0/, '').slice(-10);
    }
    case 'AADHAAR':
    case 'CARD_NUMBER':
    case 'BANK_ACCOUNT':
      return nfkc.replace(/\D/g, '');
    case 'PAN':
    case 'IFSC':
    case 'VEHICLE_REG':
      return nfkc.replace(/\s/g, '').toUpperCase();
    case 'NAME':
    case 'ADDRESS':
    case 'CITY':
    case 'EMPLOYER':
      return nfkc.replace(/\s+/g, ' ').toLowerCase();
    default:
      return nfkc;
  }
}

const TOKEN_LENGTH = 8;

export class TokenVault {
  private key: CryptoKey | null = null;
  private generation = 0;
  private readonly byToken = new Map<string, VaultEntry>();
  private readonly byNormalized = new Map<string, VaultEntry>();

  /** Generates the per-session HMAC key. `extractable: false` means the raw key material can
   * never be read back out, even by our own code (AGENTS.md invariant 3). */
  async init(): Promise<void> {
    if (this.key) return;
    const generation = this.generation;
    const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    if (generation !== this.generation) throw new Error('Vault session ended');
    this.key = key;
  }

  private async hash(type: Category, normalized: string, counter = 0): Promise<string> {
    if (!this.key) throw new Error('TokenVault.init() must be called before tokenizing');
    const suffix = counter > 0 ? `\u0000${counter}` : '';
    const message = new TextEncoder().encode(`${type}\u0000${normalized}${suffix}`);
    const signature = await crypto.subtle.sign('HMAC', this.key, message);
    return base32Lower(new Uint8Array(signature)).slice(0, TOKEN_LENGTH);
  }

  async tokenize(type: Category, value: string, options: TokenizeOptions): Promise<string> {
    const generation = this.generation;
    const normalized = normalizeValue(type, value);
    const key = `${type}\u0000${normalized}`;

    const existing = this.byNormalized.get(key);
    if (existing) {
      existing.origins.add(options.origin);
      return existing.token;
    }

    // On a collision (same token, different normalized value), rehash with a counter suffix.
    let counter = 0;
    let digest = await this.hash(type, normalized, counter);
    let token = `[[PII:${type}:${digest}]]`;
    while (this.byToken.has(token) && this.byToken.get(token)!.normalized !== normalized) {
      counter++;
      digest = await this.hash(type, normalized, counter);
      token = `[[PII:${type}:${digest}]]`;
    }

    if (generation !== this.generation) throw new Error("Vault session ended");
    const entry: VaultEntry = {
      token,
      type,
      value,
      normalized,
      origins: new Set([options.origin]),
      source: options.source,
      requiresApproval: options.source === 'credential',
    };
    this.byToken.set(token, entry);
    this.byNormalized.set(key, entry);
    return token;
  }

  /** Stores a credential the USER typed into the Aegis panel (never something read from a page),
   * bound to exactly that origin and always approval-gated. */
  async putCredential(origin: string, value: string): Promise<string> {
    const token = await this.tokenize('PASSWORD', value, { origin, source: 'credential' });
    const entry = this.byToken.get(token);
    if (entry) {
      entry.requiresApproval = true;
      entry.origins.clear();
      entry.origins.add(origin);
    }
    return token;
  }

  /** Every real value the vault holds — the firewall's leak check scans outgoing bytes for these
   * (privacy/firewall.ts check 3). */
  knownValues(): Array<{ value: string; normalized: string; type: Category }> {
    return Array.from(this.byToken.values()).map((e) => ({ value: e.value, normalized: e.normalized, type: e.type }));
  }

  get(token: string): VaultEntry | undefined {
    return this.byToken.get(token);
  }

  hasToken(token: string): boolean {
    return this.byToken.has(token);
  }

  allTokens(): string[] {
    return Array.from(this.byToken.keys());
  }

  /**
   * The re-hydration gate (AGENTS.md invariant 4). Pure and fully table-tested — every rule that
   * decides whether a token may become a real value again lives here and nowhere else.
   */
  canRehydrate(token: string, ctx: RehydrateContext): boolean {
    const entry = this.byToken.get(token);
    if (!entry) return false;

    // Invariant 4: restoration is only inside type, on an explicitly consented origin.
    if (ctx.actionType !== 'type' || !ctx.consentedOrigins.has(ctx.origin)) return false;

    // 2. The field's category must match the token's type. Unknown -> deny (Stage 3 will ask).
    if (!ctx.fieldCategory) return false;
    if (ctx.fieldCategory !== entry.type) return false;

    // 3. PASSWORD requires an actual password input on the exact bound origin.
    if (entry.type === 'PASSWORD') {
      if (ctx.fieldInputType !== 'password') return false;
      return entry.origins.has(ctx.origin);
    }

    // 4. Page-sourced tokens only re-hydrate on an origin they were seen on.
    if (entry.source === 'page') {
      return entry.origins.has(ctx.origin);
    }

    // 5. Task/profile tokens re-hydrate only on an origin the user consented to.
    return ctx.consentedOrigins.has(ctx.origin);
  }

  /** Resolves a token back to its real value. Throws unless `canRehydrate` allows it. */
  resolve(token: string, ctx: RehydrateContext): string {
    if (!this.canRehydrate(token, ctx)) {
      throw new Error(`Refusing to re-hydrate ${token}: not permitted in this context`);
    }
    return this.byToken.get(token)!.value;
  }

  /**
   * Resolves a token for display inside the Aegis panel only (AGENTS.md invariant 4's one
   * exception, added in Stage 3A). An `answer`/`extract` result is useless to the user if it still
   * reads `[[PII:NAME:...]]`, but that value must not travel any further than the pixels of our
   * own UI.
   *
   * The return type is deliberately NOT a string: `DisplayOnlyText` is an opaque wrapper, so it
   * cannot be handed to `sendMessage`, a network call or the page by accident. Getting a string
   * back out takes `unwrapForPanelRender()`, which a guard test confines to the panel.
   *
   * Unlike `resolve()` this does not take a `RehydrateContext` — there is no origin and no target
   * field involved, because nothing is being written anywhere.
   */
  resolveForDisplay(token: string): DisplayOnlyText {
    const entry = this.byToken.get(token);
    if (!entry) throw new Error(`Unknown token: cannot display ${token}`);
    return { text: entry.value } as DisplayOnlyText;
  }

  /** Ends the session: drops every entry and the key reference. */
  clear(): void {
    this.generation++;
    this.byToken.clear();
    this.byNormalized.clear();
    this.key = null;
  }
}

// ---------------------------------------------------------------------------------------------
// Token-like string neutralization (AGENTS.md invariant 3)
// ---------------------------------------------------------------------------------------------

declare const DISPLAY_ONLY: unique symbol;

/**
 * A real PII value that may be rendered in the Aegis panel and nowhere else. It is an object, not
 * a branded string, so no amount of structural typing lets it slip into a `string` parameter.
 */
export interface DisplayOnlyText {
  /** Phantom field: type-only, never present at runtime. It exists so the wrapper is structurally
   * incompatible with `string` and with any plain `{ text: string }` a caller might construct. */
  readonly [DISPLAY_ONLY]: 'display-only';
  readonly text: string;
}

/**
 * The single sanctioned way to turn a `DisplayOnlyText` back into a string, for rendering it into
 * the panel's own DOM. `privacy/__tests__/displayOnly.guard.test.ts` fails the build if this is
 * called anywhere outside the panel UI.
 */
export function unwrapForPanelRender(value: DisplayOnlyText): string {
  return value.text;
}

export const BLOCKED_TOKENLIKE = '[[BLOCKED_TOKENLIKE]]';

/** Matches real tokens AND loose look-alikes a hostile page might plant hoping one gets echoed
 * back and re-hydrated: internal spaces/zero-width characters, case variants, full-width
 * brackets. NFKC normalization folds the full-width forms first. */
const LOOSE_TOKENLIKE = /\[\s*\[\s*P\s*I\s*I\s*:\s*[A-Za-z_]+\s*:\s*[A-Za-z0-9]{6,12}\s*\]\s*\]/gi;
// Built from escapes (not literal characters) so the source file itself contains no invisible
// whitespace — ESLint's no-irregular-whitespace rule exists precisely to keep those out of source.
const ZERO_WIDTH = new RegExp('[\\u200B-\\u200D\\uFEFF\\u2060]', 'g');

/**
 * Replaces every token and token-look-alike in `text` with a string that itself does not match
 * `TOKEN_PATTERN`. Run over all page-derived text before sealing, so a page cannot smuggle a
 * token into the plan (docs/threat_model.md T2, "planted token strings").
 */
export function neutralize(text: string): { text: string; neutralizedCount: number } {
  const normalized = text.normalize('NFKC').replace(ZERO_WIDTH, '');
  let count = 0;
  const result = normalized.replace(LOOSE_TOKENLIKE, () => {
    count++;
    return BLOCKED_TOKENLIKE;
  });
  return { text: result, neutralizedCount: count };
}

/** True if `text` still contains anything matching the canonical token pattern. */
export function containsToken(text: string): boolean {
  return new RegExp(TOKEN_PATTERN.source).test(text);
}
