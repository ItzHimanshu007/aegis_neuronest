/**
 * The task requirement ledger — Aegis's own record of whether the values the USER handed it
 * actually ended up on the page.
 *
 * Why this exists at all: `plan.v2` cannot express multi-field completion. `$defs.expect` is a flat
 * object with at most ONE `eid`, a `done` action carries exactly one `evidence` of that shape, is
 * schema-forbidden from carrying `target`, and `runAgentLoop` stops at the first `done`. So for
 * "fill in my name and email", the best evidence a model can offer is `{eid:E1,has_value:true}` —
 * which proves ONE field and says nothing about the other. Every other form is unsatisfiable by
 * construction: an eid-less `has_value` has no element to resolve against, `text_present` searches
 * sanitized DOM text (never input values), and `url_path_prefix:"/"` is caught by the vacuity gate.
 *
 * Rather than widen the plan schema — which would hand the untrusted server a richer surface for no
 * gain — the client keeps the ground truth itself. It already knows exactly which values it was
 * given and which EIDs it typed them into; the model never has to be believed on the point.
 *
 * PRIVACY: this holds vault TOKENS, EIDs and a screen counter. Never a value, never a category
 * name, never page text. It is local-only and is never projected into a payload (inv 1, 16).
 */
import type { SceneGraph, EID } from '../scene';

/** One confirmed write: token `token` went into `eid` while the page was on screen `screenEpoch`. */
export interface Placement { token: string; eid: EID; screenEpoch: number }
/** The ledger's state as plain, structurally-cloneable data. No class instance reaches `verify()`. */
export interface RequirementsView { required: readonly string[]; placements: readonly Placement[] }
export type RequirementCheck = { verdict: 'SATISFIED' } | { verdict: 'UNMET'; unmet: readonly string[] };

/**
 * Resolves every required token against a FRESH scene. Pure.
 *
 * A token is satisfied when some element it was typed into still holds a value. The awkward case is
 * navigation: `scene/registry.ts` retires EIDs permanently, so after the page moves on, a perfectly
 * good placement points at an EID that can never appear again. Failing there would punish a
 * completed task for the page having advanced, so a placement whose EIDs are ALL gone and whose
 * screen has since changed counts as satisfied-by-history. A placement whose EID is still present
 * but empty is a genuine revert, and a placement missing on the SAME screen genuinely vanished —
 * both stay unmet.
 */
export function checkRequirements(view: RequirementsView, scene: SceneGraph): RequirementCheck {
  const unmet: string[] = [];
  for (const token of view.required) {
    const placements = view.placements.filter(p => p.token === token);
    if (!placements.length) { unmet.push(token); continue; }
    // Checked before the epoch rule on purpose: an SPA that re-renders in place keeps the same
    // fp/ordinal and therefore the same EID, so a live `hasValue` is the strongest fact available
    // and must win over any inference from the screen counter.
    if (placements.some(p => scene.elements.get(p.eid)?.hasValue === true)) continue;
    const allGone = placements.every(p => !scene.elements.has(p.eid));
    if (allGone && placements.every(p => p.screenEpoch !== scene.screenEpoch)) continue;
    unmet.push(token);
  }
  return unmet.length ? { verdict: 'UNMET', unmet } : { verdict: 'SATISFIED' };
}

/**
 * Keyed by TOKEN, never by category: `vault.tokenize()` de-dupes on (type, normalized value), so
 * two task rows of the same category with different values are two distinct tokens. A
 * `Set<Category>` would collapse them and let one filled field satisfy both.
 */
export class RequirementLedger {
  private readonly required = new Set<string>();
  private readonly placements = new Map<string, Set<EID>>();
  private readonly epochs = new Map<string, number>();

  require(token: string): void { this.required.add(token); }

  /**
   * Records a confirmed write, and evicts `eid` from every OTHER token: if the loop types NAME into
   * E1 and later types EMAIL into the same E1, the name is gone from the page and must stop
   * counting, even though E1 still reports `hasValue`.
   */
  place(token: string, eid: EID, screenEpoch: number): void {
    for (const [other, eids] of this.placements) if (other !== token) eids.delete(eid);
    const eids = this.placements.get(token) ?? new Set<EID>();
    eids.add(eid); this.placements.set(token, eids);
    this.epochs.set(`${token}:${eid}`, screenEpoch);
  }

  /** Drops every requirement. Only ever called after the USER chooses to continue without them. */
  waiveAll(): void { this.required.clear(); }

  /**
   * `inScope` filters to tokens the current origin's consent actually covers. A category the user
   * declined is never sent to the model, so it can never be placed — requiring it would make the
   * task unwinnable through no fault of the loop.
   */
  view(inScope: (token: string) => boolean): RequirementsView {
    const required = [...this.required].filter(inScope);
    const placements: Placement[] = [];
    for (const token of required) {
      for (const eid of this.placements.get(token) ?? []) {
        placements.push({ token, eid, screenEpoch: this.epochs.get(`${token}:${eid}`) ?? -1 });
      }
    }
    return { required, placements };
  }
}
