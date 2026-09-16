import { describe, expect, it } from 'vitest';
import { seal, isRegisteredSealed } from '../firewall';

describe('firewall.seal() (Stage 0 stub)', () => {
  it('throws NotImplemented instead of silently sealing anything', () => {
    expect(() => seal({ anything: 'goes here' })).toThrow(/NotImplemented/);
  });

  it('never registers anything as sealed, since it never returns', () => {
    let thrown = false;
    try {
      seal({});
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);
    expect(isRegisteredSealed({})).toBe(false);
  });
});
