import type { Observation, RawElement } from '../observe/types';
export type EID = `E${number}`;

/** Sole allocator of element IDs. Active keys survive captures; retired keys never return. */
export class EIDRegistry {
  private next = 1;
  private active = new Map<string, { eid: EID; ref?: string; ambiguous: boolean }>();
  private capture = '';
  private byElement = new Map<RawElement, { eid: EID; ambiguous: boolean }>();

  reconcile(observation: Observation): void {
    if (this.capture === observation.capture_id && observation.elements.every(e => this.byElement.has(e))) return;
    const framePath = (frameId: number, seen = new Set<number>()): string => {
      if (seen.has(frameId)) throw new Error('Invalid frame graph');
      seen.add(frameId);
      const frame = observation.frames.find(f => f.frameId === frameId);
      if (!frame || frame.parentFrameId === null) return new URL(observation.url).origin + '/top';
      const siblings = observation.frames.filter(f => f.parentFrameId === frame.parentFrameId);
      return `${framePath(frame.parentFrameId, seen)}/${siblings.indexOf(frame)}`;
    };
    const grouped = new Map<string, RawElement[]>();
    for (const el of observation.elements) {
      const group = JSON.stringify([framePath(el.frameId), el.fp]);
      const list = grouped.get(group) ?? []; list.push(el); grouped.set(group, list);
    }
    const active = new Map<string, { eid: EID; ref?: string; ambiguous: boolean }>();
    this.byElement.clear();
    for (const [group, elements] of grouped) {
      const previousDuplicates = [...this.active.keys()].filter(key => key.startsWith(`${group}:`)).length > 1;
      const uncertain = (elements.length > 1 || previousDuplicates) && elements.some(el => {
        const old = this.active.get(`${group}:${el.fpOrdinal}`);
        return !el.nodeRef || (old !== undefined && old.ref !== el.nodeRef);
      });
      for (const el of elements) {
        const key = `${group}:${el.fpOrdinal}`;
        if (active.has(key)) throw new Error('Duplicate Scene Graph key');
        const old = this.active.get(key);
        if (!old && this.next > 999999) throw new Error('EID session budget exhausted');
        const entry = { eid: old?.eid ?? `E${this.next++}` as EID, ref: el.nodeRef, ambiguous: uncertain || Boolean(old?.ambiguous) };
        el.eid = entry.eid;
        active.set(key, entry); this.byElement.set(el, entry);
      }
    }
    this.active = active;
    this.capture = observation.capture_id;
  }
  identity(el: RawElement): { eid: EID; ambiguous: boolean } {
    const entry = this.byElement.get(el);
    if (!entry) throw new Error('Element has not been registered for this capture');
    return { eid: entry.eid, ambiguous: entry.ambiguous };
  }
  clear(): void { this.active.clear(); this.byElement.clear(); this.capture = ''; }
}
