# Members sync

`scripts/members_sync.py`, run by `.github/workflows/members-sync.yml`, copies approved member cards from Firestore into the repo. The site never reads Firebase at runtime: git stays the published truth.

## What it does

1. Reads the world-readable `published` collection over the Firestore REST API (no credentials; the project id comes from `src/data/firebase-config.json`).
2. Re-validates every card against the card contract: types, limits, group enum, slug `^[a-z0-9]+(-[a-z0-9]+)*$` (at most 48 characters), `https://` website, year range. A photo must be a JPEG, square, 256-1024 px, at most 262144 bytes, and hash to its `photoRev`.
3. Writes `src/content/team/<slug>.md` and `src/assets/team/<slug>.jpg`. Unchanged cards give byte-identical files, so a quiet run commits nothing.
4. Commits to `main` as `github-actions[bot]` and calls `deploy.yml` on the new tip.

Ownership: a file with a `uid` in its front matter was written by the sync. It is rewritten when its card changes and deleted (with its photo) when the card is no longer published. A file without `uid` is hand-written and is never deleted; a published card with the same slug takes it over.

## Running it by hand

GitHub: Actions, "Sync team cards from the members portal", Run workflow. Inputs:

- `dry_run`: report what would change, write and commit nothing.
- `allow_shrink`: accept the removal of more than two cards in one run.

Locally (from the repo root):

- `python3 scripts/members_sync.py --dry-run` reports only.
- `--fixture DIR` reads saved REST responses instead of the network (`tests/sync/fixtures/`).
- `--base-url http://127.0.0.1:8080` aims it at the Firestore emulator (project id from the config file, `demo-members` locally).
- `--allow-shrink` accepts more than two removals. `--repo DIR` targets another tree (the tests use a temporary one).

Tests: `python3 -m unittest discover -s tests/sync -v`.

## Annotations

Every path ends in an annotation in the run log and the job summary.

- `notice: members portal not configured`: `src/data/firebase-config.json` does not exist. Nothing was done; exit 0. Expected until go-live.
- `notice: Fetched N published card(s): ...` or `..., no changes`: a normal run. With `Dry run` in front, nothing was written.
- `warning: Skipped card <uid>: <reason>`: that card failed validation (or shares a slug, or its photo failed). Its previous file stays; the other cards are processed. The run ends with a red `flag-skipped` job so it gets looked at.
- `error: Members sync failed: ...`: Firestore or the network failed after three tries; exit 1.
- `error: Firestore returned 0 published cards while N synced file(s) exist`: refused; exit 1.
- `error: N synced cards would be removed (limit 2)`: refused; exit 1.

## When a run is red

- **Skipped card.** Read the reason in the warning. Usual causes: a field over its limit, a photo that is not square or does not match `photoRev`, two members with one slug. The member fixes the card and an admin approves it again; the next run picks it up. Nothing needs reverting, the old file was kept.
- **Refused shrink.** Check `published` in the Firebase console. If the cards were unpublished on purpose, rerun with `allow_shrink`. If not, restore them there. Zero cards with files present means the collection was emptied or the project id is wrong; do not use `allow_shrink` to force it before looking.
- **Unreachable Firestore.** A Google outage or a wrong `projectId`. Rerun later; nothing was written. A 4xx is not retried.
- **Push rejected.** The job rebases and pushes once more. If that fails, rerun; the concurrency group `main-writer` serialises it against other bots once the Scholar job joins it.

## Scheduling

The workflow has no `schedule` yet. After the first manual run on the real project is green, add `schedule: - cron: '17 * * * *'` (hourly). The Scholar workflow and `deploy.yml` need the matching edits listed in the lane plan's Handoff section.
