/**
 * The one place that answers "is the Stage 7 evidence layer on?".
 *
 * There are two callers with genuinely different needs, which is why this is a module rather than
 * a bare config read:
 *
 *   - the cascade takes a PER-CALL override (`CascadeInput.evidenceLayerEnabled`), so a unit test
 *     or the replay scorer can run one observation both ways;
 *   - `detect/labels.ts` cannot. It is called from `observe/harvester.ts` at capture time, deep
 *     inside the DOM walk, where no per-call option reaches — so it needs an ambient answer.
 *
 * Stage 7's label tie-break lives in labels.ts and must be gated too. Without this module it was
 * unconditional, and the BASELINE arm of the Stage 7 measurement quietly included it: on the
 * recorded held-out bundles a UPI handle flipped from ADDRESS to UPI_ID with the layer "off",
 * which would have made the reported delta attributable to two changes instead of one. The whole
 * value of a control arm is that it is genuinely the old behaviour.
 */

import { AEGIS_CONFIG } from '../../../shared/config';

let override: boolean | undefined;

export function isEvidenceLayerEnabled(): boolean {
  return override ?? AEGIS_CONFIG.EVIDENCE_LAYER_ENABLED;
}

/** Sets the ambient answer. `undefined` restores the configured default. Used by the Stage 7
 * evaluation (which runs both arms in one build) and by replay; production never calls it. */
export function setEvidenceLayerEnabled(enabled: boolean | undefined): void {
  override = enabled;
}

/** Runs `fn` with the layer forced on or off, restoring the previous setting afterwards. */
export async function withEvidenceLayer<T>(enabled: boolean, fn: () => Promise<T>): Promise<T> {
  const previous = override;
  override = enabled;
  try {
    return await fn();
  } finally {
    override = previous;
  }
}
