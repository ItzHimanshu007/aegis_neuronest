import type { SceneGraph } from '../scene';
import type { Mode } from '../privacy/payloadBuilder';
export interface SensingDecision {
  reuse: boolean; runPrivacyDetector: boolean; runUiDetector: boolean; runOcr: boolean;
  detectorInput: number | null; serverImage: 'none' | Mode; elementBudget: number;
}
export interface SensingCounters { steps: number; domOnly: number; visionRequired: number; ocrRequired: number; highResEscalations: number; reused: number }
export const emptyCounters = (): SensingCounters => ({ steps: 0, domOnly: 0, visionRequired: 0, ocrRequired: 0, highResEscalations: 0, reused: 0 });
/**
 * `sendImage: false` withholds the screenshot from EVERY step, not just the repeat ones.
 *
 * The router already drops it on SAME_SCREEN, so a task normally pays for one image per screen.
 * Measured on the sealed KYC payload against gemini-3.1-flash-lite, 3 runs each: 3,777 prompt
 * tokens and a 3,720ms median with the screenshot, 2,735 tokens and 2,408ms without — same plan
 * either way on a form whose fields all carry real labels.
 *
 * It is a choice, never a default. Without the image the model loses the Set-of-Marks tags it
 * grounds `target.eid` on, and a page of icon-only controls or canvas gives the element list far
 * less to go on than kyc.html does. Capture still happens locally: the screenshot's dhash drives
 * NEW_SCREEN detection, and the panel's own privacy preview renders from it. Only the outbound
 * copy is withheld.
 */
export function decideSensing(prevScene: SceneGraph | undefined, observationMeta: { screen: SceneGraph['screen']; captureId: string }, mode: Mode, budgets: { elements: number }, sendImage = true): SensingDecision {
  const reuse = Boolean(prevScene && observationMeta.screen.decision === 'SAME_SCREEN');
  return { reuse, runPrivacyDetector: false, runUiDetector: false, runOcr: false, detectorInput: null,
    serverImage: reuse || !sendImage ? 'none' : mode, elementBudget: Math.max(0, Math.floor(budgets.elements)) };
}
export function countSensing(previous: SensingCounters, decision: SensingDecision): SensingCounters {
  return { steps: previous.steps + 1, domOnly: previous.domOnly + Number(!decision.runPrivacyDetector && !decision.runUiDetector && !decision.runOcr),
    visionRequired: previous.visionRequired + Number(decision.runPrivacyDetector || decision.runUiDetector),
    ocrRequired: previous.ocrRequired + Number(decision.runOcr), highResEscalations: previous.highResEscalations,
    reused: previous.reused + Number(decision.reuse) };
}
// TODO(stage-5): privacy detector; TODO(stage-6): UI/OCR gating; TODO(stage-8): caching and expansion wiring.
