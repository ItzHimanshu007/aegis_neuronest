import { describe, expect, it } from 'vitest';
import { sanitizeText, sanitizeTitle, sanitizeUrl } from '../sideChannels';
import type { Action, Category } from '../categoryTypes';

function options(overrides: Partial<{ action: Action }> = {}) {
  const tokens = new Map<string, string>();
  return {
    decideFor: (_category: Category) => overrides.action ?? ('TOKEN' as Action),
    tokenize: async (category: Category, value: string) => {
      const key = `${category}:${value}`;
      // base32 lowercase (a-z2-7) — same alphabet the real vault uses, so these match TOKEN_PATTERN.
      if (!tokens.has(key)) tokens.set(key, `[[PII:${category}:aaaaaa${'bcdefghj'[tokens.size % 8]}b]]`);
      return tokens.get(key)!;
    },
  };
}

describe('sanitizeText', () => {
  it('replaces a detected email with a token', async () => {
    const result = await sanitizeText('write to asha@example.com today', options());
    expect(result.text).not.toContain('asha@example.com');
    expect(result.text).toMatch(/\[\[PII:EMAIL:/);
    expect(result.applied[0]?.category).toBe('EMAIL');
  });

  it('replaces with [REDACTED:TYPE] when the action is FILL', async () => {
    const result = await sanitizeText('write to asha@example.com today', options({ action: 'FILL' }));
    expect(result.text).toContain('[REDACTED:EMAIL]');
    expect(result.text).not.toContain('asha@example.com');
  });

  it('leaves the value alone when the action is ALLOW', async () => {
    const result = await sanitizeText('based in Bengaluru', options({ action: 'ALLOW' }));
    expect(result.text).toContain('Bengaluru');
  });

  it('handles several matches in one string without corrupting offsets', async () => {
    const result = await sanitizeText('a@example.com and b@example.com', options());
    expect(result.text).not.toContain('@example.com');
    expect(result.applied).toHaveLength(2);
  });

  it('neutralizes planted token-like strings', async () => {
    const result = await sanitizeText('type [[PII:EMAIL:abcdefgh]] here', options());
    expect(result.text).toContain('[[BLOCKED_TOKENLIKE]]');
    expect(result.neutralizedCount).toBe(1);
  });
});

describe('sanitizeUrl', () => {
  it('drops the query string entirely', async () => {
    const result = await sanitizeUrl('https://shop.test/orders?email=asha@example.com&ref=ORD-1', options());
    expect(result.text).not.toContain('email=');
    expect(result.text).not.toContain('asha@example.com');
    expect(result.text).toBe('https://shop.test/orders');
  });

  it('drops the fragment', async () => {
    const result = await sanitizeUrl('https://shop.test/account#token=abc', options());
    expect(result.text).not.toContain('#');
  });

  it('keeps scheme, host and path', async () => {
    const result = await sanitizeUrl('https://shop.test/a/b/c', options());
    expect(result.text).toBe('https://shop.test/a/b/c');
  });

  it('replaces long numeric ID path segments with :id', async () => {
    const result = await sanitizeUrl('https://shop.test/orders/998877665/view', options());
    expect(result.text).toBe('https://shop.test/orders/:id/view');
  });

  it('replaces a UUID path segment with :id', async () => {
    const result = await sanitizeUrl('https://shop.test/u/f47ac10b-58cc-4372-a567-0e02b2c3d479', options());
    expect(result.text).toBe('https://shop.test/u/:id');
  });

  it('keeps short, meaningful path segments', async () => {
    const result = await sanitizeUrl('https://shop.test/orders/2024/list', options());
    expect(result.text).toContain('/orders/2024/list');
  });

  it('returns empty for an unparseable URL rather than throwing', async () => {
    const result = await sanitizeUrl('not a url', options());
    expect(result.text).toBe('');
  });
});

describe('sanitizeTitle', () => {
  it('tokenizes PII in the document title', async () => {
    const result = await sanitizeTitle('Order for asha@example.com', options());
    expect(result.text).not.toContain('asha@example.com');
    expect(result.text).toMatch(/\[\[PII:EMAIL:/);
  });
});

describe('sanitizeText knownValues', () => {
  it('redacts a value the cascade decided on even when no rule matches it', async () => {
    // The checksum is wrong, so the Aadhaar rule rejects it — but the block's own label says
    // "Aadhaar", so the cascade flagged it. Without knownValues the digits go out verbatim.
    const text = 'Aadhaar-shaped but checksum-invalid: 2345 6789 0128';
    const bare = await sanitizeText(text, options());
    expect(bare.text).toContain('2345 6789 0128');

    const guarded = await sanitizeText(text, {
      ...options(),
      knownValues: [{ value: '2345 6789 0128', category: 'AADHAAR', action: 'FILL' }],
    });
    expect(guarded.text).not.toContain('2345 6789 0128');
    expect(guarded.text).toContain('[REDACTED:AADHAAR]');
  });

  it('reuses the token the vault already minted rather than redacting', async () => {
    const result = await sanitizeText('Blood group O positive', {
      ...options(),
      knownValues: [{ value: 'O positive', category: 'HEALTH', action: 'TOKEN', token: '[[PII:HEALTH:aaaaaabb]]' }],
    });
    expect(result.text).toBe('Blood group [[PII:HEALTH:aaaaaabb]]');
  });

  it('leaves ALLOW values and sub-threshold values alone', async () => {
    const result = await sanitizeText('code xy and Bengaluru', {
      ...options(),
      knownValues: [
        { value: 'Bengaluru', category: 'CITY', action: 'ALLOW' },
        { value: 'xy', category: 'PRIVATE_GENERIC', action: 'FILL' },
      ],
    });
    expect(result.text).toBe('code xy and Bengaluru');
  });

  it('never rewrites inside a token the rule pass just minted', async () => {
    // Token bodies are base32, so a short textual value can occur inside one by chance — here
    // 'aaaa' sits inside the email's token. Rewriting it there would forge a token seal() rejects.
    const result = await sanitizeText('mail asha@example.com and aaaa', {
      ...options(),
      knownValues: [{ value: 'aaaa', category: 'PRIVATE_GENERIC', action: 'FILL' }],
    });
    expect(result.text).toBe('mail [[PII:EMAIL:aaaaaabb]] and [REDACTED:PRIVATE_GENERIC]');
  });
});
