import type { EID } from './registry';
import type { Category, Action } from '../privacy/categoryTypes';
import type { FillState } from '../privacy/detect/fillState';
import type { CssRect, ElementStates, LocalOnly, Observation } from '../observe/types';
import type { StateToken } from '../shared/messages';
import type { DraftRedaction, DraftVisualRegion, SanitizedTextBlock, Mode } from '../privacy/payloadBuilder';
import type { RedactedImage, MaskRequest } from '../privacy/redactor';
import type { MergedDetection } from '../privacy/detect/merge';

export type StateTokenId = `S${string}`;
export interface SceneElement {
  eid: EID; fp: string; fpOrdinal: number; frameId: number; ambiguous: boolean;
  role: string; labelSanitized: string; inputType?: string;
  fieldCategory?: Category; fill?: FillState;
  states: ElementStates; bbox: CssRect; visible: boolean; hitOk: boolean; hiddenInteractive: boolean;
  /** On screen but something is on top of it. `coveredBy` is set only when the cover is itself a
   * scene element, so the planner can be told what to clear first. */
  occluded: boolean; coveredBy?: EID;
  /** Enter here is an ordinary search, not a commit: the field is in search scope, and its whole
   * form is free of sensitive fields, password fields and cross-origin actions. */
  searchFormSafe: boolean;
  detectionIds: string[]; decision?: Action; token?: string; sources: string[]; confidence?: number;
  local: LocalOnly<{ lineRects: CssRect[]; rawRef: unknown }>;
  /** Authority metadata is local only, never projected into the remote contract. */
  tag: string; inForm: boolean; buttonType?: string; formAction: boolean; href?: string; download: boolean;
  hasValue: boolean; valueLenBucket?: 'empty' | 'short' | 'medium' | 'long';
}
export interface SceneRegion extends DraftVisualRegion { visible: boolean; redacted: boolean }
export type SceneText = SanitizedTextBlock;
export interface SceneGraph {
  session_id: string; capture_id: string; state_token: StateTokenId;
  screen: { decision: 'NEW_SCREEN' | 'SAME_SCREEN'; reason: string };
  screenEpoch: number;
  page: { origin: string; urlSanitized: string; titleSanitized: string; type?: string };
  elements: Map<EID, SceneElement>;
  regions: Map<string, SceneRegion>; texts: Map<string, SceneText>;
  relations: { labelOf: Map<EID, string>; inForm: Map<EID, string>; inModal: Map<EID, string>; inFrame: Map<EID, number> };
  taskSanitized: string; mode: Mode; redactions: DraftRedaction[]; image?: RedactedImage;
  local: LocalOnly<{ observation: Observation; stateToken: StateToken; masks: MaskRequest[]; detections: MergedDetection[] }>;
}
