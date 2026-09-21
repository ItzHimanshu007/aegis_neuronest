"""
Page templates for page factory v2 (Stage 4).

GROUND TRUTH IS DERIVED, NOT ANNOTATED. Every template builds a list of `Record`s first and
then renders HTML from those records. The page and its ground truth therefore come from one
source and cannot disagree — which is what removes the annotator bias in the authored
pii-zoo.html corpus, where a human placed each `data-gt` by hand.

Structural idioms are drawn from the five that pii-zoo.html already proves the cascade must
handle: definition list, table row-header, list item after a prose colon, labelled form input,
and a value embedded in a long paragraph. Layout, field order and section order are randomised
per page; the WORDING comes from wording.py, which is split-partitioned.
"""

from __future__ import annotations

import html
import random
from dataclasses import dataclass, field

from . import data
from .wording import phrases_for

IDIOMS = ("dl", "table", "list", "input", "prose")

# Autocomplete tokens a real portal would plausibly set. Applied to only a minority of eligible
# fields: the autocomplete layer is a separate, easier detection path, and a corpus that tagged
# every field would measure that layer instead of the label dictionary. The manifest records
# which fields got one so the report can break the numbers down both ways.
_AUTOCOMPLETE = {
    "NAME": "name",
    "EMAIL": "email",
    "PHONE": "tel",
    "ADDRESS": "street-address",
    "PIN_CODE": "postal-code",
    "CITY": "address-level2",
    "DOB": "bday",
    "CARD_NUMBER": "cc-number",
    "CVV": "cc-csc",
    "PASSWORD": "new-password",
    "OTP": "one-time-code",
}
_AUTOCOMPLETE_RATE = 0.4

_NAME_ATTRS = {
    "NAME": ("applicant_name", "holder", "cust_name", "fullname"),
    "EMAIL": ("email_id", "mail", "contact_email", "emailAddress"),
    "PHONE": ("mobile_no", "contact", "msisdn", "phone1"),
    "ADDRESS": ("addr_line", "residence", "comm_address", "address1"),
    "AADHAAR": ("uid", "aadhaar_no", "uidai", "aadhar"),
    "PAN": ("pan_no", "itpan", "pan", "taxid"),
    "CARD_NUMBER": ("card_no", "pan_card", "cardnum", "ccnum"),
    "BANK_ACCOUNT": ("acct_no", "account", "beneficiary_acct", "acno"),
    "IFSC": ("ifsc_code", "branch_ifsc", "ifsc", "rtgs"),
    "UPI_ID": ("vpa", "upi_handle", "upi", "payee_vpa"),
    "CVV": ("csc", "cvv2", "cvc", "sec_code"),
    "OTP": ("otp_input", "otpcode", "otp", "auth_code"),
    "PASSWORD": ("pwd", "passwd", "login_password", "pass"),
    "PIN_CODE": ("pincode", "postal", "zip", "pin"),
    "CITY": ("city_name", "town", "city", "district"),
    "DOB": ("dob", "birth_date", "date_of_birth", "bdate"),
}


@dataclass(frozen=True)
class Record:
    """One scorable item. `category` is a Category name, or 'NONE' for a negative."""

    category: str
    value: str
    element_id: str
    label: str | None = None
    idiom: str = "dl"
    autocomplete: str | None = None
    secret_field: bool = False


@dataclass
class Section:
    heading: str
    idiom: str
    records: list[Record] = field(default_factory=list)
    note: str | None = None


def _esc(s: str) -> str:
    return html.escape(s, quote=True)


def _label_for(rng: random.Random, category: str, split: str) -> str:
    return rng.choice(phrases_for(category, split))


def _name_attr(rng: random.Random, category: str) -> str:
    return rng.choice(_NAME_ATTRS.get(category, (category.lower(),)))


def _maybe_autocomplete(rng: random.Random, category: str) -> str | None:
    token = _AUTOCOMPLETE.get(category)
    if token and rng.random() < _AUTOCOMPLETE_RATE:
        return token
    return None


# --- renderers ----------------------------------------------------------------------------
def _render_dl(section: Section) -> str:
    rows = "\n".join(
        f"      <dt>{_esc(r.label or '')}</dt>"
        f'<dd id="{r.element_id}" data-gt="{r.category}">{_esc(r.value)}</dd>'
        for r in section.records
    )
    return f'    <dl class="kv">\n{rows}\n    </dl>'


def _render_table(section: Section) -> str:
    rows = "\n".join(
        f'        <tr><th scope="row">{_esc(r.label or "")}</th>'
        f'<td id="{r.element_id}" data-gt="{r.category}">{_esc(r.value)}</td></tr>'
        for r in section.records
    )
    return (
        '    <table class="gen-table">\n      <tbody>\n'
        f"{rows}\n      </tbody>\n    </table>"
    )


def _render_list(section: Section) -> str:
    items = []
    for r in section.records:
        prefix = f"{_esc(r.label)}: " if r.label else ""
        items.append(
            f'      <li>{prefix}<span id="{r.element_id}" '
            f'data-gt="{r.category}">{_esc(r.value)}</span></li>'
        )
    return '    <ul class="gen-list">\n' + "\n".join(items) + "\n    </ul>"


def _render_input(section: Section) -> str:
    out = []
    for r in section.records:
        ac = f' autocomplete="{r.autocomplete}"' if r.autocomplete else ""
        itype = "password" if r.category == "PASSWORD" else "text"
        out.append(
            f'      <div class="field">\n'
            f'        <label for="{r.element_id}">{_esc(r.label or "")}</label>\n'
            f'        <input id="{r.element_id}" name="{r.element_id.split("-", 1)[1]}" '
            f'type="{itype}"{ac} value="{_esc(r.value)}" data-gt="{r.category}" />\n'
            f"      </div>"
        )
    return (
        '    <form class="gen-form" onsubmit="return false">\n'
        + "\n".join(out)
        + "\n    </form>"
    )


def _render_prose(section: Section) -> str:
    """A value inside a running paragraph — exercises the text-span rect path, not a field."""
    parts = []
    for r in section.records:
        lead = f"{_esc(r.label)}: " if r.label else ""
        parts.append(
            f'{lead}<span id="{r.element_id}" data-gt="{r.category}">{_esc(r.value)}</span>'
        )
    body = ", and ".join(parts) if len(parts) > 1 else (parts[0] if parts else "")
    return (
        '    <p class="gen-prose">Thank you for your request. Our records currently show '
        f"{body}. Please contact the branch if any of these details need to be corrected "
        "before the next statement cycle.</p>"
    )


_RENDERERS = {
    "dl": _render_dl,
    "table": _render_table,
    "list": _render_list,
    "input": _render_input,
    "prose": _render_prose,
}


def render_section(section: Section) -> str:
    note = f'    <p class="hint">{_esc(section.note)}</p>\n' if section.note else ""
    return (
        f"  <section>\n    <h2>{_esc(section.heading)}</h2>\n{note}"
        f"{_RENDERERS[section.idiom](section)}\n  </section>"
    )


# --- record builders ----------------------------------------------------------------------
def _field_record(
    rng: random.Random, category: str, value: str, split: str, idiom: str, seq: int
) -> Record:
    return Record(
        category=category,
        value=value,
        element_id=f"g{seq}-{_name_attr(rng, category)}",
        label=_label_for(rng, category, split),
        idiom=idiom,
        autocomplete=_maybe_autocomplete(rng, category),
        secret_field=category in ("OTP", "CVV", "UPI_PIN", "PASSWORD", "SECRET"),
    )


class _Builder:
    """Allocates element ids and turns (category -> value) pairs into Records."""

    def __init__(self, rng: random.Random, split: str) -> None:
        self.rng = rng
        self.split = split
        self._seq = 0

    def make(self, category: str, value: str, idiom: str) -> Record:
        self._seq += 1
        return _field_record(self.rng, category, value, self.split, idiom, self._seq)

    def negative(self, value: str, idiom: str) -> Record:
        """An UNLABELLED near-miss. Per eval/README.md's rule, absence of a sensitive label is
        what makes it a negative, so these deliberately carry no label."""
        self._seq += 1
        return Record(
            category="NONE",
            value=value,
            element_id=f"g{self._seq}-item",
            label=None,
            idiom=idiom,
        )

    def section(
        self, heading: str, idiom: str, pairs: list[tuple[str, str]]
    ) -> Section:
        # A real portal never renders a CVV, OTP, password or API token as displayed text, so a
        # section holding one is always a form. Keeping this realistic matters: the harvester's
        # never-read-secret-values rule is keyed on fields, and a page that displayed them as
        # prose would exercise a path production pages do not have.
        if any(c in ("OTP", "CVV", "UPI_PIN", "PASSWORD", "SECRET") for c, _ in pairs):
            idiom = "input"
        recs = [self.make(c, v, idiom) for c, v in pairs]
        self.rng.shuffle(recs)
        return Section(heading=heading, idiom=idiom, records=recs)

    def negatives_section(self, heading: str, idiom: str, values: list[str]) -> Section:
        return Section(
            heading=heading,
            idiom=idiom,
            records=[self.negative(v, idiom) for v in values],
            note="Ordinary catalogue and reference values. No sensitive-type label appears here.",
        )


# --- the four page templates ---------------------------------------------------------------
# Each returns (title, sections, media). Section order and per-section idiom are randomised, so
# two pages from the same template differ in layout as well as in values and wording.

FACE_ASSETS = (
    "/faces/profile-photo.jpg",
    "/faces/id-card.png",
    "/faces/partial-face-small.png",
)
CONTROL_ASSET = "/faces/control-no-face.png"


@dataclass
class MediaItem:
    src: str
    element_id: str
    face_gt: str  # 'FACE' or 'NONE'
    width: int
    height: int
    alt: str


def _pick_idioms(
    rng: random.Random, n: int, pool: tuple[str, ...] = IDIOMS
) -> list[str]:
    return [rng.choice(pool) for _ in range(n)]


def kyc_registration(
    rng: random.Random, split: str
) -> tuple[str, list[Section], list[MediaItem]]:
    b = _Builder(rng, split)
    handle = f"user{rng.randint(100, 999)}"
    i = _pick_idioms(rng, 4)
    sections = [
        b.section(
            "Applicant details",
            i[0],
            [
                ("NAME", data.person_name(rng)),
                ("DOB", data.dob(rng, style=rng.choice(("slash", "dash", "long")))),
                (
                    "PHONE",
                    data.phone(rng, style=rng.choice(("spaced", "plain", "plus91"))),
                ),
                ("EMAIL", f"{handle}@example.com"),
            ],
        ),
        b.section(
            "Identity documents",
            i[1],
            [
                ("AADHAAR", data.aadhaar(rng)),
                ("PAN", data.pan(rng)),
                ("VOTER_ID", data.voter_id(rng)),
            ],
        ),
        b.section(
            "Address on record",
            i[2],
            [
                ("ADDRESS", data.street_address(rng)),
                ("CITY", data.city(rng)),
                ("PIN_CODE", data.pin_code(rng)),
            ],
        ),
        b.section(
            "Verification",
            i[3],
            [
                ("OTP", str(rng.randint(100000, 999999))),
            ],
        ),
        b.negatives_section(
            "Reference",
            "list",
            [
                data.sku(rng),
                data.batch_number(rng),
                data.aadhaar_near_miss(rng),
                data.plain_price(rng),
                f"Form was published on {data.prose_date(rng)}.",
            ],
        ),
    ]
    rng.shuffle(sections)
    media = [
        MediaItem(
            rng.choice(FACE_ASSETS),
            "m-photo",
            "FACE",
            180,
            180,
            "synthetic profile photo, AI-generated, no real person",
        ),
        MediaItem(
            CONTROL_ASSET,
            "m-control",
            "NONE",
            180,
            180,
            "synthetic control graphic with no face",
        ),
    ]
    return "Registration — verify your details", sections, media


def banking(
    rng: random.Random, split: str
) -> tuple[str, list[Section], list[MediaItem]]:
    b = _Builder(rng, split)
    i = _pick_idioms(rng, 4)
    holder = data.person_name(rng)
    sections = [
        b.section(
            "Account summary",
            i[0],
            [
                ("NAME", holder),
                ("BANK_ACCOUNT", data.bank_account(rng)),
                ("IFSC", data.ifsc(rng)),
                ("FINANCIAL_VALUE", data.rupees(rng)),
            ],
        ),
        b.section(
            "Payment instruments",
            i[1],
            [
                ("CARD_NUMBER", data.card_number(rng)),
                ("UPI_ID", data.upi_id(rng, holder.split()[0])),
            ],
        ),
        b.section(
            "Transfer to beneficiary",
            i[2],
            [
                ("BANK_ACCOUNT", data.bank_account(rng)),
                ("IFSC", data.ifsc(rng)),
                ("CVV", str(rng.randint(100, 999))),
            ],
        ),
        b.section(
            "Statement note",
            "prose",
            [
                ("EMAIL", f"stmt{rng.randint(10, 99)}@example.com"),
            ],
        ),
        b.negatives_section(
            "Recent reference numbers",
            i[3],
            [
                data.batch_number(rng),
                data.card_near_miss(rng),
                data.sku(rng),
                data.plain_price(rng),
                data.batch_number(rng),
            ],
        ),
    ]
    rng.shuffle(sections)
    return "Netbanking — account overview", sections, []


def profile_settings(
    rng: random.Random, split: str
) -> tuple[str, list[Section], list[MediaItem]]:
    b = _Builder(rng, split)
    i = _pick_idioms(rng, 4)
    sections = [
        b.section(
            "Profile",
            i[0],
            [
                ("NAME", data.person_name(rng)),
                ("EMAIL", f"p{rng.randint(1000, 9999)}@example.com"),
                ("PHONE", data.phone(rng, style=rng.choice(("spaced", "plus91")))),
                ("EMPLOYER", data.employer(rng)),
            ],
        ),
        b.section(
            "Linked identifiers",
            i[1],
            [
                ("PASSPORT", data.passport(rng)),
                ("DRIVING_LICENCE", data.driving_licence(rng)),
                ("ABHA", data.abha(rng)),
                ("UAN", data.uan(rng)),
                ("VEHICLE_REG", data.vehicle_reg(rng)),
            ],
        ),
        b.section(
            "Health record",
            i[2],
            [
                ("HEALTH", data.blood_group(rng)),
                ("DOB", data.dob(rng, style=rng.choice(("slash", "long")))),
            ],
        ),
        b.section(
            "Security",
            "input",
            [
                ("PASSWORD", "correct-horse-staple"),
                ("SECRET", data.secret_token(rng)),
            ],
        ),
        b.negatives_section(
            "Activity log",
            i[3],
            [
                f"Signed in on {data.prose_date(rng)} from a new device.",
                data.batch_number(rng),
                data.sku(rng),
                data.plain_price(rng),
            ],
        ),
    ]
    rng.shuffle(sections)
    media = [
        MediaItem(
            rng.choice(FACE_ASSETS),
            "m-avatar",
            "FACE",
            160,
            160,
            "synthetic avatar, AI-generated, no real person",
        ),
    ]
    return "Account settings — your profile", sections, media


def checkout_search(
    rng: random.Random, split: str
) -> tuple[str, list[Section], list[MediaItem]]:
    b = _Builder(rng, split)
    i = _pick_idioms(rng, 4)
    sections = [
        b.section(
            "Order",
            i[0],
            [
                ("ORDER_ID", data.order_id(rng)),
                ("TRACKING_ID", data.tracking_id(rng)),
                ("FINANCIAL_VALUE", data.rupees(rng)),
            ],
        ),
        b.section(
            "Deliver to",
            i[1],
            [
                ("NAME", data.person_name(rng)),
                ("ADDRESS", data.street_address(rng)),
                ("CITY", data.city(rng)),
                ("PIN_CODE", data.pin_code(rng)),
                ("PHONE", data.phone(rng)),
            ],
        ),
        b.section(
            "Payment",
            "input",
            [
                ("CARD_NUMBER", data.card_number(rng)),
                ("CVV", str(rng.randint(100, 999))),
            ],
        ),
        b.negatives_section(
            "Catalogue",
            i[2],
            [
                data.sku(rng),
                data.sku(rng),
                data.plain_price(rng),
                data.batch_number(rng),
                f"Dispatched on {data.prose_date(rng)}.",
                data.aadhaar_near_miss(rng),
            ],
        ),
        b.section(
            "Invoice note",
            "prose",
            [
                ("EMAIL", f"orders{rng.randint(10, 99)}@example.com"),
            ],
        ),
    ]
    rng.shuffle(sections)
    return "Checkout — order confirmation", sections, []


TEMPLATES = {
    "kyc_registration": kyc_registration,
    "banking": banking,
    "profile_settings": profile_settings,
    "checkout_search": checkout_search,
}
