/**
 * Compile-time proof that `Observation` (and anything else branded `LocalOnly`) cannot reach
 * `net/network.ts -> send()`. Checked by `tsc --noEmit` as part of `pnpm check`'s typecheck step
 * — if any `@ts-expect-error` below stops being an error, this file fails to compile ("Unused
 * '@ts-expect-error' directive"), which is exactly the failure mode we want.
 *
 * Deliberately named `*.typetest.ts`, not `*.test.ts`, so Vitest's default glob doesn't pick it
 * up and try to execute it — this file only needs to be *type-checked*, never run. Everything
 * that touches `send()` lives inside an uncalled function for the same reason (belt and braces).
 */

import { send } from '../../net/network';
import type { SanitizedPayload } from '../../privacy/firewall';
import type { Observation, RawElement, RawObservation } from '../types';

// Never invoked — exists purely so the type errors below are checked without ever calling
// network.send() at runtime.
function _typeOnly_neverCalled(observation: Observation, element: RawElement, raw: RawObservation) {
  // 1. An Observation cannot be passed to send() directly.
  // @ts-expect-error Observation is LocalOnly, not a SanitizedPayload — see AGENTS.md invariant 1/2.
  void send(observation);

  // 2. Casting through `as unknown as SanitizedPayload` is possible in TypeScript (nothing stops
  //    a type-level cast), but that's exactly why network.ts *also* checks a runtime registry —
  //    see net/__tests__/network.test.ts for the runtime half of this proof. This block exists so
  //    a reviewer can see that `as SanitizedPayload` requires a **explicit, visible** unsafe cast;
  //    it does not typecheck as a plain assignment.
  // @ts-expect-error a bare RawElement is not assignable to SanitizedPayload without an unsafe cast.
  const forged: SanitizedPayload = element;
  void forged;

  // 3. The unbranded RawObservation is *also* not assignable to Observation without going through
  //    observe/types.ts -> markLocalOnly(), which only observe/capture.ts calls.
  // @ts-expect-error RawObservation is missing the LocalOnly brand.
  const notObservation: Observation = raw;
  void notObservation;
}

void _typeOnly_neverCalled;
