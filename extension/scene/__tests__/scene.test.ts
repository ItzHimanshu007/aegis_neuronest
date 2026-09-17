import { describe, it, expect } from 'vitest';
import { element, observation, scene } from './fixtures';
import { EIDRegistry } from '../registry';
import { StateTokens } from '../stateTokens';
import { toOutboundDraft, toLocalView } from '..';
import { buildPayload } from '../../privacy/payloadBuilder';
import { composeObservation } from '../../observe/compose';
import { harvestFrame } from '../../observe/harvester';

describe('EID stability', () => {
  it('survives id/class re-render using real harvester fingerprints', () => {
    const registry = new EIDRegistry();
    const read = (id: string, cap: string) => {
      document.body.innerHTML = `<label for="${id}">Email</label><input id="${id}" class="${id}" type="email">`;
      const [el] = harvestFrame({ salt: 'session', frameId: 0 }).elements;
      const raw = { ...el!, fpOrdinal: 0 }; const obs = observation([raw], { capture_id: cap });
      registry.reconcile(obs); return registry.identity(raw).eid;
    };
    expect(read('first', 'cap1')).toBe(read('random-render', 'cap2'));
  });
  it('survives scroll and SPA route changes for persistent headers', () => {
    const r = new EIDRegistry(), a = element({ role: 'link', tag: 'a', name: 'Home' });
    r.reconcile(observation([a])); const id = r.identity(a).eid;
    const b = { ...a, bbox: { ...a.bbox, y: -100 } };
    r.reconcile(observation([b], { capture_id: 'cap2', url: 'https://example.test/other' }));
    expect(r.identity(b).eid).toBe(id);
  });
  it('allocates new IDs for insertion; never reuses retired keys', () => {
    const r = new EIDRegistry(), a = element(), b = element({ fp: 'fpb', nodeRef: 'node-b' });
    r.reconcile(observation([a])); const id = r.identity(a).eid;
    r.reconcile(observation([a, b], { capture_id: 'cap2' })); expect(r.identity(a).eid).toBe(id); const other = r.identity(b).eid;
    r.reconcile(observation([b], { capture_id: 'cap3' }));
    r.reconcile(observation([a, b], { capture_id: 'cap4' })); expect(r.identity(a).eid).not.toBe(id); expect(r.identity(a).eid).not.toBe(other);
  });
  it('duplicate reordering marks the whole group ambiguous', () => {
    const r = new EIDRegistry(), a = element(), b = element({ fpOrdinal: 1, nodeRef: 'node-b' });
    r.reconcile(observation([a, b])); expect(r.identity(a).ambiguous).toBe(false);
    const swapped = [{ ...b, fpOrdinal: 0 }, { ...a, fpOrdinal: 1 }];
    r.reconcile(observation(swapped, { capture_id: 'cap2' }));
    expect(swapped.every(e => r.identity(e).ambiguous)).toBe(true);
  });
  it('separates frames with the same fingerprint and ordinal', () => {
    const r = new EIDRegistry(), a = element(), b = element({ frameId: 5 });
    const o = observation([a, b]); o.frames.push({ frameId: 5, parentFrameId: 0, url: 'https://other.test/', mapping: 'src-size-match' });
    r.reconcile(o); expect(r.identity(a).eid).not.toBe(r.identity(b).eid);
  });
});
it('outbound projection excludes raw fields, local references and mark_id', () => {
  const s = scene(), p = buildPayload(toOutboundDraft(s));
  expect(toLocalView(s).local.observation.elements[0]?.value).toBe('private@example.test');
  for (const needle of ['private@example.test', 'mark_id', 'node-a', 'rawRef', 'lineRects', 'formRef']) expect(JSON.stringify(p)).not.toContain(needle);
  expect(p.elements[0]?.eid).toBe('E1');
  expect(p.state_token).toBe('Sabcdefghij');
});
it('empty sensitive fields have value-free hints', () => {
  const p = buildPayload(toOutboundDraft(scene([element({ hasValue: false, value: '' })])));
  expect(p.field_hints).toEqual([{ eid: 'E1', category: 'EMAIL', fill: 'empty' }]);
  expect(p.redactions).toEqual([]);
});
it('hidden fields expose no type, value, length or real geometry', () => {
  const e = buildPayload(toOutboundDraft(scene([element({ visible: false, hiddenInteractive: true })]))).elements[0]!;
  expect(e.input_type).toBeUndefined(); expect(e.has_value).toBeUndefined(); expect(e.value_token).toBeUndefined(); expect(e.bbox).toEqual([0,0,0,0]);
});
it('mints opaque random states and retains only the latest sealed mapping', () => {
  const states = new StateTokens(), a = states.mint(), b = states.mint();
  expect(a).toMatch(/^S[a-z2-7]{10}$/); expect(a).not.toBe(b);
  const s = scene(); s.state_token = a; states.commit(s);
  expect(states.get(a)?.capture_id).toBe('cap1');
  const next = scene(); next.state_token = b; states.commit(next);
  expect(states.get(a)).toBeUndefined(); expect(states.latest).toBe(b); states.clear(); expect(states.latest).toBeUndefined();
});
// Type proof: even a LocalOnly observation cannot be accepted by the builder.
export function projectionTypeProof(): void {
  // @ts-expect-error Only the branded Scene Graph projection is accepted.
  buildPayload(observation());
  // @ts-expect-error A structural impostor has no projection brand.
  buildPayload({ payload: {} });
}

it('removal from a duplicate group cannot silently retarget a sensitive EID', () => {
  const r = new EIDRegistry(), a = element(), b = element({ fpOrdinal: 1, nodeRef: 'node-b' });
  r.reconcile(observation([a,b]));
  const remaining = { ...b, fpOrdinal: 0 };
  r.reconcile(observation([remaining], { capture_id: 'cap2' }));
  expect(r.identity(remaining).ambiguous).toBe(true);
});

it('inserting a duplicate in another frame preserves a persistent EID', () => {
  const r=new EIDRegistry();
  const child=element({frameId:1,nodeRef:'child'});
  const read=(extra:boolean,cap:string)=>{
    const parts=composeObservation([
      {frameId:0,offsetChain:[],elements:extra?[element()]:[],media:[],textBlocks:[]},
      {frameId:1,offsetChain:[],elements:[child],media:[],textBlocks:[]},
    ]);
    const o=observation(parts.elements,{capture_id:cap});
    o.frames.push({frameId:1,parentFrameId:0,url:'https://other.test',mapping:'same-origin'});
    r.reconcile(o);return r.identity(parts.elements.find(e=>e.frameId===1)!).eid;
  };
  expect(read(false,'cap1')).toBe(read(true,'cap2'));
});
