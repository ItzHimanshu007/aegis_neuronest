import { describe, expect, it } from 'vitest';
import { harvestFrame } from '../harvester';

/** Stage 2 Part A1: the harvester must never put a secret field's raw value into RawElement.value
 * — only `hasValue` (and, for non-secret fields, `valueLenBucket`). */
describe('harvestFrame: never harvests secret values (Stage 2 Part A1)', () => {
  it('omits value and valueLenBucket for input[type=password]', () => {
    document.body.innerHTML = '<label for="pw">Password</label><input id="pw" type="password" value="" />';
    (document.getElementById('pw') as HTMLInputElement).value = 'super-secret-value';
    const result = harvestFrame({ salt: 's', frameId: 0 });
    const el = result.elements.find((e) => e.tag === 'input')!;
    expect(el.value).toBeUndefined();
    expect(el.valueLenBucket).toBeUndefined();
    expect(el.hasValue).toBe(true);
  });

  it('omits value for a field with autocomplete=one-time-code', () => {
    document.body.innerHTML = '<label for="otp">Code</label><input id="otp" type="text" autocomplete="one-time-code" />';
    (document.getElementById('otp') as HTMLInputElement).value = '123456';
    const result = harvestFrame({ salt: 's', frameId: 0 });
    const el = result.elements.find((e) => e.tag === 'input')!;
    expect(el.value).toBeUndefined();
    expect(el.hasValue).toBe(true);
  });

  it('omits value for a field with autocomplete=cc-csc', () => {
    document.body.innerHTML = '<label for="csc">Security code</label><input id="csc" type="text" autocomplete="cc-csc" />';
    (document.getElementById('csc') as HTMLInputElement).value = '999';
    const result = harvestFrame({ salt: 's', frameId: 0 });
    const el = result.elements.find((e) => e.tag === 'input')!;
    expect(el.value).toBeUndefined();
  });

  it('omits value for a field labelled OTP even with a generic input type/autocomplete', () => {
    document.body.innerHTML = '<label for="o2">One Time Password</label><input id="o2" type="text" />';
    (document.getElementById('o2') as HTMLInputElement).value = '654321';
    const result = harvestFrame({ salt: 's', frameId: 0 });
    const el = result.elements.find((e) => e.tag === 'input')!;
    expect(el.value).toBeUndefined();
  });

  it('omits value for a field labelled CVV', () => {
    document.body.innerHTML = '<label for="c1">CVV</label><input id="c1" type="text" />';
    (document.getElementById('c1') as HTMLInputElement).value = '123';
    const result = harvestFrame({ salt: 's', frameId: 0 });
    const el = result.elements.find((e) => e.tag === 'input')!;
    expect(el.value).toBeUndefined();
  });

  it('omits value for a field labelled UPI PIN', () => {
    document.body.innerHTML = '<label for="pin1">UPI PIN</label><input id="pin1" type="text" />';
    (document.getElementById('pin1') as HTMLInputElement).value = '4321';
    const result = harvestFrame({ salt: 's', frameId: 0 });
    const el = result.elements.find((e) => e.tag === 'input')!;
    expect(el.value).toBeUndefined();
  });

  it('still reads the value for an ordinary, non-secret text field', () => {
    document.body.innerHTML = '<label for="name1">Full name</label><input id="name1" type="text" />';
    (document.getElementById('name1') as HTMLInputElement).value = 'Asha Verma';
    const result = harvestFrame({ salt: 's', frameId: 0 });
    const el = result.elements.find((e) => e.tag === 'input')!;
    expect(el.value).toBe('Asha Verma');
    expect(el.valueLenBucket).toBeDefined();
  });

  it('never lets the secret string leak into the serialized elements array', () => {
    document.body.innerHTML = '<label for="pw2">Password</label><input id="pw2" type="password" />';
    (document.getElementById('pw2') as HTMLInputElement).value = 'unMistakableMarkerXYZ123';
    const result = harvestFrame({ salt: 's', frameId: 0 });
    const json = JSON.stringify(result.elements);
    expect(json).not.toContain('unMistakableMarkerXYZ123');
  });
});
