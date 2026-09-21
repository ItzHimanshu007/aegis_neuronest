"""Integrity tests for page factory v2 (Stage 4).

These test the MEASUREMENT APPARATUS, not a measurement. They assert three things that the
held-out evaluation's credibility rests on:

  1. the checksums are real, verified against public test vectors;
  2. the ground truth in each manifest is derived from the same records that produced the HTML,
     so page and label cannot drift apart;
  3. the TRAIN / HELD-OUT boundary is enforced procedurally — held-out pages are reproducible
     from the committed seal and are never tracked by git.
"""

import hashlib
import json
import random
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "eval"))

from page_factory import data, generate, templates, wording  # noqa: E402

HELDOUT_DIR = ROOT / "demo-portal" / "generated" / "heldout"
TRAIN_DIR = ROOT / "demo-portal" / "generated" / "train"
SEAL = ROOT / "eval" / "page_factory" / "heldout-seal.json"


# --- 1. checksums are real ----------------------------------------------------------------
def test_verhoeff_matches_public_vectors():
    assert data.verhoeff_valid("2363")
    assert not data.verhoeff_valid("2364")
    assert data.verhoeff_check_digit("236") == 3


def test_luhn_matches_public_vectors():
    assert data.luhn_valid("4111111111111111")
    assert data.luhn_valid("5555555555554444")
    assert not data.luhn_valid("4111111111111112")


def test_generated_identifiers_validate():
    rng = random.Random(4242)
    for _ in range(500):
        assert data.verhoeff_valid(data.aadhaar(rng).replace(" ", ""))
        assert data.luhn_valid(data.card_number(rng).replace(" ", ""))


def test_near_misses_never_validate():
    """Negatives must be genuine near-misses; one that validates would be an unfair FP."""
    rng = random.Random(99)
    for _ in range(500):
        assert not data.verhoeff_valid(data.aadhaar_near_miss(rng).replace(" ", ""))
        assert not data.luhn_valid(data.card_near_miss(rng).replace(" ", ""))


def test_batch_numbers_never_collide_with_phone_or_aadhaar():
    rng = random.Random(7)
    for _ in range(2000):
        b = data.batch_number(rng)
        assert not (len(b) == 10 and b[0] in "6789"), f"{b} is a well-formed mobile number"
        assert not (len(b) == 12 and b[0] in "23456789" and data.verhoeff_valid(b))


# --- 2. the split partition ---------------------------------------------------------------
def test_wording_splits_are_disjoint_and_both_populated():
    for category in wording.categories():
        train = wording.phrases_for(category, "train")
        held = wording.phrases_for(category, "heldout")
        assert not set(train) & set(held), f"{category} leaks phrases across the split"
        assert train, f"{category} has no train phrases"
        assert held, f"{category} has no held-out phrases"


def test_wording_partition_is_stable():
    """The partition is a hash of the phrase, so it must not depend on ordering or run."""
    assert wording.phrases_for("NAME", "train") == wording.phrases_for("NAME", "train")


# --- 3. ground truth is derived, not annotated --------------------------------------------
@pytest.mark.parametrize("split_dir", [TRAIN_DIR, HELDOUT_DIR])
def test_manifest_matches_rendered_html(split_dir):
    """Every data-gt in the HTML appears in the manifest with the same category, and vice
    versa. This is what "derived, not hand-annotated" has to mean operationally."""
    if not split_dir.exists():
        pytest.skip(f"{split_dir.name} not generated; run eval/page_factory/generate.py")
    pages = sorted(split_dir.glob("*.html"))
    assert pages, f"no pages in {split_dir}"
    for page in pages:
        html_text = page.read_text(encoding="utf-8")
        manifest_path = split_dir / page.name.replace(".html", ".manifest.json")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        in_html = dict(re.findall(r'id="([^"]+)"[^>]*data-gt="([A-Z_]+)"', html_text))
        in_manifest = {i["elementId"]: i["category"] for i in manifest["items"]}
        assert in_html == in_manifest, f"{page.name}: HTML and manifest disagree"


@pytest.mark.parametrize("split_dir", [TRAIN_DIR, HELDOUT_DIR])
def test_manifest_values_appear_verbatim_in_html(split_dir):
    if not split_dir.exists():
        pytest.skip(f"{split_dir.name} not generated")
    import html as html_mod

    for manifest_path in sorted(split_dir.glob("*.manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        page_text = (split_dir / manifest["page"]).read_text(encoding="utf-8")
        for item in manifest["items"]:
            assert html_mod.escape(item["value"], quote=True) in page_text, (
                f"{manifest['page']}: manifest value for {item['elementId']} not in the page"
            )


def test_impossible_tasks_are_derivably_impossible():
    """A 'missing-field' task must name a category the page really does not carry, and an
    'ambiguous' task must name one that really appears more than once."""
    if not HELDOUT_DIR.exists():
        pytest.skip("held-out not generated")
    for tasks_path in sorted(HELDOUT_DIR.glob("*.tasks.json")):
        tasks = json.loads(tasks_path.read_text(encoding="utf-8"))
        manifest = json.loads(
            (HELDOUT_DIR / tasks_path.name.replace(".tasks.json", ".manifest.json")).read_text(
                encoding="utf-8"
            )
        )
        counts: dict[str, int] = {}
        for item in manifest["items"]:
            if item["category"] != "NONE":
                counts[item["category"]] = counts.get(item["category"], 0) + 1
        for task in tasks["tasks"]:
            cat = task["targetCategory"]
            if task["impossibility"] == "missing-field":
                assert cat not in counts, f"{task['id']} claims {cat} is absent but it is present"
            elif task["impossibility"] == "ambiguous":
                assert counts.get(cat, 0) > 1, f"{task['id']} claims {cat} is ambiguous"
            elif task["kind"] == "possible":
                assert counts.get(cat, 0) == 1, f"{task['id']} control target is not unique"


# --- 4. the held-out boundary is procedural, not a promise --------------------------------
def test_heldout_pages_are_not_tracked_by_git():
    tracked = subprocess.run(
        ["git", "ls-files", "demo-portal/generated/heldout"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    assert tracked == "", (
        "Held-out pages are tracked by git. The split is only 'unseen' while it stays out of "
        f"the repo. Tracked:\n{tracked}"
    )


def test_heldout_corpus_reproduces_the_committed_seal(tmp_path):
    """Regenerate from the committed seed and require byte-identical artifacts. This is what
    stops a held-out corpus being quietly regenerated after someone has seen the results."""
    seal = json.loads(SEAL.read_text(encoding="utf-8"))
    fresh = generate.generate("heldout", tuple(seal["seeds"]), tmp_path / "heldout")
    assert fresh["artifacts"] == seal["artifacts"], "held-out artifacts drifted from the seal"
    assert fresh["sources"] == seal["sources"], (
        "a page_factory source file changed without the seal being rewritten; the sealed corpus "
        "and the current generator no longer agree"
    )


def test_seal_covers_every_generated_artifact():
    seal = json.loads(SEAL.read_text(encoding="utf-8"))
    expected = 4 * len(seal["seeds"]) * 3 + 1  # 4 templates x seeds x (html+manifest+tasks) + index
    assert len(seal["artifacts"]) == expected
    assert set(seal["sources"]) == set(generate.SOURCE_FILES)


def test_source_hashes_in_seal_match_files_on_disk():
    seal = json.loads(SEAL.read_text(encoding="utf-8"))
    factory = ROOT / "eval" / "page_factory"
    for name, digest in seal["sources"].items():
        actual = hashlib.sha256((factory / name).read_bytes()).hexdigest()
        assert actual == digest, f"{name} changed since the seal was written"


def test_every_template_is_represented():
    seal = json.loads(SEAL.read_text(encoding="utf-8"))
    for template in templates.TEMPLATES:
        assert any(k.startswith(template) for k in seal["artifacts"]), template
