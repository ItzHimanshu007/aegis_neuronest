import type { Rule, RuleMatch } from './types';

/** Label-required throughout: these shapes also occur in product/order data.
 * A malformed labelled value is still redacted by the cascade's field-context fallback. */
function labelled(category: RuleMatch['category'], pattern: RegExp): Rule {
  return { name: category, category, requiresContext: true, find(value, ctx) {
    if (ctx.fieldCategory !== category) return [];
    // Broad formats still need a digit; plain label/prose words are not candidates.
    // Explicit labelled values (including alphabetic typos) are covered by field context.
    return [...value.matchAll(pattern)].filter(m => /\d/.test(m[0])).map(m => ({ category, confidence: 0.8, matchedText: m[0], start: m.index }));
  } };
}
// ECI Training Module for Booth Level Officers, ch.9, p.39: 3-letter FUSN + 7 digits;
// older 16/17-character formats also exist (label fallback covers these). Source link in
// docs/identifier-sources.md (ECI download API has an opaque, long URL).
export const voterIdRule = labelled('VOTER_ID', /\b[A-Z]{3}\d{7}\b/gi);
// Passport Seva's statutory form names the field but does not establish a universal lexical
// validator: https://www.passportindia.gov.in/AppOnlineProject/pdf/Passport_Rules_1980.pdf
// Deliberately broad and LABEL-REQUIRED; not a passport-validity claim.
export const passportRule = labelled('PASSPORT', /\b[A-Z0-9]{6,12}\b/gi);
// MoRTH GSR1073(E) describes a 16-character MRZ field; legacy booklets differ. Do not infer
// validity from one state/year shape: https://parivahan.gov.in/sites/default/files/NOTIFICATION%26ADVISORY/GSR%201073E.pdf
export const drivingLicenceRule = labelled('DRIVING_LICENCE', /\b[A-Z0-9][A-Z0-9 /-]{4,23}\b/gi);
// NHA: ABHA is 14 digits. https://ors.nic.in/healthid
export const abhaRule = labelled('ABHA', /\b(?:\d[ -]?){13}\d\b/g);
// EPFO FAQ Q1: UAN is 12 digits, ambiguous with Aadhaar without a label.
// https://www.epfindia.gov.in/site_docs/PDFs/Circulars/Y2020-2021/FAQUANKYC.pdf
export const uanRule = labelled('UAN', /\b(?:\d[ -]?){11}\d\b/g);
// India Post exposes consignment/ref numbers; no carrier-independent format is promised.
// https://www.indiapost.gov.in/vas/Pages/IndiaPostHome.aspx — LABEL-REQUIRED.
export const trackingIdRule = labelled('TRACKING_ID', /\b[A-Z0-9][A-Z0-9-]{2,29}\b/gi);
export const INDIAN_IDENTIFIER_RULES = [voterIdRule, passportRule, drivingLicenceRule, abhaRule, uanRule, trackingIdRule];
