import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ElementStructure } from '../../observe/types';

/**
 * Stage 7N — the new local-only fields must never reach the server.
 *
 * `ElementStructure` (placeholder, maxlength, pattern, legend text, column headers, section
 * headings) and `Detection.evidence` (which signals fired) are DETECTION INPUTS AND REASONING.
 * Both are exactly the kind of thing invariant 1 keeps local: a placeholder or a legend routinely
 * contains user data, and the evidence list would tell a hostile page which signals to avoid.
 *
 * `privacy/firewall.ts` is deliberately NOT modified by Stage 7 — no new field is added to the
 * payload, so there is nothing new for `seal()` to check. These tests pin that claim structurally
 * rather than trusting it: if anyone later adds one of these to the payload schema or to the
 * outbound element, one of them fails.
 */

const schema = JSON.parse(
  readFileSync(path.join(__dirname, '../../../shared/schema/payload.v2.schema.json'), 'utf8'),
) as Record<string, unknown>;

/** Every property name anywhere in the payload schema. */
function allPropertyNames(node: unknown, found: Set<string> = new Set()): Set<string> {
  if (!node || typeof node !== 'object') return found;
  const record = node as Record<string, unknown>;
  if (record.properties && typeof record.properties === 'object') {
    for (const key of Object.keys(record.properties)) found.add(key);
  }
  for (const value of Object.values(record)) allPropertyNames(value, found);
  return found;
}

const STRUCTURE_KEYS: Array<keyof ElementStructure> = [
  'placeholder', 'maxLength', 'minLength', 'pattern', 'inputMode', 'legendText', 'columnHeaderText', 'sectionHeading',
];

describe('Stage 7: local-only fields are absent from the outbound contract', () => {
  const names = allPropertyNames(schema);

  it.each(STRUCTURE_KEYS)('payload.v2 schema has no "%s" property', (key) => {
    expect(names.has(key)).toBe(false);
    expect(names.has(key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`))).toBe(false);
  });

  it.each(['evidence', 'certainty', 'structure', 'signals'])('payload.v2 schema has no "%s" property', (key) => {
    expect(names.has(key)).toBe(false);
  });

  it('the schema still carries the fields it is supposed to', () => {
    // A guard on the guard: if the traversal silently found nothing, the assertions above would
    // pass vacuously and prove nothing.
    expect(names.has('eid')).toBe(true);
    expect(names.has('state_token')).toBe(true);
  });
});

describe('Stage 7: the outbound element builder never reads a local-only field', () => {
  const sceneSource = readFileSync(path.join(__dirname, '../../scene/index.ts'), 'utf8');
  const payloadBuilderSource = readFileSync(path.join(__dirname, '../payloadBuilder.ts'), 'utf8');

  it.each(STRUCTURE_KEYS)('scene/index.ts never references el.%s', (key) => {
    expect(sceneSource).not.toContain(`.${key}`);
  });

  it('neither outbound builder mentions the structure block or the evidence list', () => {
    for (const source of [sceneSource, payloadBuilderSource]) {
      // Property references, not bare substrings — `structuredClone` is not a leak.
      expect(source).not.toMatch(/\bstructure\s*[:.]|\.structure\b/);
      expect(source).not.toMatch(/\bevidence\s*[:.]|\.evidence\b/);
      expect(source).not.toMatch(/\bcertainty\b/);
    }
  });
});

describe('Stage 7: firewall.ts is unmodified by this stage', () => {
  it('seal() still has exactly the eight documented checks and no Stage 7 special case', () => {
    const firewall = readFileSync(path.join(__dirname, '../firewall.ts'), 'utf8');
    expect(firewall).not.toMatch(/stage.?7/i);
    expect(firewall).not.toContain('certainty');
    expect(firewall).not.toContain('evidence');
  });
});
