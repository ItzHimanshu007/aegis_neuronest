import { harvestFrame } from '../observe/harvester';
import { assignFpOrdinals } from '../observe/fingerprint';
import type { RawElement } from '../observe/types';
import type { EID } from '../scene';

/** Local registry key, never supplied by the server. No selectors or page ids/classes. */
export interface LocalTarget {
  eid: EID; fp: string; fpOrdinal: number; nodeRef?: string;
  framePath: number[]; origin: string; ambiguous: boolean; level: number;
}
export function reacquire(target: LocalTarget, salt: string, root: Document = document): { element: HTMLElement; raw: RawElement } {
  let doc = root;
  for (const index of target.framePath) {
    const child = doc.querySelectorAll('iframe')[index]?.contentDocument;
    if (!child) throw new Error('TARGET_MISSING');
    doc = child;
  }
  if (doc.location.origin !== target.origin) throw new Error('NEW_SCREEN');
  const refs = new Map<string, Element>();
  const elements = assignFpOrdinals(harvestFrame({ salt, frameId: 0, doc, win: doc.defaultView!, elementRefs: refs }).elements);
  const candidates = elements.filter(e => e.fp === target.fp);
  const raw = candidates.find(e => e.fpOrdinal === target.fpOrdinal);
  if (!raw) throw new Error('TARGET_MISSING');
  if ((target.ambiguous || (candidates.length > 1 && raw.nodeRef !== target.nodeRef)) && target.level >= 3) throw new Error('AMBIGUOUS_TARGET');
  const element = refs.get(raw.nodeRef!) as HTMLElement | undefined;
  if (!element) throw new Error('TARGET_MISSING');
  if (!raw.visible) throw new Error('NOT_VISIBLE');
  if (raw.hitOk !== true) throw new Error('NOT_HITTABLE');
  if (raw.states.disabled) throw new Error('DISABLED');
  return { element, raw };
}
