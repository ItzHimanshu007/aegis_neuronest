import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Stage 2 Part A2 hardening: "background stays a thin router: it forwards observations to the
 * host and must not cache raw observations." background.ts is a `defineBackground(() => {...})`
 * module that registers real browser listeners and can't meaningfully be instantiated in Vitest,
 * so this is a source-level enforcement test rather than a behavioural one: it reads the actual
 * file and asserts the specific pattern that would reintroduce the bug (storing a full
 * `RawElement[]` as "previous capture" state) is absent, and the narrow-projection pattern is
 * present. See observe/diff.ts's `toMarkIdentity`/`MarkIdentity` for the sanctioned projection,
 * and observe/__tests__/diff.test.ts for proof that projection only carries fp/fpOrdinal/visible.
 */
const backgroundSource = readFileSync(path.resolve(__dirname, '../../entrypoints/background.ts'), 'utf8');

describe('background.ts does not cache raw observations', () => {
  it('stores state via the narrow toMarkIdentity() projection, not raw elements', () => {
    expect(backgroundSource).toMatch(/toMarkIdentity\(composedElements\)/);
  });

  it('never stores a full elements array keyed as "elements" on the retained tab state', () => {
    // This is exactly the bug pattern this test exists to catch: `tabState.set(tabId, { elements: ... })`
    // would retain names/values across captures. The sanctioned field is `marks`.
    expect(backgroundSource).not.toMatch(/tabState\.set\([^)]*\{\s*elements:/);
  });

  it("TabObserveState's persisted field is typed MarkIdentity[], not RawElement[]", () => {
    const interfaceMatch = /interface TabObserveState \{([^}]*)\}/.exec(backgroundSource);
    expect(interfaceMatch, 'TabObserveState interface should exist in background.ts').not.toBeNull();
    const body = interfaceMatch![1]!;
    expect(body).toMatch(/marks:\s*MarkIdentity\[\]/);
    expect(body).not.toMatch(/RawElement\[\]/);
  });

  it('runObservationPipeline returns the Observation to its caller rather than assigning it to module-level state', () => {
    // A raw-caching regression would typically look like a module-level `let lastObservation`
    // being assigned inside runObservationPipeline. Assert no such assignment exists.
    expect(backgroundSource).not.toMatch(/lastObservation\s*=/);
    expect(backgroundSource).not.toMatch(/rawObservationCache/i);
  });
});
