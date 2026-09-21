/**
 * Plain-language labels for the side panel.
 *
 * Everything the user reads is written here; everything the machine reads (task states, plan
 * action names, history verdicts, authority levels) keeps its own vocabulary untouched. That
 * split is the point: `data-testid="task-status"` still carries the literal `TaskState` word the
 * Playwright and Selenium suites assert on, and this file supplies the sentence rendered beside
 * it. Nothing here is ever sent anywhere — it is display text only.
 *
 * Stage numbers, module names and pipeline vocabulary belong in code comments and docs/, never in
 * a string that reaches the panel.
 */
import type { TaskState } from '../../agentHost/task/state';
import type { HistoryEntry } from '../../shared/schema/payload.v2';
import type { ActionName } from '../../shared/schema/plan.v2';
import type { AuthorityLevel } from '../../authority';
import type { Category } from '../../privacy/categoryTypes';

/** What the task is doing right now, as a sentence. Keyed by the literal `TaskState`. */
export const RUN_STATUS: Record<TaskState, string> = {
  idle: 'Ready when you are',
  consenting: 'Waiting for you to choose what it may use',
  observing: 'Looking at the page',
  planning: 'Working out the next step',
  checking: 'Checking that step is safe',
  awaiting_approval: 'Waiting for your approval',
  executing: 'Doing it',
  verifying: 'Checking it worked',
  recovering: 'That did not work — trying another way',
  asking_user: 'It has a question for you',
  done: 'Finished',
  failed: 'Could not finish this task',
  stopped: 'Stopped',
};

/** Coarse tone for the status dot, so "waiting on you" reads differently from "still working". */
export function runStatusTone(state: TaskState): 'working' | 'waiting' | 'done' | 'ended' {
  if (state === 'done') return 'done';
  if (state === 'failed' || state === 'stopped') return 'ended';
  if (state === 'idle') return 'ended';
  if (['consenting', 'awaiting_approval', 'asking_user'].includes(state)) return 'waiting';
  return 'working';
}

/** One step's action, as a verb phrase. Keyed by the literal `HistoryEntry['action']`. */
export const STEP_ACTION: Record<HistoryEntry['action'], string> = {
  observe: 'Looked at the page',
  click: 'Clicked',
  type: 'Typed',
  select: 'Chose an option',
  check: 'Ticked a box',
  scroll: 'Scrolled',
  hover: 'Hovered',
  key: 'Pressed a key',
  wait: 'Waited',
  navigate: 'Opened a page',
  ask_user: 'Asked you',
  done: 'Finished',
  fail: 'Gave up',
  request_context: 'Asked to see more',
};

/** How a step ended. Keyed by the literal `HistoryEntry['verdict']`. */
export const STEP_VERDICT: Record<HistoryEntry['verdict'], string> = {
  PASS: 'Worked',
  FAIL: 'Did not work',
  REJECT: 'Blocked',
  ABORT_BATCH: 'Blocked, rest dropped',
  DROP_REMAINING: 'Rest dropped',
  USER_REQUIRED: 'Needed you',
  STOPPED: 'Stopped',
};

/** Why this particular action needs a human. Mirrors authority/index.ts's own laddering. */
export const LEVEL_REASON: Record<AuthorityLevel, string> = {
  L0: 'Aegis needs your approval before it does this.',
  L1: 'This would leave the page you are on.',
  L2: 'Aegis needs your approval before it does this.',
  L3: 'This involves one of the private values you gave it.',
  L4: 'This involves a password.',
  L5: 'This could submit the form or change something on the site.',
};

/**
 * The risk band an authority level falls in, in words.
 *
 * The badge is colour-coded L0-L2 green, L3-L4 amber, L5 red, and this is the text that rides
 * along with it — in the badge's tooltip and its accessible name — so the band is never carried by
 * colour alone. Colour and text come from the same `level`, so they cannot drift apart.
 *
 * Takes a plain string, not `AuthorityLevel`: `TimelineEntry.level` is a string (it survives a
 * round trip through the audit log, which re-validates it against /^L[0-5]$/ rather than a union),
 * and an unrecognised level falls into the same 'routine' band the CSS defaults to.
 */
export function levelBand(level: AuthorityLevel | string): string {
  if (level === 'L5') return 'needs your approval every time';
  if (level === 'L3' || level === 'L4') return 'touches a private value';
  return 'routine';
}

/** The approval dialog's question, naming both the action and the thing it targets. */
export function approvalQuestion(action: ActionName, label: string): string {
  const what = label.trim() ? `“${label.trim()}”` : 'this element';
  switch (action) {
    case 'click':
      return `Click ${what}?`;
    case 'type':
      return `Type into ${what}?`;
    case 'select':
      return `Choose an option in ${what}?`;
    case 'check':
      return `Tick ${what}?`;
    case 'key':
      return `Press a key in ${what}?`;
    case 'hover':
      return `Hover over ${what}?`;
    case 'navigate':
      return 'Open a different page?';
    case 'scroll':
      return 'Scroll the page?';
    case 'wait':
      return 'Wait a moment?';
    case 'ask_user':
      return 'Ask you a question?';
    case 'done':
      return 'Finish the task?';
    case 'fail':
      return 'Give up on this task?';
  }
}

/**
 * How a PII category is named where the panel is describing it to a person.
 *
 * Not used for the consent dialog's high-risk checkboxes: their visible text is the raw category
 * name on purpose, because that IS how a person knows these (AADHAAR, PAN, UPI ID) and because
 * the e2e suites select each checkbox by that exact accessible name.
 */
const CATEGORY_LABELS: Record<Category, string> = {
  OTP: 'One-time code',
  CVV: 'Card CVV',
  UPI_PIN: 'UPI PIN',
  SECRET: 'Secret',
  PASSWORD: 'Password',
  AADHAAR: 'Aadhaar number',
  PAN: 'PAN',
  CARD_NUMBER: 'Card number',
  BANK_ACCOUNT: 'Bank account number',
  UPI_ID: 'UPI ID',
  VOTER_ID: 'Voter ID',
  PASSPORT: 'Passport number',
  DRIVING_LICENCE: 'Driving licence',
  ABHA: 'ABHA number',
  UAN: 'UAN',
  NAME: 'Name',
  PHONE: 'Phone number',
  EMAIL: 'Email address',
  ADDRESS: 'Address',
  DOB: 'Date of birth',
  HEALTH: 'Health detail',
  VEHICLE_REG: 'Vehicle number',
  FINANCIAL_VALUE: 'Amount',
  PRIVATE_GENERIC: 'Something else private',
  FACE: 'Face',
  PHOTO: 'Photo',
  ID_DOCUMENT: 'ID document',
  CARD_IMAGE: 'Picture of a card',
  SIGNATURE: 'Signature',
  QR: 'QR code',
  UNSCANNED_MEDIA: 'Image not yet checked',
  CITY: 'City',
  PIN_CODE: 'PIN code',
  EMPLOYER: 'Employer',
  DATE: 'Date',
  ORDER_ID: 'Order number',
  IFSC: 'IFSC code',
  TRACKING_ID: 'Tracking number',
};

/** Takes a `string`, not a `Category`: the receipt's redaction manifest reads its `type` straight
 * out of the sealed JSON, so a category this build does not know about must still render. */
export function categoryLabel(category: string): string {
  const known = CATEGORY_LABELS[category as Category];
  if (known) return known;
  const words = category.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Byte counts are the panel's strongest single claim, so they are grouped for scanning rather
 * than printed as a bare run of digits. Fixed locale — this is a number, not prose. */
export function groupDigits(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * How each detection layer is named in the receipt. Keys are `DetectionSource`
 * (privacy/detect/types.ts) plus the extra `source` values the merge step can carry through.
 */
const LAYER_LABELS: Record<string, string> = {
  tag: 'Field type on the page',
  autocomplete: 'Autofill hint',
  rule: 'Pattern match',
  field_context: 'Nearby label',
  unscanned: 'Not scanned',
  vault: 'A value you gave Aegis',
  visual: 'Image scan',
  ner: 'Name spotting',
  ocr: 'Text read from the image',
  page: 'Page text',
  task: 'Your task wording',
  credential: 'Password field',
};

export function layerLabel(source: string): string {
  return LAYER_LABELS[source] ?? source.replace(/_/g, ' ');
}
