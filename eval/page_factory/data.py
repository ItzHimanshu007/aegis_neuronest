"""
Synthetic identifier generators for page factory v2 (Stage 4).

Every value produced here is FABRICATED. No real person, account, card or document is
represented. Checksums are computed so that generated Aadhaar and card numbers are genuinely
valid — an evaluation corpus of checksum-INVALID identifiers would silently measure the
checksum layer instead of the thing under test.

These generators are written from the public format specifications, deliberately WITHOUT
reading `extension/privacy/detect/rules/*.ts`. Porting the extension's own implementations
would make the corpus agree with the detector by construction, which is exactly the bias this
stage exists to remove. `tests/test_data.py` validates the Verhoeff output against an
independently written check.
"""

from __future__ import annotations

import random

# --- Verhoeff (Aadhaar) -------------------------------------------------------------------
# Dihedral group D5 multiplication, permutation and inverse tables, per Verhoeff's 1969 scheme.
_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)
_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)


def verhoeff_check_digit(digits_without_check: str) -> int:
    """The Verhoeff check digit that makes `digits_without_check + d` validate."""
    c = 0
    for i, ch in enumerate(reversed(digits_without_check)):
        c = _D[c][_P[(i + 1) % 8][int(ch)]]
    return _INV[c]


def verhoeff_valid(digits: str) -> bool:
    c = 0
    for i, ch in enumerate(reversed(digits)):
        c = _D[c][_P[i % 8][int(ch)]]
    return c == 0


def luhn_check_digit(digits_without_check: str) -> int:
    total = 0
    for i, ch in enumerate(reversed(digits_without_check)):
        n = int(ch)
        if i % 2 == 0:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return (10 - total % 10) % 10


def luhn_valid(digits: str) -> bool:
    return luhn_check_digit(digits[:-1]) == int(digits[-1])


# --- Identifier generators ----------------------------------------------------------------
# Known issuer prefixes. Card detection requires a recognised IIN as well as a valid Luhn, so
# a Luhn-valid number under an unassigned prefix would be a false negative by design, not a
# detector failure.
_CARD_IINS = (("4", 16), ("51", 16), ("55", 16), ("60", 16), ("37", 15))
_PAN_HOLDER_TYPES = "PCHFATBLJG"
_UPI_PSPS = (
    "oksbi",
    "okhdfcbank",
    "okaxis",
    "okicici",
    "paytm",
    "ybl",
    "ibl",
    "axl",
    "apl",
)
_BANK_PREFIXES = ("HDFC", "ICIC", "SBIN", "UTIB", "KKBK", "PUNB", "BARB", "IDIB")
_STATE_CODES = ("KA", "MH", "DL", "TN", "GJ", "RJ", "UP", "WB", "KL", "TS")


def aadhaar(rng: random.Random, *, spaced: bool = True) -> str:
    """12 digits, first digit 2-9 (UIDAI never issues 0/1 leading), Verhoeff-valid."""
    body = str(rng.randint(2, 9)) + "".join(str(rng.randint(0, 9)) for _ in range(10))
    full = body + str(verhoeff_check_digit(body))
    return f"{full[0:4]} {full[4:8]} {full[8:12]}" if spaced else full


def aadhaar_near_miss(rng: random.Random) -> str:
    """Correct shape, WRONG checksum — an unlabelled negative, per the corpus labelling rule."""
    valid = aadhaar(rng, spaced=False)
    last = (int(valid[-1]) + rng.randint(1, 9)) % 10
    broken = valid[:-1] + str(last)
    return f"{broken[0:4]} {broken[4:8]} {broken[8:12]}"


def pan(rng: random.Random) -> str:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return (
        "".join(rng.choice(letters) for _ in range(3))
        + rng.choice(_PAN_HOLDER_TYPES)
        + rng.choice(letters)
        + "".join(str(rng.randint(0, 9)) for _ in range(4))
        + rng.choice(letters)
    )


def card_number(rng: random.Random, *, spaced: bool = True) -> str:
    prefix, length = rng.choice(_CARD_IINS)
    body = prefix + "".join(
        str(rng.randint(0, 9)) for _ in range(length - len(prefix) - 1)
    )
    full = body + str(luhn_check_digit(body))
    if not spaced:
        return full
    if length == 15:  # Amex groups 4-6-5
        return f"{full[0:4]} {full[4:10]} {full[10:15]}"
    return " ".join(full[i : i + 4] for i in range(0, 16, 4))


def card_near_miss(rng: random.Random) -> str:
    """Luhn-INVALID, so an unlabelled occurrence is a true negative."""
    valid = card_number(rng, spaced=False)
    last = (int(valid[-1]) + rng.randint(1, 9)) % 10
    broken = valid[:-1] + str(last)
    return " ".join(broken[i : i + 4] for i in range(0, len(broken), 4))


def ifsc(rng: random.Random) -> str:
    """4 bank letters, a literal 0, then 6 alphanumerics. No checksum exists for IFSC."""
    tail = "".join(rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(6))
    return rng.choice(_BANK_PREFIXES) + "0" + tail


def upi_id(rng: random.Random, handle: str) -> str:
    clean = "".join(c for c in handle.lower() if c.isalnum() or c in "._-") or "user"
    return f"{clean}@{rng.choice(_UPI_PSPS)}"


def phone(rng: random.Random, *, style: str = "spaced") -> str:
    digits = str(rng.randint(6, 9)) + "".join(str(rng.randint(0, 9)) for _ in range(9))
    if style == "plain":
        return digits
    if style == "plus91":
        return f"+91 {digits[:5]} {digits[5:]}"
    return f"{digits[:5]} {digits[5:]}"


def bank_account(rng: random.Random) -> str:
    return "".join(str(rng.randint(0, 9)) for _ in range(rng.choice((11, 12, 14, 16))))


def voter_id(rng: random.Random) -> str:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return "".join(rng.choice(letters) for _ in range(3)) + "".join(
        str(rng.randint(0, 9)) for _ in range(7)
    )


def passport(rng: random.Random) -> str:
    return rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") + "".join(
        str(rng.randint(0, 9)) for _ in range(7)
    )


def driving_licence(rng: random.Random) -> str:
    return (
        f"{rng.choice(_STATE_CODES)}{rng.randint(1, 99):02d} "
        f"{rng.randint(1990, 2020)}{rng.randint(0, 9999999):07d}"
    )


def abha(rng: random.Random) -> str:
    """14-digit ABHA / health account number, conventionally grouped 2-4-4-4."""
    d = "".join(str(rng.randint(0, 9)) for _ in range(14))
    return f"{d[0:2]}-{d[2:6]}-{d[6:10]}-{d[10:14]}"


def uan(rng: random.Random) -> str:
    return "".join(str(rng.randint(0, 9)) for _ in range(12))


def vehicle_reg(rng: random.Random) -> str:
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    return (
        f"{rng.choice(_STATE_CODES)}{rng.randint(1, 99):02d}"
        f"{rng.choice(letters)}{rng.choice(letters)}{rng.randint(1000, 9999)}"
    )


def pin_code(rng: random.Random) -> str:
    return str(rng.randint(110001, 855117))


def tracking_id(rng: random.Random) -> str:
    return f"{rng.choice(('AWB', 'TRK', 'SHP'))}{rng.randint(100000000, 999999999)}"


def order_id(rng: random.Random) -> str:
    return f"{rng.randint(100, 999)}-{rng.randint(1000000, 9999999)}-{rng.randint(1000000, 9999999)}"


def secret_token(rng: random.Random) -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    kind = rng.choice(("ghp", "sk", "akia"))
    if kind == "ghp":
        return "ghp_" + "".join(rng.choice(alphabet) for _ in range(36))
    if kind == "sk":
        return "sk-" + "".join(rng.choice(alphabet) for _ in range(32))
    return "AKIA" + "".join(
        rng.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567") for _ in range(16)
    )


def rupees(rng: random.Random) -> str:
    return f"₹{rng.randint(1, 99):,},{rng.randint(0, 999):03d}.{rng.randint(0, 99):02d}"


def dob(rng: random.Random, *, style: str = "slash") -> str:
    day, month, year = rng.randint(1, 28), rng.randint(1, 12), rng.randint(1955, 2004)
    if style == "dash":
        return f"{day:02d}-{month:02d}-{year}"
    if style == "long":
        months = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
        ]
        return f"{day} {months[month - 1]} {year}"
    return f"{day:02d}/{month:02d}/{year}"


def blood_group(rng: random.Random) -> str:
    return rng.choice(
        (
            "O positive",
            "A negative",
            "B positive",
            "AB positive",
            "O negative",
            "A positive",
        )
    )


# --- Negatives ----------------------------------------------------------------------------
def sku(rng: random.Random) -> str:
    return f"SKU-{rng.randint(2020, 2027)}-{rng.randint(100, 999)}"


def batch_number(rng: random.Random) -> str:
    """A long digit run that is a valid nothing, carrying no sensitive label.

    Rejection-sampled against two ACCIDENTAL collisions that would otherwise show up as unfair
    false positives and quietly depress held-out precision:

      * a 10-digit run beginning 6-9 is a well-formed Indian mobile number, and the phone rule
        is unconditional, so it would fire correctly on a string we had labelled NONE;
      * a 12-digit run beginning 2-9 that happens to satisfy Verhoeff is a well-formed Aadhaar.

    Rejecting these keeps the negatives genuine near-misses, which is what the corpus labelling
    rule in eval/README.md actually calls for. It is not a detector concession: a real page
    carrying either string really would contain a real identifier shape.
    """
    for _ in range(100):
        length = rng.choice((10, 12))
        digits = "".join(str(rng.randint(0, 9)) for _ in range(length))
        if length == 10 and digits[0] in "6789":
            continue
        if length == 12 and digits[0] in "23456789" and verhoeff_valid(digits):
            continue
        return digits
    raise RuntimeError("could not sample a non-colliding batch number")


def plain_price(rng: random.Random) -> str:
    return f"₹{rng.randint(49, 4999)}.00"


def prose_date(rng: random.Random) -> str:
    return (
        f"{rng.randint(1, 28):02d}/{rng.randint(1, 12):02d}/{rng.randint(1990, 2019)}"
    )


# --- Person and place pools ---------------------------------------------------------------
# WHY NOT FAKER. The stage brief called for "Faker's en_IN locale or equivalent". These pools
# are the equivalent, and they are used instead of Faker for two concrete reasons:
#
#   1. No new dependency. `pnpm check` runs pytest inside server/.venv. Pulling Faker in for a
#      corpus generator would add a runtime dependency to the server project purely for
#      evaluation tooling, or force the factory onto a separate PEP-723 environment that the
#      existing test runner cannot import.
#   2. Detection of NAME / ADDRESS / EMPLOYER / CITY in this cascade is label-driven, not
#      value-driven — there is no "name rule" that inspects the value. So lexical variety in
#      the values does not change what is measured; variety in the surrounding LABEL wording
#      does, and that is what wording.py varies.
#
# The pools are still wide enough that no page repeats a person, and they span several Indian
# naming traditions rather than one.
FIRST_NAMES = (
    "Asha",
    "Rohit",
    "Meera",
    "Vikram",
    "Priya",
    "Sanjay",
    "Divya",
    "Arun",
    "Kavya",
    "Neha",
    "Imran",
    "Lakshmi",
    "Joseph",
    "Ritu",
    "Manoj",
    "Farah",
    "Deepak",
    "Ananya",
    "Tarun",
    "Sneha",
    "Rahul",
    "Ishita",
    "Karan",
    "Pooja",
    "Aditya",
    "Nisha",
    "Varun",
    "Swati",
)
LAST_NAMES = (
    "Verma",
    "Nair",
    "Iyer",
    "Khanna",
    "Bose",
    "Rao",
    "Menon",
    "Gupta",
    "Shah",
    "Kulkarni",
    "Sheikh",
    "Pillai",
    "Dsouza",
    "Sinha",
    "Reddy",
    "Ansari",
    "Joshi",
    "Chatterjee",
    "Patel",
    "Bhatia",
    "Mahajan",
    "Varghese",
    "Saxena",
    "Trivedi",
    "Banerjee",
    "Mistry",
)
CITIES = (
    "Bengaluru",
    "Pune",
    "Kolkata",
    "Jaipur",
    "Kochi",
    "Chennai",
    "Indore",
    "Surat",
    "Nagpur",
    "Hyderabad",
    "Ahmedabad",
    "Lucknow",
    "Bhopal",
    "Coimbatore",
    "Visakhapatnam",
    "Guwahati",
)
STREETS = (
    "MG Road",
    "Nehru Nagar",
    "Park Street",
    "Anna Salai",
    "Lake View",
    "Hill Road",
    "Station Road",
    "Gandhi Marg",
    "Church Street",
    "Residency Road",
    "Linking Road",
    "Brigade Road",
    "Salt Lake Sector 3",
    "Jubilee Hills",
)
COMPANY_PREFIX = (
    "Acme",
    "Northwind",
    "Blue Ridge",
    "Sunrise",
    "Meridian",
    "Crestline",
    "Harbour",
    "Silverpine",
    "Everest",
    "Lotus",
)
COMPANY_SUFFIX = (
    "Industries",
    "Technologies",
    "Logistics",
    "Enterprises",
    "Solutions",
    "Textiles",
)


def person_name(rng: random.Random) -> str:
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def street_address(rng: random.Random) -> str:
    return f"{rng.randint(1, 400)}, {rng.choice(STREETS)}"


def city(rng: random.Random) -> str:
    return rng.choice(CITIES)


def employer(rng: random.Random) -> str:
    return f"{rng.choice(COMPANY_PREFIX)} {rng.choice(COMPANY_SUFFIX)} Pvt Ltd"
