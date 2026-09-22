/**
 * Policy engine (Stage 2 Part D). Turns a `Detection` into an `Action`, using docs/policy.yaml
 * (via the generated privacy/policyData.ts) plus per-task session state.
 *
 * Two rules here are load-bearing and deliberately not configurable:
 *   - Locked classes (never_automated, credential, high, biometric, documents) ignore
 *     `userOverrides` entirely. A user may make policy STRICTER, never looser.
 *   - Page-sourced PASSWORD/OTP/CVV/UPI_PIN values are never tokenized. Only a credential the
 *     user typed into the Aegis panel can become a PASSWORD token (privacy/vault.ts's
 *     `putCredential`) — see docs/policy.yaml's `credential` class.
 */

import { CATEGORY_TO_CLASS, IDENTITY_CATEGORIES, LOCKED_CLASSES, POLICY_CLASSES } from './policyData';
import { AEGIS_CONFIG } from '../shared/config';
import { ALL_ACTIONS, type Action, type Category, type PolicyClass } from './categoryTypes';
import type { Detection } from './detect/types';

export type Necessity = 'needed' | 'not_needed';

export interface DecideContext {
  necessity: Necessity;
  identitySeenOnOrigin: boolean;
  linkabilityActive?: boolean;
  userOverrides: Partial<Record<Category, Action>>;
}

export function classOf(category: Category): PolicyClass {
  return CATEGORY_TO_CLASS[category] ?? 'non_pii';
}

export function isLockedCategory(category: Category): boolean {
  return LOCKED_CLASSES.includes(classOf(category));
}

/** Categories whose presence on an origin marks it "identity seen" for the quasi rule. */
export function isIdentityCategory(category: Category): boolean {
  return IDENTITY_CATEGORIES.includes(category);
}

export function decide(det: Detection, ctx: DecideContext): Action {
  const category = det.category;
  const policyClass = classOf(category);
  const classData = POLICY_CLASSES[policyClass];

  /**
   * Stage 7J. An UNCERTAIN detection may never take the `needed` branch.
   *
   * The `needed` branch is what mints a token — it is how a value reaches the server in
   * re-hydratable form. A candidate the evidence layer could not confidently classify has no
   * business being tokenized under a category it is not sure of, so it is forced down the
   * `not_needed` branch, which for every PII class is FILL: a solid mask. The value is hidden and
   * the agent simply cannot use it.
   *
   * This is strictly more private than the pre-Stage-7 behaviour, where a value nothing detected
   * was sent verbatim. Uncertainty costs utility here, never privacy.
   */
  const uncertain = det.certainty === 'uncertain';
  const baseAction = ctx.necessity === 'needed' && !uncertain ? classData.needed : classData.not_needed;

  // quasi: TOKEN only once an identity item has been seen on this origin during this task.
  let resolved: Action;
  if (baseAction === 'TOKEN_IF_IDENTITY_PRESENT') {
    const conditional = classData.conditional;
    resolved = (ctx.identitySeenOnOrigin || ctx.linkabilityActive) ? (conditional?.then ?? 'TOKEN') : (conditional?.else ?? 'ALLOW');
  } else {
    resolved = baseAction;
  }

  const override = ctx.userOverrides[category];
  // An override may not loosen an uncertain detection: the user is expressing a preference about
  // a category, and this detection is not confidently in that category to begin with.
  if (override && ALL_ACTIONS.includes(override) && !isLockedCategory(category) && !uncertain) {
    return det.source === 'vault' && override === 'ALLOW' ? 'FILL' : override;
  }
  const action = det.source === 'vault' && resolved === 'ALLOW' ? 'FILL' : resolved;
  return uncertain ? clampUncertain(action) : action;
}

/**
 * Stage 7J's actual guarantee: an uncertain detection is never tokenized, whatever class it is in.
 *
 * Choosing the `not_needed` branch is not sufficient on its own, and the `quasi` class is exactly
 * why. Its two branches are the SAME (`TOKEN_IF_IDENTITY_PRESENT` for both), so a PIN_CODE or a
 * CITY still resolved to TOKEN once any identity had been seen on the origin — no matter which
 * branch it took. Half the categories Stage 7 newly reaches are quasi ones, so that would have
 * been most of the feature quietly minting tokens for values it was not sure about.
 *
 * FILL is the fail-closed answer for every one of these: the value is masked out of the image and
 * never leaves as a token.
 */
function clampUncertain(action: Action): Action {
  return action === 'TOKEN' || action === 'TOKEN_WITH_APPROVAL' || action === 'ALLOW' ? 'FILL' : action;
}

/**
 * Per-task privacy session state. Lives in the agentHost (side panel), not the background service
 * worker — a service worker can be evicted after ~30s idle, which would silently reset
 * `identitySeenOrigins` mid-task and quietly downgrade every quasi detection back to ALLOW.
 *
 * Accumulates per task AND per site, per the Stage 1 review's decision: an identity item seen on
 * screen 1 of a site still counts on screen 3 of that same site, because the server's session
 * history links those screens together anyway.
 */
export class SessionPrivacyState {
  private readonly identitySeenOrigins = new Set<string>();
  private readonly quasiByOrigin = new Map<string, Set<Category>>();

  /** Call once per capture, BEFORE deciding any detection in it. Marks the origin if any identity
   * category was detected with at least `IDENTITY_MIN_CONF` confidence. */
  observeDetections(origin: string, detections: Detection[]): void {
    for (const det of detections) {
      // Stage 7J: an uncertain detection never marks an origin identity-seen and never counts
      // toward the linkability K. Both of those make policy STRICTER elsewhere on the page, and
      // escalating the whole origin on a guess is not a privacy win — it is noise that would make
      // the linkability signal mean less.
      if (det.certainty === 'uncertain') continue;
      if (isIdentityCategory(det.category) && det.confidence >= AEGIS_CONFIG.IDENTITY_MIN_CONF) {
        this.identitySeenOrigins.add(origin);
      }
      if (classOf(det.category) === 'quasi' && det.confidence >= AEGIS_CONFIG.IDENTITY_MIN_CONF && det.fill !== 'empty') {
        const categories = this.quasiByOrigin.get(origin) ?? new Set<Category>();
        categories.add(det.category); this.quasiByOrigin.set(origin, categories);
      }
    }
  }

  hasLinkability(origin: string, threshold: number = AEGIS_CONFIG.LINKABILITY_QUASI_K): boolean {
    return (this.quasiByOrigin.get(origin)?.size ?? 0) >= threshold;
  }

  distinctQuasi(origin: string): number { return this.quasiByOrigin.get(origin)?.size ?? 0; }

  hasIdentitySeen(origin: string): boolean {
    return this.identitySeenOrigins.has(origin);
  }

  /** Cleared when the task ends (or the panel closes and the whole host context goes away). */
  clear(): void {
    this.identitySeenOrigins.clear();
    this.quasiByOrigin.clear();
  }
}

export interface NecessityInput {
  det: Detection;
  /** Normalized values the vault already holds from task/profile/credential sources. */
  vaultNormalizedValues: Set<string>;
  /** Categories the task has tokens for (so an empty field of that category is "needed"). */
  taskCategories: Set<Category>;
  /** Whether the detection's target is an editable field (input/textarea/select/contenteditable). */
  targetIsEditable: boolean;
  /** Field-context category of the target element, if it is a field. */
  targetFieldCategory?: Category;
  /** Normalizer shared with the vault, so "needed" comparisons use the same canonical form. */
  normalize: (category: Category, value: string) => string;
}

/**
 * Stage 2's necessity heuristic (Part D). Deliberately conservative: a detection is only "needed"
 * when there's concrete evidence the task wants it, otherwise it's "not_needed" — and since every
 * class's `not_needed` action is at least as strict as its `needed` one, guessing wrong here
 * fails closed (masks more, not less).
 *
 * TODO(stage-3): replace with planner-driven necessity — the plan itself will say which fields it
 * intends to fill, which is far better evidence than either of these two proxies.
 */
export function determineNecessity(input: NecessityInput): Necessity {
  const { det, vaultNormalizedValues, taskCategories, targetIsEditable, targetFieldCategory, normalize } = input;

  // (a) the detection's value is one the task/profile/credential already supplied
  if (det.rawValue) {
    const normalized = normalize(det.category, det.rawValue as unknown as string);
    if (vaultNormalizedValues.has(normalized)) return 'needed';
  }

  // (b) an editable field whose field-context category matches something the task has tokens for
  if (targetIsEditable && targetFieldCategory && taskCategories.has(targetFieldCategory)) {
    return 'needed';
  }

  return 'not_needed';
}

/** Page-sourced values for these categories are NEVER tokenized — see the module docblock. */
const NEVER_TOKENIZE_FROM_PAGE: Category[] = ['PASSWORD', 'OTP', 'CVV', 'UPI_PIN', 'SECRET'];

export function canTokenizeFromPage(category: Category): boolean {
  return !NEVER_TOKENIZE_FROM_PAGE.includes(category);
}
