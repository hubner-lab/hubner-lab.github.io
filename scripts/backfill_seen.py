#!/usr/bin/env python3
"""
Fill src/data/publications-seen.json from the git history of
src/data/publications.json.

The Scholar bot records the day it first sees a paper (scholar.py, stamp_seen).
This script gives the papers that were listed before that step existed the entry
they would have got: it replays the history of publications.json, oldest commit
first, through the same stamp_seen, with the day of each commit (UTC) as "today".

  - The papers of the first commit get no date: the list was seeded with them.
  - A commit that brings more than MAX_NEW_AT_ONCE new titles gives no dates
    either, exactly as in the bot. In this repo that is the first Scholar fetch,
    ten hours after the hand-written seed.
  - An entry that is already in the file stays as it is. So the script can be
    run again when newer commits have arrived, and it never rewrites a date.

Usage:
  python3 scripts/backfill_seen.py              # the history of HEAD, write the file
  python3 scripts/backfill_seen.py --dry-run    # report only, change nothing
  python3 scripts/backfill_seen.py --ref hubnerlab/main
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import scholar  # the sibling script: _key, stamp_seen, load_seen, dump_seen

REPO = Path(__file__).resolve().parent.parent
DATA = "src/data/publications.json"  # as git names it, whatever the platform


def replay(snapshots):
    """The first-seen map that the bot would have built, had it stamped from the
    start. `snapshots` is (day, publications) per commit, oldest first. Pure."""
    seen = {}
    for i, (day, pubs) in enumerate(snapshots):
        seen, _ = scholar.stamp_seen(seen, pubs, None if i == 0 else day)
    return seen


def merge(existing, replayed):
    """`existing` with the entries it lacks, appended in the order of `replayed`.
    An entry of `existing` is never changed. Pure."""
    out = dict(existing)
    for k, day in replayed.items():
        if k not in out:
            out[k] = day
    return out


def _git(repo, *args):
    return subprocess.run(
        ["git", *args], cwd=repo, capture_output=True, text=True, check=True
    ).stdout


def history(ref, repo=REPO):
    """(day, publications) for every commit of `ref` that changed the list,
    oldest first; the day is the commit's own (committer) day in UTC. A commit
    whose copy cannot be read, because it deleted the file or broke it, is
    skipped with a line on stderr."""
    snapshots = []
    log = _git(repo, "log", "--topo-order", "--reverse", "--format=%H %ct", ref, "--", DATA)
    for line in log.splitlines():
        sha, stamp = line.split()
        day = datetime.fromtimestamp(int(stamp), timezone.utc).date().isoformat()
        try:
            pubs = json.loads(_git(repo, "show", f"{sha}:{DATA}"))
            if not isinstance(pubs, list):
                raise ValueError("not a list")
        except (subprocess.CalledProcessError, ValueError) as e:
            print(f"  skipped {sha[:7]} of {day}: {type(e).__name__}", file=sys.stderr)
            continue
        snapshots.append((day, [p for p in pubs if isinstance(p, dict)]))
    return snapshots


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    parser.add_argument("--ref", default="HEAD", help="the commit whose history is read (default: HEAD)")
    parser.add_argument("--dry-run", action="store_true", help="report, write nothing")
    parser.add_argument("--repo", default=str(REPO), help=argparse.SUPPRESS)  # for the tests
    parser.add_argument("--file", default=None, help=argparse.SUPPRESS)  # for the tests
    args = parser.parse_args(argv)
    path = Path(args.file) if args.file else scholar.SEEN

    try:
        snapshots = history(args.ref, args.repo)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: git failed — {e.stderr.strip() or e}", file=sys.stderr)
        return 1
    if not snapshots:
        print(f"ERROR: {args.ref} has no readable commit of {DATA}", file=sys.stderr)
        return 1

    try:
        existing = scholar.load_seen(path) if path.exists() else {}
    except ValueError as e:
        print(f"ERROR: {path} is not a first-seen file ({e}); fix or delete it first", file=sys.stderr)
        return 1

    merged = merge(existing, replay(snapshots))
    added = [k for k in merged if k not in existing]
    titles = {scholar._key(p.get("title")): p.get("title") for _, pubs in snapshots for p in pubs}

    print(f"{len(snapshots)} commits of {DATA} read from {args.ref}, {snapshots[0][0]} to {snapshots[-1][0]}")
    print(f"{len(merged)} entries: {len(existing)} were in the file, {len(added)} are new")
    dated = [(day, k) for k, day in merged.items() if day]
    print(f"{len(dated)} with a date, {len(merged) - len(dated)} without")
    for day, k in sorted(dated):
        print(f"  {day}  {'+' if k in added else ' '} {titles.get(k, k)}")

    if args.dry_run:
        print("dry run: nothing written")
    elif added or not path.exists():
        scholar.dump_seen(path, merged)
        print(f"wrote {path}")
    else:
        print(f"{path} is up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
