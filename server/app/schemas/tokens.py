"""The single source of truth (mirrored) for the PII token pattern.

Mirrored from extension/shared/schema/tokens.ts — server/tests/test_schema_agreement.py proves the
two agree. See AGENTS.md invariant 3.

Token shape: [[PII:<TYPE>:<8 chars base32 lowercase a-z2-7>]]
"""

import re

TOKEN_PATTERN = r"\[\[PII:[A-Z_]+:[a-z2-7]{8}\]\]"
TOKEN_RE = re.compile(TOKEN_PATTERN)


def is_token(value: str) -> bool:
    return re.fullmatch(TOKEN_PATTERN, value) is not None
