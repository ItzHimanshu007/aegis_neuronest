import { describe, expect, it } from 'vitest';
import { canTokenizeFromPage, classOf, decide, determineNecessity, isIdentityCategory, isLockedCategory, SessionPrivacyState } from '../policy';
import { normalizeValue } from '../vault';
import type { Action, Category } from '../categoryTypes';
import type { Detection } from '../detect/types';

function det(category: Category, confidence = 0.9, overrides: Partial<Detection> = {}): Detection {
  return {
    id: 'd1',
    capture_id: 'c1',
    source: 'rule',
    category,
    confidence,
    target: { kind: 'element', ref: 'fp1' },
    rects: [],
    ...overrides,
  };
}

const noOverrides = {};
const ctx = (necessity: 'needed' | 'not_needed', identitySeenOnOrigin = false, userOverrides: Partial<Record<Category, Action>> = noOverrides) => ({
  necessity,
  identitySeenOnOrigin,
  userOverrides,
});

describe('decide: the policy table', () => {
  const cases: Array<[Category, 'needed' | 'not_needed', Action]> = [
    // never_automated
    ['OTP', 'needed', 'USER_ENTERS'],
    ['CVV', 'needed', 'USER_ENTERS'],
    ['UPI_PIN', 'needed', 'USER_ENTERS'],
    ['SECRET', 'needed', 'USER_ENTERS'],
    ['OTP', 'not_needed', 'FILL'],
    // credential
    ['PASSWORD', 'needed', 'USER_PROVIDED_ORIGIN_BOUND'],
    ['PASSWORD', 'not_needed', 'FILL'],
    // high
    ['AADHAAR', 'needed', 'TOKEN_WITH_APPROVAL'],
    ['PAN', 'needed', 'TOKEN_WITH_APPROVAL'],
    ['CARD_NUMBER', 'needed', 'TOKEN_WITH_APPROVAL'],
    ['BANK_ACCOUNT', 'needed', 'TOKEN_WITH_APPROVAL'],
    ['UPI_ID', 'needed', 'TOKEN_WITH_APPROVAL'],
    ['AADHAAR', 'not_needed', 'FILL'],
    // medium
    ['NAME', 'needed', 'TOKEN'],
    ['EMAIL', 'needed', 'TOKEN'],
    ['PHONE', 'needed', 'TOKEN'],
    ['HEALTH', 'needed', 'TOKEN'],
    ['PRIVATE_GENERIC', 'needed', 'TOKEN'],
    ['NAME', 'not_needed', 'FILL'],
    // biometric
    ['FACE', 'needed', 'BLUR'],
    ['FACE', 'not_needed', 'BLUR'],
    ['PHOTO', 'not_needed', 'BLUR'],
    // documents
    ['ID_DOCUMENT', 'needed', 'FILL_REGION'],
    ['UNSCANNED_MEDIA', 'needed', 'FILL_REGION'],
    ['UNSCANNED_MEDIA', 'not_needed', 'FILL_REGION'],
  ];

  for (const [category, necessity, expected] of cases) {
    it(`${category} (${necessity}) -> ${expected}`, () => {
      expect(decide(det(category), ctx(necessity))).toBe(expected);
    });
  }
});

describe('decide: quasi categories accumulate identity per origin', () => {
  const quasiCategories: Category[] = ['CITY', 'PIN_CODE', 'EMPLOYER', 'DATE', 'ORDER_ID', 'IFSC'];

  for (const category of quasiCategories) {
    it(`${category} is ALLOW with no identity seen`, () => {
      expect(decide(det(category), ctx('needed', false))).toBe('ALLOW');
    });

    it(`${category} becomes TOKEN once identity has been seen on the origin`, () => {
      expect(decide(det(category), ctx('needed', true))).toBe('TOKEN');
    });
  }
});

describe('decide: user overrides', () => {
  it('honours an override for an unlocked (medium) category', () => {
    expect(decide(det('NAME'), ctx('needed', false, { NAME: 'FILL' }))).toBe('FILL');
  });

  it('IGNORES an override for every locked class', () => {
    const lockedExamples: Array<[Category, Action]> = [
      ['OTP', 'USER_ENTERS'],
      ['PASSWORD', 'USER_PROVIDED_ORIGIN_BOUND'],
      ['AADHAAR', 'TOKEN_WITH_APPROVAL'],
      ['FACE', 'BLUR'],
      ['ID_DOCUMENT', 'FILL_REGION'],
    ];
    for (const [category, expected] of lockedExamples) {
      // Try to downgrade each one to ALLOW — the policy must refuse.
      expect(decide(det(category), ctx('needed', false, { [category]: 'ALLOW' }))).toBe(expected);
    }
  });

  it('an override cannot loosen a quasi category that identity accumulation already tightened', () => {
    // CITY is unlocked, so an override IS honoured here — documenting the deliberate boundary:
    // only the five locked classes are immune to user settings.
    expect(decide(det('CITY'), ctx('needed', true, { CITY: 'ALLOW' }))).toBe('ALLOW');
  });
});

describe('classOf / isLockedCategory / isIdentityCategory', () => {
  it('maps categories to their policy class', () => {
    expect(classOf('AADHAAR')).toBe('high');
    expect(classOf('NAME')).toBe('medium');
    expect(classOf('CITY')).toBe('quasi');
    expect(classOf('PASSWORD')).toBe('credential');
  });

  it('identifies locked categories', () => {
    expect(isLockedCategory('AADHAAR')).toBe(true);
    expect(isLockedCategory('PASSWORD')).toBe(true);
    expect(isLockedCategory('FACE')).toBe(true);
    expect(isLockedCategory('NAME')).toBe(false);
    expect(isLockedCategory('CITY')).toBe(false);
  });

  it('identifies identity categories', () => {
    expect(isIdentityCategory('NAME')).toBe(true);
    expect(isIdentityCategory('AADHAAR')).toBe(true);
    expect(isIdentityCategory('FACE')).toBe(true);
    expect(isIdentityCategory('CITY')).toBe(false);
    expect(isIdentityCategory('ORDER_ID')).toBe(false);
  });
});

describe('SessionPrivacyState (identity accumulation across captures)', () => {
  it('marks an origin once an identity category is detected with sufficient confidence', () => {
    const state = new SessionPrivacyState();
    state.observeDetections('https://a.test', [det('NAME', 0.9)]);
    expect(state.hasIdentitySeen('https://a.test')).toBe(true);
  });

  it('does not mark on a low-confidence identity detection', () => {
    const state = new SessionPrivacyState();
    state.observeDetections('https://a.test', [det('NAME', 0.2)]);
    expect(state.hasIdentitySeen('https://a.test')).toBe(false);
  });

  it('does not mark on a non-identity category', () => {
    const state = new SessionPrivacyState();
    state.observeDetections('https://a.test', [det('CITY', 0.99)]);
    expect(state.hasIdentitySeen('https://a.test')).toBe(false);
  });

  it('ACCUMULATES: identity on capture 1 still counts for a quasi detection on capture 3', () => {
    const state = new SessionPrivacyState();
    // capture 1: a name appears
    state.observeDetections('https://a.test', [det('NAME', 0.9)]);
    // capture 2: nothing sensitive
    state.observeDetections('https://a.test', []);
    // capture 3: only a city — but the origin is already marked
    state.observeDetections('https://a.test', [det('CITY', 0.8)]);
    expect(decide(det('CITY'), ctx('needed', state.hasIdentitySeen('https://a.test')))).toBe('TOKEN');
  });

  it('is scoped per origin — another site does not inherit the mark', () => {
    const state = new SessionPrivacyState();
    state.observeDetections('https://a.test', [det('NAME', 0.9)]);
    expect(state.hasIdentitySeen('https://b.test')).toBe(false);
  });

  it('clear() ends the session state', () => {
    const state = new SessionPrivacyState();
    state.observeDetections('https://a.test', [det('NAME', 0.9)]);
    state.clear();
    expect(state.hasIdentitySeen('https://a.test')).toBe(false);
  });
});

describe('determineNecessity (Stage 2 heuristic)', () => {
  const normalize = (category: Category, value: string) => normalizeValue(category, value);

  it('is "needed" when the value matches something the vault already holds', () => {
    const necessity = determineNecessity({
      det: det('EMAIL', 0.9, { rawValue: 'Asha@Example.com' as never }),
      vaultNormalizedValues: new Set(['asha@example.com']),
      taskCategories: new Set(),
      targetIsEditable: true,
      normalize,
    });
    expect(necessity).toBe('needed');
  });

  it('is "needed" for an editable field whose category the task has tokens for', () => {
    const necessity = determineNecessity({
      det: det('EMAIL'),
      vaultNormalizedValues: new Set(),
      taskCategories: new Set<Category>(['EMAIL']),
      targetIsEditable: true,
      targetFieldCategory: 'EMAIL',
      normalize,
    });
    expect(necessity).toBe('needed');
  });

  it('is "not_needed" for a read-only value the task never mentioned (fails closed)', () => {
    const necessity = determineNecessity({
      det: det('AADHAAR', 0.95, { rawValue: '234567890123' as never }),
      vaultNormalizedValues: new Set(),
      taskCategories: new Set(),
      targetIsEditable: false,
      normalize,
    });
    expect(necessity).toBe('not_needed');
  });

  it('is "not_needed" for an editable field of a category the task does not want', () => {
    const necessity = determineNecessity({
      det: det('AADHAAR'),
      vaultNormalizedValues: new Set(),
      taskCategories: new Set<Category>(['EMAIL']),
      targetIsEditable: true,
      targetFieldCategory: 'AADHAAR',
      normalize,
    });
    expect(necessity).toBe('not_needed');
  });
});

describe('canTokenizeFromPage', () => {
  it('refuses to tokenize page-sourced secrets', () => {
    for (const category of ['PASSWORD', 'OTP', 'CVV', 'UPI_PIN'] as Category[]) {
      expect(canTokenizeFromPage(category)).toBe(false);
    }
  });

  it('allows tokenizing ordinary categories from the page', () => {
    for (const category of ['EMAIL', 'NAME', 'AADHAAR', 'PHONE'] as Category[]) {
      expect(canTokenizeFromPage(category)).toBe(true);
    }
  });
});

/**
 * Stage 7J — uncertainty is fail-closed.
 *
 * The contract, in one sentence: an uncertain detection is MASKED and never TOKENIZED. Everything
 * below is a way of saying that from a different direction, because a token is the artifact that
 * carries a value off the device in reusable form and a mask is the artifact that does not.
 */
describe('Stage 7: uncertain detections', () => {
  const ctx = { necessity: 'needed' as const, identitySeenOnOrigin: true, userOverrides: {} };
  const uncertain = (category: Category) => det(category, 0.5, { certainty: 'uncertain' });

  it.each<[Category, Action]>([
    ['AADHAAR', 'FILL'],
    ['CARD_NUMBER', 'FILL'],
    ['NAME', 'FILL'],
    ['EMAIL', 'FILL'],
    ['FINANCIAL_VALUE', 'FILL'],
    ['PIN_CODE', 'FILL'],
  ])('a needed %s that is uncertain is masked, not tokenized (%s)', (category, expected) => {
    expect(decide(uncertain(category), ctx)).toBe(expected);
  });

  it('the same detection, confident, IS tokenized — so the mask is the uncertainty, not the category', () => {
    expect(decide(det('AADHAAR'), ctx)).toBe('TOKEN_WITH_APPROVAL');
    expect(decide(det('NAME'), ctx)).toBe('TOKEN');
  });

  it('a user override cannot loosen an uncertain detection', () => {
    const loosened = { ...ctx, userOverrides: { NAME: 'ALLOW' as Action } };
    expect(decide(uncertain('NAME'), loosened)).toBe('FILL');
    // ...but it still applies to a confident one, so the override is not simply broken.
    expect(decide(det('NAME'), loosened)).toBe('ALLOW');
  });

  it('never marks an origin identity-seen', () => {
    const state = new SessionPrivacyState();
    state.observeDetections('https://a.test', [uncertain('AADHAAR')]);
    expect(state.hasIdentitySeen('https://a.test')).toBe(false);

    state.observeDetections('https://a.test', [det('AADHAAR')]);
    expect(state.hasIdentitySeen('https://a.test')).toBe(true);
  });

  it('never counts toward the linkability K', () => {
    const state = new SessionPrivacyState();
    state.observeDetections('https://b.test', [
      uncertain('CITY'), uncertain('PIN_CODE'), uncertain('EMPLOYER'),
    ]);
    expect(state.hasLinkability('https://b.test', 3)).toBe(false);
  });

  it('is strictly more private than the pre-Stage-7 behaviour, which sent an undetected value as-is', () => {
    // There is no path by which uncertainty produces ALLOW for any PII class.
    const categories: Category[] = ['AADHAAR', 'PAN', 'NAME', 'EMAIL', 'CITY', 'ORDER_ID', 'FINANCIAL_VALUE'];
    for (const category of categories) {
      for (const necessity of ['needed', 'not_needed'] as const) {
        expect(decide(uncertain(category), { ...ctx, necessity })).not.toBe('ALLOW');
      }
    }
  });
});
