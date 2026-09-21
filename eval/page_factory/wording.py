"""
The label-phrase bank for page factory v2, and the TRAIN / HELD-OUT partition.

METHODOLOGY NOTE, which matters more than the code here:

These phrases were written from domain knowledge of real Indian bank, KYC, telecom and
e-commerce portal forms, deliberately WITHOUT first reading
`extension/privacy/detect/labels.ts`. That ordering is the point of the whole stage. Had the
bank been written with the detector's 30-entry dictionary open, the corpus would have been
either tuned to pass (picking only phrases known to be present) or tuned to fail (picking only
absent ones). Both are worthless. Written blind, the hit rate on label-dependent categories is
an honest sample of how well the dictionary covers wording it was not built against.

Some of these phrases will therefore not be recognised. That is the measurement, not a bug, and
it must not be "fixed" by adding the missed phrases to the dictionary — see docs/STAGES.md
Stage 4 and the standing rule that no detection rule is tuned in this stage.

THE SPLIT. One bank serves both splits. Each phrase is assigned by `sha256(phrase)[0] % 2`, so
train and held-out draw disjoint phrase sets from an identical distribution. Held-out is
therefore not made artificially harder by handing it a different vocabulary, and tuning against
train cannot memorise a phrase held-out will use.
"""

from __future__ import annotations

import hashlib

# Realistic portal wording, English and Hindi mixed the way Indian portals actually mix them.
PHRASES: dict[str, tuple[str, ...]] = {
    "NAME": (
        "Applicant name",
        "Name as per records",
        "Account holder name",
        "Customer name",
        "Name of the subscriber",
        "Full legal name",
        "Registered name",
        "पूरा नाम",
        "Name (as on PAN)",
        "Primary holder",
    ),
    "EMAIL": (
        "Email address",
        "Registered email ID",
        "E-mail for statements",
        "Contact email",
        "Correspondence e-mail",
        "Login email",
        "ईमेल पता",
        "Alternate email ID",
    ),
    "PHONE": (
        "Mobile number",
        "Registered mobile",
        "Contact number",
        "Primary mobile no.",
        "Telephone / mobile",
        "मोबाइल नंबर",
        "Alternate contact number",
        "Mobile (linked to bank)",
    ),
    "ADDRESS": (
        "Residential address",
        "Communication address",
        "Permanent address",
        "Address for correspondence",
        "Delivery address",
        "पता",
        "Registered address",
        "Billing address",
    ),
    "DOB": (
        "Date of birth",
        "DOB as per certificate",
        "Birth date",
        "Date of birth (DD/MM/YYYY)",
        "जन्म तिथि",
        "Applicant's date of birth",
        "D.O.B.",
        "Date of birth as on Aadhaar",
    ),
    "AADHAAR": (
        "Aadhaar number",
        "Aadhaar no. (12 digits)",
        "UID / Aadhaar",
        "Aadhaar linked to account",
        "आधार संख्या",
        "Aadhaar identification number",
        "Aadhaar (for eKYC)",
        "UIDAI number",
    ),
    "PAN": (
        "PAN",
        "PAN number",
        "Permanent Account Number",
        "PAN as per Income Tax records",
        "Income tax PAN",
        "पैन नंबर",
        "PAN card number",
        "Tax identification (PAN)",
    ),
    "CARD_NUMBER": (
        "Card number",
        "Debit card number",
        "Credit card no.",
        "16-digit card number",
        "Card number on front",
        "कार्ड नंबर",
        "Payment card number",
        "Saved card",
    ),
    "BANK_ACCOUNT": (
        "Account number",
        "Bank account no.",
        "Savings account number",
        "Beneficiary account",
        "Account number for credit",
        "खाता संख्या",
        "Operative account number",
        "A/c number",
    ),
    "IFSC": (
        "IFSC",
        "IFSC code",
        "Branch IFSC",
        "IFSC of beneficiary bank",
        "IFSC / RTGS code",
        "आईएफएससी कोड",
        "Bank IFSC code",
        "Branch code (IFSC)",
    ),
    "UPI_ID": (
        "UPI ID",
        "Virtual Payment Address",
        "UPI handle",
        "VPA for collect requests",
        "UPI address",
        "यूपीआई आईडी",
        "Registered UPI ID",
        "Pay to UPI ID",
    ),
    "VOTER_ID": (
        "Voter ID",
        "EPIC number",
        "Voter identity card no.",
        "Elector's photo ID",
        "Voter ID number",
        "मतदाता पहचान संख्या",
        "EPIC / Voter card",
        "Electoral ID",
    ),
    "PASSPORT": (
        "Passport number",
        "Passport no.",
        "Indian passport number",
        "Travel document number",
        "पासपोर्ट संख्या",
        "Passport (if available)",
        "Passport file number",
        "Passport ID",
    ),
    "DRIVING_LICENCE": (
        "Driving licence number",
        "DL number",
        "Driving license no.",
        "Licence number",
        "ड्राइविंग लाइसेंस",
        "DL / Licence ID",
        "Transport licence number",
        "Driver licence",
    ),
    "ABHA": (
        "ABHA number",
        "Health ID",
        "ABHA / Health account",
        "Ayushman Bharat Health Account",
        "ABHA address",
        "स्वास्थ्य आईडी",
        "Health account number",
        "ABHA ID",
    ),
    "UAN": (
        "UAN",
        "Universal Account Number",
        "UAN (EPFO)",
        "PF UAN number",
        "Provident fund UAN",
        "यूएएन",
        "EPFO account number",
        "UAN for withdrawal",
    ),
    "VEHICLE_REG": (
        "Vehicle registration number",
        "Registration no.",
        "Vehicle number",
        "RC number",
        "वाहन संख्या",
        "Registered vehicle no.",
        "Number plate",
        "Vehicle reg. no.",
    ),
    "PIN_CODE": (
        "PIN code",
        "Postal code",
        "PIN",
        "Area PIN code",
        "पिन कोड",
        "Delivery PIN code",
        "Zip / PIN",
        "Pincode",
    ),
    "CITY": (
        "City",
        "Town / city",
        "City of residence",
        "District / city",
        "शहर",
        "Nearest city",
        "City name",
        "Place",
    ),
    "EMPLOYER": (
        "Employer",
        "Employer name",
        "Organisation",
        "Company name",
        "Current employer",
        "नियोक्ता",
        "Name of organisation",
        "Employed at",
    ),
    "HEALTH": (
        "Blood group",
        "Blood type",
        "Medical condition",
        "Health details",
        "रक्त समूह",
        "Pre-existing condition",
        "Blood group (if known)",
        "Diagnosis",
    ),
    "FINANCIAL_VALUE": (
        "Available balance",
        "Account balance",
        "Outstanding amount",
        "Amount payable",
        "शेष राशि",
        "Total due",
        "Ledger balance",
        "Transaction amount",
    ),
    "ORDER_ID": (
        "Order ID",
        "Order number",
        "Order reference",
        "Purchase order no.",
        "ऑर्डर आईडी",
        "Booking reference",
        "Order ref.",
        "Transaction reference",
    ),
    "TRACKING_ID": (
        "Tracking ID",
        "AWB number",
        "Consignment number",
        "Shipment tracking no.",
        "ट्रैकिंग आईडी",
        "Docket number",
        "Waybill number",
        "Tracking reference",
    ),
    "CVV": (
        "CVV",
        "CVV / CVC",
        "Card verification value",
        "3-digit CVV",
        "सीवीवी",
        "Security code",
        "CVC on reverse",
        "Card security code",
    ),
    "OTP": (
        "OTP",
        "One Time Password",
        "OTP sent to mobile",
        "Verification code",
        "ओटीपी",
        "6-digit OTP",
        "One-time PIN",
        "Authentication code",
    ),
    "PASSWORD": (
        "Password",
        "Login password",
        "Account password",
        "Net banking password",
        "पासवर्ड",
        "Choose a password",
        "Sign-in password",
        "Portal password",
    ),
    "SECRET": (
        "API token",
        "Access token",
        "Secret key",
        "API key",
        "Personal access token",
        "Client secret",
        "Integration token",
        "Auth token",
    ),
}

SPLITS = ("train", "heldout")


def _bucket(phrase: str) -> int:
    return hashlib.sha256(phrase.encode("utf-8")).digest()[0] % 2


def phrases_for(category: str, split: str) -> list[str]:
    """The half of `category`'s bank belonging to `split`. Deterministic, disjoint, stable."""
    if split not in SPLITS:
        raise ValueError(f"unknown split {split!r}; expected one of {SPLITS}")
    want = 0 if split == "train" else 1
    return [p for p in PHRASES[category] if _bucket(p) == want]


def categories() -> list[str]:
    return sorted(PHRASES)
