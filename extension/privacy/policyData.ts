/**
 * GENERATED from docs/policy.yaml by `pnpm gen:policy`. Do not hand-edit — edit the YAML and
 * regenerate. extension/privacy/__tests__/policyData.test.ts proves this file matches the YAML.
 */

import type { Action, Category, PolicyClass } from './categoryTypes';

export const POLICY_VERSION = 2;

export const LOCKED_CLASSES: PolicyClass[] = [
    "never_automated",
    "credential",
    "high",
    "biometric",
    "documents"
  ] as PolicyClass[];

export const IDENTITY_CATEGORIES: Category[] = [
    "NAME",
    "EMAIL",
    "PHONE",
    "AADHAAR",
    "PAN",
    "CARD_NUMBER",
    "BANK_ACCOUNT",
    "UPI_ID",
    "DOB",
    "ADDRESS",
    "FACE"
  ] as Category[];

export interface PolicyClassData {
  description: string;
  categories: Category[];
  needed: Action | 'TOKEN_IF_IDENTITY_PRESENT';
  not_needed: Action | 'TOKEN_IF_IDENTITY_PRESENT';
  conditional?: { when: string; then: Action; else: Action };
}

export const POLICY_CLASSES: Record<PolicyClass, PolicyClassData> = {
  never_automated: {
    description: "One-time or transient secrets. Aegis will not type these, will not tokenize them, will not hold them in memory even briefly, and will not let them reach the server in any form. The harvester does not even read their field values (Stage 2 Part A1) - only `hasValue`.",
    categories: [
    "OTP",
    "CVV",
    "UPI_PIN",
    "SECRET"
  ] as Category[],
    needed: "USER_ENTERS" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: "FILL" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: undefined,
  },
  credential: {
    description: "Login secrets the task may genuinely need submitted. The user provides the value directly into the Aegis panel at task start (Aegis never extracts or reads a password back from the page) - it lives in memory only, is cleared when the task ends, requires the same upfront approval as `high`, and the executor will only ever fill it into an input[type=password] field on the one origin it was approved for.",
    categories: [
    "PASSWORD"
  ] as Category[],
    needed: "USER_PROVIDED_ORIGIN_BOUND" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: "FILL" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: undefined,
  },
  high: {
    description: "Strong government or financial identifiers. Usable for fraud on their own, so re-hydration requires explicit upfront approval scoped to the origin.",
    categories: [
    "AADHAAR",
    "PAN",
    "CARD_NUMBER",
    "BANK_ACCOUNT",
    "UPI_ID"
  ] as Category[],
    needed: "TOKEN_WITH_APPROVAL" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: "FILL" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: undefined,
  },
  medium: {
    description: "Ordinary personal data. Routinely required by forms, so tokenization without a separate prompt is proportionate.",
    categories: [
    "NAME",
    "PHONE",
    "EMAIL",
    "ADDRESS",
    "DOB",
    "HEALTH",
    "VEHICLE_REG",
    "FINANCIAL_VALUE",
    "PRIVATE_GENERIC"
  ] as Category[],
    needed: "TOKEN" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: "FILL" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: undefined,
  },
  biometric: {
    description: "Faces. Blur is the one place irreversible blur is correct, because a solid box over a face destroys the visual context the agent needs to understand the page.",
    categories: [
    "FACE",
    "PHOTO"
  ] as Category[],
    needed: "BLUR" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: "BLUR" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: undefined,
  },
  documents: {
    description: "Whole-document imagery, plus any media Aegis cannot yet see inside. The entire region goes, not just the text inside it, because layout and photograph are identifying on their own. UNSCANNED_MEDIA is the fail-closed default for images/canvas/video/embeds/unmapped iframes until Stage 6's vision layer can classify what is actually in them.",
    categories: [
    "ID_DOCUMENT",
    "CARD_IMAGE",
    "SIGNATURE",
    "QR",
    "UNSCANNED_MEDIA"
  ] as Category[],
    needed: "FILL_REGION" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: "FILL_REGION" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: undefined,
  },
  quasi: {
    description: "Not identifying alone, identifying in combination. Tokenized only once an identity category has been seen on this origin during this task (see identity_categories); otherwise sent as-is, because a bare city or date carries no linkage on its own.",
    categories: [
    "CITY",
    "PIN_CODE",
    "EMPLOYER",
    "DATE",
    "ORDER_ID",
    "IFSC"
  ] as Category[],
    needed: "TOKEN_IF_IDENTITY_PRESENT" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: "TOKEN_IF_IDENTITY_PRESENT" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: { when: "identity_seen_on_origin", then: "TOKEN", else: "ALLOW" },
  },
  non_pii: {
    description: "Everything else.",
    categories: [] as Category[],
    needed: "ALLOW" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    not_needed: "ALLOW" as Action | 'TOKEN_IF_IDENTITY_PRESENT',
    conditional: undefined,
  },
};

/** category -> its policy class, derived from POLICY_CLASSES at module load. A category with no
 * class (e.g. anything not listed in the YAML) is 'non_pii'. */
export const CATEGORY_TO_CLASS: Partial<Record<Category, PolicyClass>> = {
    "OTP": "never_automated",
    "CVV": "never_automated",
    "UPI_PIN": "never_automated",
    "SECRET": "never_automated",
    "PASSWORD": "credential",
    "AADHAAR": "high",
    "PAN": "high",
    "CARD_NUMBER": "high",
    "BANK_ACCOUNT": "high",
    "UPI_ID": "high",
    "NAME": "medium",
    "PHONE": "medium",
    "EMAIL": "medium",
    "ADDRESS": "medium",
    "DOB": "medium",
    "HEALTH": "medium",
    "VEHICLE_REG": "medium",
    "FINANCIAL_VALUE": "medium",
    "PRIVATE_GENERIC": "medium",
    "FACE": "biometric",
    "PHOTO": "biometric",
    "ID_DOCUMENT": "documents",
    "CARD_IMAGE": "documents",
    "SIGNATURE": "documents",
    "QR": "documents",
    "UNSCANNED_MEDIA": "documents",
    "CITY": "quasi",
    "PIN_CODE": "quasi",
    "EMPLOYER": "quasi",
    "DATE": "quasi",
    "ORDER_ID": "quasi",
    "IFSC": "quasi"
  } as Partial<Record<Category, PolicyClass>>;
