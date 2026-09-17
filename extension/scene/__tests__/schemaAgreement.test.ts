import { it, expect } from 'vitest';
import cases from '../../../shared/schema/agreement-cases.json';
import validatePlan from '../../privacy/generated/planValidator.js';
import validatePayload from '../../privacy/generated/payloadValidator.js';

it.each(cases)('standalone validator agrees: $name', fixture => {
  const validate = fixture.kind === 'plan' ? validatePlan : validatePayload;
  expect(validate(fixture.value)).toBe(fixture.valid);
});
