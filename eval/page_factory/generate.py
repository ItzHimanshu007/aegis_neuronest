"""
Page factory v2 — generates synthetic portal pages with automatically derived ground truth.

    uv run eval/page_factory/generate.py --split train
    uv run eval/page_factory/generate.py --split heldout
    uv run eval/page_factory/generate.py --split heldout --verify-seal

Generation is deterministic in (split, template, seed), so the HELD-OUT corpus can be recreated
byte-for-byte from the committed seed without ever being committed itself. See README.md for the
split contract and why it is enforced this way.

Every value on every page is FABRICATED. No real person, account or document is represented.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
import sys
from dataclasses import asdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "eval"))

from page_factory import templates
from page_factory.templates import MediaItem, Section

SEAL_PATH = Path(__file__).resolve().parent / "heldout-seal.json"
SOURCE_FILES = ("generate.py", "templates.py", "data.py", "wording.py")
# Held-out seeds were rolled from 2001-2006 to 3001-3006 during Stage 4.
#
# The 2001-2006 corpus found two real bugs: a `seal()` leak-check false positive on locally
# generated vocabularies, and `orderIdRule` matching ordinary prose words. Fixing them meant the
# shipped code had changed *in response to* that corpus, so it was no longer held-out with respect
# to the code it would then be measuring. It was discarded and regenerated under seeds the fixed
# cascade has never been run against.
#
# Roll these again, and reseal, on any future occasion where the held-out corpus causes a change to
# detection or pipeline code. A split is only held-out until someone acts on what it says.
DEFAULT_SEEDS = {
    "train": (101, 102, 103),
    "heldout": (3001, 3002, 3003, 3004, 3005, 3006),
}
OUT_DIRS = {
    "train": REPO_ROOT / "demo-portal" / "generated" / "train",
    "heldout": REPO_ROOT / "demo-portal" / "generated" / "heldout",
}

PAGE_SHELL = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <link rel="stylesheet" href="/src/style.css" />
    <style>
      .kv {{ display: grid; grid-template-columns: 220px 1fr; gap: 6px 12px; font-size: 13px; }}
      .kv dt {{ font-weight: 600; }}
      .kv dd {{ margin: 0; }}
      .gen-list li {{ font-size: 13px; margin-bottom: 4px; }}
      .gen-prose {{ font-size: 13px; max-width: 60ch; }}
      table.gen-table {{ border-collapse: collapse; font-size: 13px; }}
      table.gen-table th, table.gen-table td {{ border: 1px solid #ccc; padding: 6px 10px;
        text-align: left; }}
      section {{ border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px;
        margin-bottom: 16px; }}
      section h2 {{ margin-top: 0; font-size: 15px; }}
      .media-row {{ display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }}
    </style>
  </head>
  <body data-generated="page-factory-v2" data-synthetic="true" data-split="{split}">
    <header>
      <p class="badge">GENERATED &mdash; SYNTHETIC DATA. Every value below is fabricated by
      eval/page_factory. No real person, account or document is represented.</p>
    </header>
    <main class="page">
      <h1>{title}</h1>
{body}
    </main>
  </body>
</html>
"""


def _rng_for(split: str, template: str, seed: int) -> random.Random:
    key = f"{split}:{template}:{seed}".encode()
    return random.Random(int.from_bytes(hashlib.sha256(key).digest()[:8], "big"))


def _render_media(media: list[MediaItem]) -> str:
    if not media:
        return ""
    items = "\n".join(
        f'      <img id="{m.element_id}" data-face-gt="{m.face_gt}" src="{m.src}" '
        f'width="{m.width}" height="{m.height}" alt="{m.alt}" />'
        for m in media
    )
    return (
        "  <section>\n    <h2>Photographs</h2>\n"
        '    <div class="media-row">\n' + items + "\n    </div>\n  </section>"
    )


def _manifest(
    page_name: str,
    template: str,
    split: str,
    seed: int,
    sections: list[Section],
    media: list[MediaItem],
) -> dict:
    """Ground truth, derived from the same records the HTML was rendered from."""
    items = []
    for section in sections:
        for r in section.records:
            items.append(
                {
                    "elementId": r.element_id,
                    "category": r.category,
                    "value": r.value,
                    "label": r.label,
                    "idiom": r.idiom,
                    "autocomplete": r.autocomplete,
                    "secretField": r.secret_field,
                    "section": section.heading,
                }
            )
    positives = [i for i in items if i["category"] != "NONE"]
    return {
        "schema": "aegis-page-factory/2",
        "page": page_name,
        "template": template,
        "split": split,
        "seed": seed,
        "synthetic": True,
        "counts": {
            "annotations": len(items),
            "positives": len(positives),
            "negatives": len(items) - len(positives),
            "faces": sum(1 for m in media if m.face_gt == "FACE"),
            "faceControls": sum(1 for m in media if m.face_gt == "NONE"),
        },
        "items": items,
        "media": [asdict(m) for m in media],
    }


def _tasks(manifest: dict, rng: random.Random) -> dict:
    """Task instructions whose outcome is known by construction.

    Impossibility is DERIVED from the page's own record list, not asserted by hand: the factory
    knows exactly which categories the page carries and how many times each appears.
    """
    items = [i for i in manifest["items"] if i["category"] != "NONE"]
    present = {i["category"] for i in items}
    counts: dict[str, int] = {}
    for i in items:
        counts[i["category"]] = counts.get(i["category"], 0) + 1

    absent = [
        c
        for c in (
            "PASSPORT",
            "VOTER_ID",
            "UAN",
            "ABHA",
            "VEHICLE_REG",
            "AADHAAR",
            "PAN",
        )
        if c not in present
    ]
    duplicated = sorted(c for c, n in counts.items() if n > 1)
    unique = sorted(c for c, n in counts.items() if n == 1 and not _is_secret(c))

    tasks: list[dict] = []

    if absent:
        cat = rng.choice(absent)
        tasks.append(
            {
                "id": f"{manifest['page']}::missing-field",
                "kind": "impossible",
                "impossibility": "missing-field",
                "instruction": f"Fill in the {_human(cat)} field on this page.",
                "reason": f"No element on this page carries category {cat}.",
                "targetCategory": cat,
            }
        )

    if unique:
        cat = rng.choice(unique)
        tasks.append(
            {
                "id": f"{manifest['page']}::never-supplied",
                "kind": "impossible",
                "impossibility": "never-supplied-value",
                "instruction": f"Update the {_human(cat)} field to the new value I gave you earlier.",
                "reason": "No value for this field was supplied in task data or present on the page.",
                "targetCategory": cat,
            }
        )

    if duplicated:
        cat = rng.choice(duplicated)
        tasks.append(
            {
                "id": f"{manifest['page']}::ambiguous",
                "kind": "impossible",
                "impossibility": "ambiguous",
                "instruction": f"Change the {_human(cat)} to the correct one.",
                "reason": (
                    f"{counts[cat]} distinct elements on this page carry category {cat}; "
                    "the instruction does not disambiguate between them."
                ),
                "targetCategory": cat,
            }
        )

    # Control set. A system that refuses everything scores a perfect false-success rate while
    # being useless, so the report needs a completion rate on genuinely possible tasks beside it.
    if unique:
        cat = rng.choice(unique)
        target = next(i for i in items if i["category"] == cat)
        tasks.append(
            {
                "id": f"{manifest['page']}::possible",
                "kind": "possible",
                "impossibility": None,
                "instruction": f"Read out the {_human(cat)} shown on this page.",
                "reason": "Exactly one element carries this category and its value is visible.",
                "targetCategory": cat,
                "targetElementId": target["elementId"],
                "expectedValue": target["value"],
            }
        )

    return {
        "schema": "aegis-page-factory-tasks/2",
        "page": manifest["page"],
        "split": manifest["split"],
        "tasks": tasks,
    }


def _is_secret(category: str) -> bool:
    return category in ("OTP", "CVV", "UPI_PIN", "PASSWORD", "SECRET")


def _human(category: str) -> str:
    return category.replace("_", " ").lower()


def build_page(template: str, split: str, seed: int) -> tuple[str, str, dict, dict]:
    rng = _rng_for(split, template, seed)
    title, sections, media = templates.TEMPLATES[template](rng, split)
    body = "\n".join(templates.render_section(s) for s in sections)
    media_html = _render_media(media)
    if media_html:
        body = f"{body}\n{media_html}"
    page_name = f"{template}-{seed}.html"
    html_text = PAGE_SHELL.format(title=title, body=body, split=split)
    manifest = _manifest(page_name, template, split, seed, sections, media)
    return page_name, html_text, manifest, _tasks(manifest, rng)


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _source_hashes() -> dict[str, str]:
    here = Path(__file__).resolve().parent
    return {
        f: _sha256_text((here / f).read_text(encoding="utf-8")) for f in SOURCE_FILES
    }


def generate(split: str, seeds: tuple[int, ...], out_dir: Path) -> dict:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    pages, hashes = [], {}
    for template in sorted(templates.TEMPLATES):
        for seed in seeds:
            name, html_text, manifest, tasks = build_page(template, split, seed)
            (out_dir / name).write_text(html_text, encoding="utf-8")
            manifest_name = name.replace(".html", ".manifest.json")
            tasks_name = name.replace(".html", ".tasks.json")
            manifest_text = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
            tasks_text = json.dumps(tasks, indent=2, ensure_ascii=False) + "\n"
            (out_dir / manifest_name).write_text(manifest_text, encoding="utf-8")
            (out_dir / tasks_name).write_text(tasks_text, encoding="utf-8")
            hashes[name] = _sha256_text(html_text)
            hashes[manifest_name] = _sha256_text(manifest_text)
            hashes[tasks_name] = _sha256_text(tasks_text)
            pages.append(
                {
                    "page": name,
                    "template": template,
                    "seed": seed,
                    "url": f"/generated/{split}/{name}",
                    "annotations": manifest["counts"]["annotations"],
                    "positives": manifest["counts"]["positives"],
                    "negatives": manifest["counts"]["negatives"],
                    "faces": manifest["counts"]["faces"],
                    "tasks": len(tasks["tasks"]),
                }
            )
    index = {
        "schema": "aegis-page-factory-index/2",
        "split": split,
        "seeds": list(seeds),
        "templates": sorted(templates.TEMPLATES),
        "pages": pages,
        "totals": {
            "pages": len(pages),
            "annotations": sum(p["annotations"] for p in pages),
            "positives": sum(p["positives"] for p in pages),
            "negatives": sum(p["negatives"] for p in pages),
            "faces": sum(p["faces"] for p in pages),
            "tasks": sum(p["tasks"] for p in pages),
        },
    }
    index_text = json.dumps(index, indent=2, ensure_ascii=False) + "\n"
    (out_dir / "index.json").write_text(index_text, encoding="utf-8")
    hashes["index.json"] = _sha256_text(index_text)
    return {
        "schema": "aegis-page-factory-seal/2",
        "split": split,
        "seeds": list(seeds),
        "sources": _source_hashes(),
        "artifacts": hashes,
        "totals": index["totals"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("train", "heldout"), required=True)
    parser.add_argument("--seeds", type=int, nargs="+", default=None)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument(
        "--write-seal",
        action="store_true",
        help="Write heldout-seal.json. Only meaningful for --split heldout.",
    )
    parser.add_argument(
        "--verify-seal",
        action="store_true",
        help="Regenerate and fail unless every hash matches the committed seal.",
    )
    args = parser.parse_args()

    seeds = tuple(args.seeds) if args.seeds else DEFAULT_SEEDS[args.split]
    out_dir = args.out or OUT_DIRS[args.split]
    seal = generate(args.split, seeds, out_dir)
    t = seal["totals"]
    print(
        f"{args.split}: {t['pages']} pages, {t['annotations']} annotations "
        f"({t['positives']} positives / {t['negatives']} negatives), "
        f"{t['faces']} faces, {t['tasks']} tasks -> {out_dir}"
    )

    if args.verify_seal:
        if not SEAL_PATH.exists():
            sys.exit(f"No seal at {SEAL_PATH}; run with --write-seal first.")
        committed = json.loads(SEAL_PATH.read_text(encoding="utf-8"))
        drift = [
            k
            for k in ("sources", "artifacts", "seeds")
            if committed.get(k) != seal.get(k)
        ]
        if drift:
            details = []
            for section in drift:
                if section == "seeds":
                    details.append(
                        f"  seeds: sealed {committed.get('seeds')} != {seal['seeds']}"
                    )
                    continue
                old, new = committed.get(section, {}), seal[section]
                for key in sorted(set(old) | set(new)):
                    if old.get(key) != new.get(key):
                        details.append(
                            f"  {section}/{key}: {old.get(key)} != {new.get(key)}"
                        )
            sys.exit("Held-out corpus does not match the seal:\n" + "\n".join(details))
        print(
            f"Seal verified: {len(seal['artifacts'])} artifacts match {SEAL_PATH.name}."
        )

    if args.write_seal:
        SEAL_PATH.write_text(
            json.dumps(seal, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"Seal written to {SEAL_PATH} ({len(seal['artifacts'])} artifacts).")


if __name__ == "__main__":
    main()
