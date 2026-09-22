import { markLocalOnly, type RawElement, type Observation } from '../../observe/types';
import { buildScene, type SceneGraph } from '..';
import { EIDRegistry } from '../registry';
export function element(overrides: Partial<RawElement> = {}): RawElement {
  return { fp: 'fpa', fpOrdinal: 0, frameId: 0, nodeRef: 'node-a', tag: 'input', role: 'textbox',
    name: 'Email', labelText: 'Email', inputType: 'email', value: 'private@example.test', hasValue: true,
    states: { disabled: false, checked: undefined, selected: undefined, expanded: undefined, focused: false, readonly: false, required: false },
    bbox: { x: 10, y: 10, width: 100, height: 20 }, lineRects: [], visible: true, hitOk: true,
    visibilityReason: 'visible', hiddenInteractive: false, privacyAttrs: [], inShadow: 'none', ...overrides };
}
export function observation(elements = [element()], overrides: Partial<Observation> = {}): Observation {
  return markLocalOnly({ capture_id: 'cap1', ts: 1, url: 'https://example.test/a', title: 'Example',
    viewport: { cssW: 800, cssH: 600, dpr: 1, scrollX: 0, scrollY: 0, zoom: 1, visualScale: 1 },
    frames: [{ frameId: 0, parentFrameId: null, url: 'https://example.test/a', mapping: 'top' }], elements, media: [], textBlocks: [],
    screenshot: { dataUrl: '', pxW: 800, pxH: 600, scaleX: 1, scaleY: 1 },
    timings: { injectMs: 0, harvestMs: 0, captureMs: 0, totalMs: 0 }, counts: { elements: elements.length, visibleElements: elements.length, hiddenInteractive: 0, media: 0, textBlocks: 0, frames: 1 }, ...overrides });
}
export function scene(elements = [element()], registry = new EIDRegistry(), obsOverrides: Partial<Observation> = {}, screenEpoch = 1): SceneGraph {
  const obs = observation(elements, obsOverrides); registry.reconcile(obs);
  return buildScene(obs, [], [], registry, { sessionId: 'session', stateTokenId: 'Sabcdefghij',
    stateToken: { mutationCounter: 0, scrollX: 0, scrollY: 0, dpr: 1, visualScale: 1, innerWidth: 800, innerHeight: 600 },
    screen: { decision: 'NEW_SCREEN', reason: 'test' }, screenEpoch,
    mode: 'balanced', url: 'https://example.test/a', title: 'Example', task: 'Fill the form',
    labels: new Map(elements.map(e => [registry.identity(e).eid, e.name])), texts: [], elementDecisions: new Map(), tokensByDetection: new Map() });
}
