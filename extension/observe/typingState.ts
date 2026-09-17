/** Local-only input activity, shared by the watcher and the next harvest. No values retained. */
const typing = new WeakSet<Element>();
export function noteTyping(el: Element, active: boolean): void {
  if (active) typing.add(el); else typing.delete(el);
}
export function isBeingTyped(el: Element): boolean { return typing.has(el); }
