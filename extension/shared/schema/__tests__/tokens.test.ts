import { describe, expect, it } from 'vitest';
import { TOKEN_PATTERN, isToken } from '../tokens';

describe('TOKEN_PATTERN', () => {
  it('matches a well-formed token', () => {
    expect(isToken('[[PII:NAME:k4m2xq7b]]')).toBe(true);
    expect(isToken('[[PII:AADHAAR:h4r3k2wq]]')).toBe(true);
  });

  it('rejects malformed tokens', () => {
    expect(isToken('[[PII:NAME:K4M2XQ7B]]')).toBe(false); // must be lowercase
    expect(isToken('[[PII:NAME:k4m2xq7]]')).toBe(false); // 7 chars, needs 8
    expect(isToken('[[PII:NAME:k4m2xq7bx]]')).toBe(false); // 9 chars
    expect(isToken('[[PII:name:k4m2xq7b]]')).toBe(false); // type must be A-Z_
    expect(isToken('[[PII:NAME:k4m2xq70]]')).toBe(false); // base32 alphabet excludes 0, 1, 8, 9
    expect(isToken('plain text')).toBe(false);
  });

  it('finds tokens embedded in a larger string', () => {
    const text = 'Hello [[PII:NAME:k4m2xq7b]], your order [[PII:ORDER_ID:t5z5n7vd]] shipped.';
    const matches = text.match(new RegExp(TOKEN_PATTERN.source, 'g'));
    expect(matches).toEqual(['[[PII:NAME:k4m2xq7b]]', '[[PII:ORDER_ID:t5z5n7vd]]']);
  });
});
