# Indian identifier evidence (policy v3)

Verified 2026-09-17. Format detection is not official validity verification. All six new rules
require a label because their character shapes overlap ordinary product/transaction data.
Broad alphanumeric candidates require at least one digit so plain label/prose words are not
identified as document numbers. Labelled malformed values remain positives and are redacted by field context.

| Category | Evidence and implemented scope |
| --- | --- |
| VOTER_ID | ECI's [BLO training module, chapter 9, page 39](https://www.eci.gov.in/eci-backend/public/api/download?url=LMAhAK6sOPBp%2FNFF0iRfXbEB1EVSLT41NNLRjYNJJP1KivrUxbfqkDatmHy12e%2FzVx8fLfn2ReU7TfrqYobgIvkt%2F4cwcIR1cIt8JVa3E8pV%2BmDCxcFKLzmGHz154Ntca6LxngxT72Tosws0bsKtkZ0CHdDuRQ%2BYlG%2BZVrkBig2BKLe53TXHKmos4cVe003C) describes three letters plus seven digits and legacy formats. |
| PASSPORT | [Passport Seva statutory forms](https://www.passportindia.gov.in/AppOnlineProject/pdf/Passport_Rules_1980.pdf) identify the passport-number field; a universal lexical specification was not established. Broad alphanumeric rule, label-required. |
| DRIVING_LICENCE | [MoRTH GSR1073(E)](https://parivahan.gov.in/sites/default/files/NOTIFICATION%26ADVISORY/GSR%201073E.pdf) describes a 16-character MRZ field; [Form 6](https://parivahan.gov.in/parivahan/sites/default/files/DownloadForm/form6.pdf) covers booklets. Ambiguous legacy forms use broad label-required detection. |
| ABHA | [NHA / NIC](https://ors.nic.in/healthid) defines a 14-digit number. |
| UAN | [EPFO FAQ Q1](https://www.epfindia.gov.in/site_docs/PDFs/Circulars/Y2020-2021/FAQUANKYC.pdf) defines a 12-digit number. A UAN label overrides an Aadhaar-shaped checksum-valid value. |
| TRACKING_ID | [India Post tracking](https://www.indiapost.gov.in/vas/Pages/IndiaPostHome.aspx) supports consignment/reference numbers; a carrier-independent format is ambiguous, so detection requires an AWB/consignment/tracking label. |
