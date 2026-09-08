#!/usr/bin/env python3
"""
Fetch publications for Sariel Hübner from Google Scholar and write
src/data/publications.json. Called by .github/workflows/scholar.yml daily.

On failure (reCAPTCHA / network), exits 0 and leaves existing JSON intact
so a transient block doesn't break the deploy pipeline.
"""

import difflib
import json
import os
import re
import sys
import time
import traceback
from pathlib import Path

SCHOLAR_ID = "yqB4jesAAAAJ"
OUTPUT = Path(__file__).parent.parent / "src" / "data" / "publications.json"
TIMEOUT = 30  # seconds per request


# Google Scholar returns a fair amount of noise for this profile: duplicate
# records for the same paper (one good, one with mangled authors and a dead
# link), bioRxiv entries that have since been published, and undated stubs.
PREPRINT_VENUE = re.compile(r"biorxiv|arxiv|research\s*square|preprints?\.org|ssrn", re.I)
PREPRINT_URL = re.compile(
    r"biorxiv\.org|researchsquare|europepmc\.org/article/ppr/|preprints?\.org|arxiv\.org", re.I
)
CLUSTER_URL = re.compile(r"scholar\.google\.com/scholar\?cluster=", re.I)
SUPERSEDED_RATIO = 0.60


def is_preprint(pub):
    return bool(PREPRINT_VENUE.search(pub.get("venue") or "")) or bool(
        PREPRINT_URL.search(pub.get("url") or "")
    )


def _key(title):
    return re.sub(r"[^a-z0-9]", "", (title or "").lower())


def _quality(pub):
    """Rank duplicate records of the same paper. Citations first: the canonical
    record is the one the world cites, even when Scholar left its venue blank."""
    return (
        pub.get("citations", 0),
        len((pub.get("authors") or "").split(" and ")),
        0 if CLUSTER_URL.search(pub.get("url") or "") else 1,
        1 if pub.get("venue") else 0,
    )


def clean(pubs):
    """Drop duplicate records, undated stubs, and preprints already published."""
    best = {}
    for pub in pubs:
        k = _key(pub.get("title"))
        if k not in best or _quality(pub) > _quality(best[k]):
            best[k] = pub
    deduped = list(best.values())

    dated = [p for p in deduped if p.get("year")]

    published = [p for p in dated if not is_preprint(p)]
    kept = []
    for pub in dated:
        if is_preprint(pub):
            k = _key(pub.get("title"))
            if any(
                difflib.SequenceMatcher(None, k, _key(o.get("title"))).ratio() >= SUPERSEDED_RATIO
                for o in published
            ):
                continue
        kept.append(pub)

    dropped = len(pubs) - len(kept)
    if dropped:
        print(
            f"Filtered {dropped} record(s): "
            f"{len(pubs) - len(deduped)} duplicate, "
            f"{len(deduped) - len(dated)} undated, "
            f"{len(dated) - len(kept)} superseded preprint",
            file=sys.stderr,
        )
    return kept


def annotate(level, message):
    """Emit a GitHub Actions annotation so a blocked run is visibly distinct
    from a real fetch — both exit 0, so the run status alone tells you nothing."""
    print(f"::{level}::{message}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"- **{level}** — {message}\n")


def fetch_publications():
    try:
        from scholarly import scholarly
    except ImportError as e:
        # Not necessarily "missing" — a broken transitive import inside scholarly
        # raises ImportError here too, so print what actually failed.
        print(f"ERROR: cannot import scholarly — {e!r}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)

    print(f"Fetching author {SCHOLAR_ID}…")
    author = scholarly.search_author_id(SCHOLAR_ID)
    author = scholarly.fill(author, sections=["publications"])

    pubs = []
    for pub in author.get("publications", []):
        try:
            filled = scholarly.fill(pub)
            bib = filled.get("bib", {})
            pubs.append({
                "year": int(bib.get("pub_year", 0) or 0),
                "title": bib.get("title", ""),
                "authors": bib.get("author", ""),
                "venue": bib.get("venue", bib.get("journal", bib.get("booktitle", ""))),
                "url": filled.get("pub_url", ""),
                "citations": int(filled.get("num_citations", 0) or 0),
            })
            time.sleep(1)  # polite delay
        except Exception as e:
            print(f"  WARN: skipping one pub — {e}", file=sys.stderr)
            continue

    return pubs


def main():
    if "--clean-only" in sys.argv:
        # Re-filter the committed JSON without contacting Scholar. Scholar blocks
        # most runs, so this makes filter changes applicable and reviewable offline.
        pubs = clean(json.loads(OUTPUT.read_text()))
        pubs.sort(key=lambda p: p["year"], reverse=True)
        OUTPUT.write_text(json.dumps(pubs, indent=2, ensure_ascii=False))
        print(f"Cleaned in place: {len(pubs)} publications in {OUTPUT}")
        return

    try:
        pubs = fetch_publications()
    except Exception as e:
        # Google Scholar blocks datacenter IPs and rejects roughly two runs in
        # three. Existing JSON stays valid, so this must not fail the deploy —
        # but it must not look like a successful fetch either.
        annotate("warning", f"Google Scholar fetch blocked, publications not refreshed — {e}")
        print(f"ERROR: could not fetch publications — {e}", file=sys.stderr)
        print("Leaving existing JSON intact.", file=sys.stderr)
        sys.exit(0)  # don't break the deploy

    pubs = clean(pubs)

    if not pubs:
        annotate("warning", "Google Scholar returned 0 publications, publications not refreshed")
        print("WARNING: got 0 publications, leaving existing JSON intact.", file=sys.stderr)
        sys.exit(0)

    pubs.sort(key=lambda p: p["year"], reverse=True)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(pubs, indent=2, ensure_ascii=False))
    annotate("notice", f"Fetched {len(pubs)} publications from Google Scholar")
    print(f"Wrote {len(pubs)} publications to {OUTPUT}")


if __name__ == "__main__":
    main()
