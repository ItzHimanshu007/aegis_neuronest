import { it, expect } from 'vitest';
import { ALL_CATEGORIES, ALL_ACTIONS, type Category } from '../../categoryTypes';
import { classifyFill, EXPECTED_LENGTH } from '../fillState';
import { isSecretLabel, matchLabelCategories, LABEL_OVERRIDES } from '../labels';
import { getElementFieldContext } from '../fieldContext';
import { runDetectionCascade } from '..';
import { runRules } from '../rules';
import { INDIAN_IDENTIFIER_RULES } from '../rules/indianIdentifiers';
import { element, observation } from '../../../scene/__tests__/fixtures';
import { harvestFrame } from '../../../observe/harvester';
import { decide } from '../../policy';
it.each(ALL_CATEGORIES)('%s fill states: empty, partial, filled', category => {
  expect(classifyFill({ hasValue: false, value: '' }, category)).toBe('empty');
  expect(classifyFill({ hasValue: true, value: 'x', beingTyped: true }, category)).toBe('partial');
  expect(classifyFill({ hasValue: true, value: 'x'.repeat(EXPECTED_LENGTH[category] ?? 20) }, category)).toBe('filled');
  if (EXPECTED_LENGTH[category]) expect(classifyFill({ hasValue: true, value: '1' }, category)).toBe('partial');
});
it.each(['PIN', 'ATM PIN', 'card PIN', 'UPI PIN', 'MPIN', 'security PIN', '4-digit PIN', 'n-digit PIN', 'पिन'])('%s never harvested', label => {
  document.body.innerHTML = `<label for="f">${label}</label><input id="f" value="987654">`;
  const e = harvestFrame({ salt: 's', frameId: 0 }).elements[0]!;
  expect(isSecretLabel(label)).toBe(true); expect(e.value).toBeUndefined(); expect(e.valueLenBucket).toBeUndefined(); expect(e.hasValue).toBe(true);
});
it.each(['PIN code','pincode','postal PIN','पिन कोड'])('%s is a postal field', label => {
  expect(isSecretLabel(label)).toBe(false); expect(getElementFieldContext(element({ name: label, labelText: label, inputType: 'text' }))).toBe('PIN_CODE');
});
it('postal autocomplete overrides bare PIN; password always wins', () => {
  expect(isSecretLabel('PIN', 'postal-code')).toBe(false);
  expect(getElementFieldContext(element({ name: 'PIN', autocomplete: 'postal-code' }))).toBe('PIN_CODE');
  expect(getElementFieldContext(element({ name: 'PIN code', autocomplete: 'postal-code', inputType: 'password' }))).toBe('PASSWORD');
});
it.each(Object.entries(LABEL_OVERRIDES))('%s chooses the specific %s phrase', (label, category) => expect(matchLabelCategories(label)[0]).toBe(category));
it.each([['मतदाता पहचान पत्र','VOTER_ID'],['पासपोर्ट','PASSPORT'],['ड्राइविंग लाइसेंस','DRIVING_LICENCE'],['आभा','ABHA'],['यूनिवर्सल खाता संख्या','UAN'],['gift message','PRIVATE_GENERIC'],['personal note','PRIVATE_GENERIC']] as const)('label %s maps to %s', (label, category) => expect(matchLabelCategories(label)[0]).toBe(category));
const positive: Partial<Record<Category, string>> = { VOTER_ID:'ABC1234567', PASSPORT:'Z1234567', DRIVING_LICENCE:'DL-0120241234567', ABHA:'12-3456-7890-1234', UAN:'234567890124', TRACKING_ID:'AWB123456789' };
it.each(INDIAN_IDENTIFIER_RULES)('$category requires a label and rejects empty input', rule => {
  expect(rule.find(positive[rule.category]!, { fieldCategory: rule.category })).not.toHaveLength(0);
  expect(rule.find(positive[rule.category]!, {})).toEqual([]);
  expect(rule.find('', { fieldCategory: rule.category })).toEqual([]);
});
it('explicit UAN label wins over Verhoeff-valid Aadhaar shape', () => {
  const obs = observation([element({ name: 'UAN', labelText: 'UAN', value: '234567890124' })]);
  expect(runDetectionCascade({ observation: obs }).detections.filter(d => d.target.kind === 'element').map(d => d.category)).toEqual(['UAN']);
  expect(runRules('234567890124', { fieldCategory: 'UAN' }).every(d => d.category === 'UAN')).toBe(true);
});
it('empty fields do not mask; partial and filled fields both detect', () => {
  for (const [value, present] of [['',false],['a',true],['ash@example.test',true]] as const) {
    const ds = runDetectionCascade({ observation: observation([element({ value, hasValue: present })]) }).detections.filter(d=>d.target.kind==='element');
    expect(ds.length > 0).toBe(present);
  }
});
it.each(ALL_CATEGORIES)('decide(%s) returns only real Actions for all conditional states', category => {
  const det = { id: 'd', capture_id: 'c', category, confidence: 1, source: 'field_context' as const, target: { kind: 'element' as const, ref: 'E1' }, rects: [] };
  for (const necessity of ['needed','not_needed'] as const) for (const identitySeenOnOrigin of [false,true]) for (const linkabilityActive of [false,true]) expect(ALL_ACTIONS).toContain(decide(det, { necessity, identitySeenOnOrigin, linkabilityActive, userOverrides: {} }));
});

it.each(['PASSPORT','DRIVING_LICENCE','TRACKING_ID'] as const)('does not treat ordinary label words as %s values', category => {
  expect(runRules('Passport document context privacy identifier', {fieldCategory: category})).toEqual([]);
});
