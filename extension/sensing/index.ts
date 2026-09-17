import type { SceneGraph } from '../scene';
import type { Mode } from '../privacy/payloadBuilder';
export interface SensingDecision {
  reuse: boolean; runPrivacyDetector: boolean; runUiDetector: boolean; runOcr: boolean;
  detectorInput: number | null; serverImage: 'none' | Mode; elementBudget: number;
}
export interface SensingCounters { steps: number; domOnly: number; visionRequired: number; ocrRequired: number; highResEscalations: number; reused: number }
export const emptyCounters = (): SensingCounters => ({ steps: 0, domOnly: 0, visionRequired: 0, ocrRequired: 0, highResEscalations: 0, reused: 0 });
export function decideSensing(prevScene: SceneGraph | undefined, observationMeta: { screen: SceneGraph['screen']; captureId: string }, mode: Mode, budgets: { elements: number }): SensingDecision {
  const reuse = Boolean(prevScene && observationMeta.screen.decision === 'SAME_SCREEN');
  return { reuse, runPrivacyDetector: false, runUiDetector: false, runOcr: false, detectorInput: null,
    serverImage: reuse ? 'none' : mode, elementBudget: Math.max(0, Math.floor(budgets.elements)) };
}
export function countSensing(previous: SensingCounters, decision: SensingDecision): SensingCounters {
  return { steps: previous.steps + 1, domOnly: previous.domOnly + Number(!decision.runPrivacyDetector && !decision.runUiDetector && !decision.runOcr),
    visionRequired: previous.visionRequired + Number(decision.runPrivacyDetector || decision.runUiDetector),
    ocrRequired: previous.ocrRequired + Number(decision.runOcr), highResEscalations: previous.highResEscalations,
    reused: previous.reused + Number(decision.reuse) };
}
// TODO(stage-5): privacy detector; TODO(stage-6): UI/OCR gating; TODO(stage-8): caching and expansion wiring.
