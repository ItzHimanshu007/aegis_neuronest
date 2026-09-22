/**
 * Stage 7C — the deterministic evidence scorer.
 *
 * A pure function from (shape, structure, negative evidence) to DETECTED / UNCERTAIN /
 * NOT_DETECTED. No model, no learned weights, no floating-point accumulation: integer points, one
 * table, two thresholds, all readable on one screen. That is a requirement rather than a style
 * preference — a privacy decision that cannot be explained cannot be reviewed, and Stage 7H needs
 * every classification to carry its own reasoning.
 *
 * "Do NOT blindly sum arbitrary scores. Define explicit thresholds and document them." Both
 * thresholds live in shared/config.ts with their rationale; the points table is below.
 *
 * ┌ POSITIVE ─────────────────────────────────┬─────┐ ┌ NEGATIVE ───────────────────────┬─────┐
 * │ checksum_pass                             │  +5 │ │ checksum_fail_definitional      │  -4 │
 * │ self_describing_shape                     │  +5 │ │ non_pii_container               │  -3 │
 * │ structured_shape                          │  +3 │ │ non_pii_shape                   │  -3 │
 * │ inline_label_bound                        │  +3 │ │ repeated_across_page            │  -2 │
 * │ autocomplete_match                        │  +3 │ │ in_search_scope                 │  -2 │
 * │ input_semantics                           │  +2 │ │ generic_username_shape          │  -2 │
 * │ length_constraint_match                   │  +2 │ └─────────────────────────────────┴─────┘
 * │ container_label                           │  +2 │
 * │ weak_shape                                │  +1 │   score >= EVIDENCE_DETECT_MIN    (5) -> DETECTED
 * │ page_context                              │  +1 │   score >= EVIDENCE_UNCERTAIN_MIN (3) -> UNCERTAIN
 * └───────────────────────────────────────────┴─────┘   otherwise                           -> NOT_DETECTED
 *
 * WHY THESE NUMBERS. The scale is set by one rule: no single WEAK signal may ever reach UNCERTAIN
 * on its own. A bare digit run (+1) is nothing; it needs a bound label (+3) or a container plus
 * input semantics to be worth hiding. Conversely a checksum pass (+5) or a self-describing shape
 * (+5) is sufficient alone, because those two modes already measured 1.000 and 0.974 recall in
 * Stage 4 and must not be made weaker by being routed through this layer.
 *
 * Calibrated against the COMMITTED TRAIN split (demo-portal/generated/train, seeds 101-103) and
 * the Stage 7 fixtures only. The Stage 4 held-out corpus is not a development set.
 */

import { AEGIS_CONFIG } from '../../../shared/config';
import type { Category } from '../../categoryTypes';
import { negativeSignals } from './negative';
import type { Candidate, EvidenceSignal, EvidenceVerdict, ShapeStrength, Verdict } from './types';

const SHAPE_POINTS: Record<ShapeStrength, { name: 'self_describing_shape' | 'structured_shape' | 'weak_shape'; points: number }> = {
  self_describing: { name: 'self_describing_shape', points: 5 },
  structured: { name: 'structured_shape', points: 3 },
  weak: { name: 'weak_shape', points: 1 },
};

/**
 * Input types that corroborate a category. Narrow on purpose: `type=text` corroborates nothing,
 * and treating it as evidence would hand +2 to every field on every page.
 */
const INPUT_TYPE_CATEGORIES: Record<string, Category[]> = {
  email: ['EMAIL'],
  tel: ['PHONE'],
  date: ['DOB', 'DATE'],
  month: ['DOB', 'DATE'],
  number: ['BANK_ACCOUNT', 'PIN_CODE', 'OTP', 'FINANCIAL_VALUE', 'UAN'],
  password: ['PASSWORD', 'SECRET', 'OTP', 'CVV', 'UPI_PIN'],
};

function inputTypeAgrees(inputType: string | undefined, category: Category): boolean {
  if (!inputType) return false;
  return (INPUT_TYPE_CATEGORIES[inputType.toLowerCase()] ?? []).includes(category);
}

/** Converts the integer score to the 0..1 confidence the rest of the pipeline already speaks.
 * Anchored so DETECTED lands at/above IDENTITY_MIN_CONF (0.6) and UNCERTAIN lands below it —
 * which is what keeps an uncertain candidate from marking an origin identity-seen even if some
 * future caller forgets to check `certainty`. Belt and braces, on purpose. */
function confidenceFor(score: number): number {
  if (score <= 0) return 0;
  const detect = AEGIS_CONFIG.EVIDENCE_DETECT_MIN;
  if (score >= detect) return Math.min(0.95, 0.75 + 0.05 * (score - detect));
  return Math.max(0.05, Math.min(0.55, 0.15 * score));
}

export function verdictFor(score: number): Verdict {
  if (score >= AEGIS_CONFIG.EVIDENCE_DETECT_MIN) return 'DETECTED';
  if (score >= AEGIS_CONFIG.EVIDENCE_UNCERTAIN_MIN) return 'UNCERTAIN';
  return 'NOT_DETECTED';
}

/**
 * Scores one candidate. The category it returns is the SHAPE's category, except that a bound
 * label or an autocomplete token overrides it — a 12-digit run in a field labelled "UAN" is a UAN
 * and a 16-digit run labelled "Account number" is a bank account, and the shape alone cannot know
 * which. This mirrors the precedence rules/index.ts already applies ("an explicit ID label
 * outranks a competing checksum/shape"), rather than inventing a second, different precedence.
 */
export function scoreCandidate(candidate: Candidate): EvidenceVerdict {
  const { shape, context, value } = candidate;
  const signals: EvidenceSignal[] = [];

  // --- the shape itself ---------------------------------------------------------------------
  if (shape.checksum === 'pass') signals.push({ name: 'checksum_pass', points: 5 });
  const shapePoints = SHAPE_POINTS[shape.strength];
  signals.push({ name: shapePoints.name, points: shapePoints.points });

  // --- which category are we actually claiming? ----------------------------------------------
  const category: Category = context.boundLabelCategory ?? context.autocompleteCategory ?? shape.category;

  // --- structural corroboration --------------------------------------------------------------
  if (context.boundLabelCategory) signals.push({ name: 'inline_label_bound', points: 3 });
  if (context.autocompleteCategory === category) signals.push({ name: 'autocomplete_match', points: 3 });
  if (inputTypeAgrees(context.inputType, category)) signals.push({ name: 'input_semantics', points: 2 });
  if (context.lengthConstraintAgrees) signals.push({ name: 'length_constraint_match', points: 2 });
  if (context.containerCategory === category) signals.push({ name: 'container_label', points: 2 });
  if (context.identitySeenOnOrigin) signals.push({ name: 'page_context', points: 1 });

  // --- evidence against (Stage 7D) -----------------------------------------------------------
  signals.push(...negativeSignals(shape, context, value));

  const score = signals.reduce((total, signal) => total + signal.points, 0);
  return { verdict: verdictFor(score), category, score, signals, confidence: confidenceFor(score) };
}
