#!/usr/bin/env python3
"""
Fetch publications for Sariel Hübner from Google Scholar and write
src/data/publications.json. Called by .github/workflows/scholar.yml daily.

On failure (reCAPTCHA / network), exits 0 and leaves existing JSON intact
so a transient block doesn't break the deploy pipeline.
"""

import json
import os
import sys
import time
import traceback
from pathlib import Path

SCHOLAR_ID = "yqB4jesAAAAJ"
OUTPUT = Path(__file__).parent.parent / "src" / "data" / "publications.json"
TIMEOUT = 30  # seconds per request


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
