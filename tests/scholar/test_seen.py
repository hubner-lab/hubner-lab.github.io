"""Tests for the first-seen dates: scripts/scholar.py (the stamping step) and
scripts/backfill_seen.py. Run: python3 -m unittest discover -s tests/scholar -v

No network: Scholar is never contacted (the fetch is replaced), and the history
that the backfill reads is a throw-away git repository made by the test.
"""

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import backfill_seen  # noqa: E402
import scholar  # noqa: E402

DATA = ROOT / "src" / "data" / "publications.json"
SEEN = ROOT / "src" / "data" / "publications-seen.json"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


THIS_YEAR = datetime.now(timezone.utc).year


def pub(title, year=2026, **more):
    return {"year": year, "title": title, "authors": "A One and B Two", "venue": "Journal", "url": "", "citations": 0, **more}


def pubs(*titles, year=2026):
    return [pub(t, year) for t in titles]


def quiet(fn, *args, **kwargs):
    """Run fn with stdout and stderr caught, and without a GitHub summary file.
    Returns (result, text printed)."""
    out = io.StringIO()
    env = {k: v for k, v in os.environ.items() if k != "GITHUB_STEP_SUMMARY"}
    with mock.patch.dict(os.environ, env, clear=True), contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        result = fn(*args, **kwargs)
    return result, out.getvalue()


@contextlib.contextmanager
def local_zone(tz):
    """Run a block as if the machine were in another time zone (a POSIX TZ
    string, which needs no zone files)."""
    old = os.environ.get("TZ")
    os.environ["TZ"] = tz
    time.tzset()
    try:
        yield
    finally:
        if old is None:
            del os.environ["TZ"]
        else:
            os.environ["TZ"] = old
        time.tzset()


class KeyTest(unittest.TestCase):
    def test_key_matches_the_shared_fixture(self):
        # The site computes the same key in JavaScript to find a paper's date.
        # Both sides are held to this one list.
        cases = json.loads((FIXTURES / "keys.json").read_text(encoding="utf-8"))
        self.assertGreater(len(cases), 5)
        for title, key in cases:
            self.assertEqual(scholar._key(title), key, title)


class StampTest(unittest.TestCase):
    def test_a_new_paper_gets_today_and_goes_to_the_end(self):
        seen = {"old": None, "older": "2026-05-15"}
        out, added = scholar.stamp_seen(seen, pubs("Old", "A New Paper", "Older"), "2026-11-16")
        self.assertEqual(list(out.items()), [("old", None), ("older", "2026-05-15"), ("anewpaper", "2026-11-16")])
        self.assertEqual(added, ["anewpaper"])

    def test_an_existing_entry_never_changes(self):
        seen = {"dated": "2026-05-15", "undated": None}
        out, added = scholar.stamp_seen(seen, pubs("Dated", "Undated"), "2026-11-16")
        self.assertEqual(out, seen)
        self.assertEqual(added, [])

    def test_the_input_is_not_modified(self):
        seen = {"old": None}
        scholar.stamp_seen(seen, pubs("New"), "2026-11-16")
        self.assertEqual(seen, {"old": None})

    def test_a_paper_listed_twice_or_without_a_title_adds_at_most_one_entry(self):
        out, added = scholar.stamp_seen({}, [pub("Same"), pub("SAME!"), pub(""), {"year": 2026}, pub("???")], "2026-11-16")
        self.assertEqual(out, {"same": "2026-11-16"})
        self.assertEqual(added, ["same"])

    def test_only_a_recent_paper_is_news(self):
        # in two runs: more than MAX_NEW_AT_ONCE together would be a rebuild
        out, added = scholar.stamp_seen({}, [pub("Two Years Old", 2024), pub("Last Year", 2025), pub("This Year", 2026)], "2026-11-16")
        self.assertEqual(out, {"twoyearsold": None, "lastyear": "2026-11-16", "thisyear": "2026-11-16"})
        self.assertEqual(added, ["twoyearsold", "lastyear", "thisyear"], "an older paper gets its entry too, without a date")
        out, _ = scholar.stamp_seen({}, [pub("In Press", 2027), pub("No Year", 0), pub("Odd Year", "soon"), {"title": "Year Missing"}], "2026-11-16")
        self.assertEqual(out, {"inpress": "2026-11-16", "noyear": None, "oddyear": None, "yearmissing": None})

    def test_without_a_day_nothing_is_dated(self):
        out, added = scholar.stamp_seen({}, pubs("A", "B"), None)
        self.assertEqual(out, {"a": None, "b": None})
        self.assertEqual(added, ["a", "b"])

    def test_up_to_the_limit_is_news_and_more_is_a_rebuild(self):
        limit = scholar.MAX_NEW_AT_ONCE
        at_limit = pubs(*[f"Paper {i}" for i in range(limit)])
        out, added = scholar.stamp_seen({"old": None}, at_limit, "2026-11-16")
        self.assertEqual(len(added), limit)
        self.assertTrue(all(out[k] == "2026-11-16" for k in added))

        over = pubs(*[f"Paper {i}" for i in range(limit + 1)])
        out, added = scholar.stamp_seen({"old": "2026-05-15"}, over, "2026-11-16")
        self.assertEqual(len(added), limit + 1)
        self.assertTrue(all(out[k] is None for k in added), "a rebuilt list is not news")
        self.assertEqual(out["old"], "2026-05-15")


class UpdateSeenTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.path = Path(self.dir.name) / "publications-seen.json"

    def write(self, text):
        self.path.write_text(text, encoding="utf-8")

    def test_missing_file_stamps_nothing_and_creates_nothing(self):
        n, said = quiet(scholar.update_seen, pubs("A", "B"), self.path, "2026-11-16")
        self.assertEqual(n, 0)
        self.assertFalse(self.path.exists(), "a deleted file must not come back holding today's date for every paper")
        self.assertIn("::warning::", said)
        self.assertIn("missing", said)

    def test_new_paper_is_appended_and_the_file_stays_valid(self):
        self.write('{\n  "old": null\n}\n')
        n, said = quiet(scholar.update_seen, pubs("Old", "Brand New"), self.path, "2026-11-16")
        self.assertEqual(n, 1)
        text = self.path.read_text(encoding="utf-8")
        self.assertEqual(text, '{\n  "old": null,\n  "brandnew": "2026-11-16"\n}\n')
        self.assertEqual(scholar.load_seen(self.path), {"old": None, "brandnew": "2026-11-16"})
        self.assertIn("::notice::First seen on 2026-11-16: 1 paper(s)", said)
        self.assertEqual([f.name for f in Path(self.dir.name).iterdir()], [self.path.name], "no temporary file is left")

    def test_nothing_new_leaves_the_file_untouched(self):
        self.write('{"old": null, "dated": "2026-05-15"}')  # not the script's own layout
        before = self.path.read_bytes()
        n, said = quiet(scholar.update_seen, pubs("Old", "Dated"), self.path, "2026-11-16")
        self.assertEqual(n, 0)
        self.assertEqual(self.path.read_bytes(), before, "written only on change")
        self.assertEqual(said, "")

    def test_today_is_the_utc_day_when_none_is_given(self):
        self.write("{}")
        fixed = datetime(2026, 11, 16, 23, 30, tzinfo=timezone.utc)
        with mock.patch.object(scholar, "datetime") as clock:
            clock.now.return_value = fixed
            quiet(scholar.update_seen, pubs("New"), self.path)
            clock.now.assert_called_once_with(timezone.utc)
        self.assertEqual(scholar.load_seen(self.path), {"new": "2026-11-16"})

    def test_a_flood_is_recorded_without_dates_and_said_aloud(self):
        self.write("{}")  # an emptied file: every listed paper lacks an entry
        many = pubs(*[f"Paper {i}" for i in range(60)])
        n, said = quiet(scholar.update_seen, many, self.path, "2026-11-16")
        self.assertEqual(n, 60)
        seen = scholar.load_seen(self.path)
        self.assertEqual(len(seen), 60)
        self.assertTrue(all(day is None for day in seen.values()), "sixty papers at once are not news")
        self.assertIn("::warning::60 papers", said)
        # and the next run, with one real addition, dates that one
        n, _ = quiet(scholar.update_seen, many + pubs("Really New"), self.path, "2026-11-17")
        self.assertEqual(n, 1)
        self.assertEqual(scholar.load_seen(self.path)["reallynew"], "2026-11-17")

    def test_a_broken_file_is_left_alone(self):
        for bad in ("{ not json", "[]", '{"a": "yesterday"}', '{"a": 20261116}', '{"a": "2026-5-1"}'):
            with self.subTest(bad=bad):
                self.write(bad)
                n, said = quiet(scholar.update_seen, pubs("New"), self.path, "2026-11-16")
                self.assertEqual(n, 0)
                self.assertEqual(self.path.read_text(encoding="utf-8"), bad, "a file that cannot be read is not overwritten")
                self.assertIn("::warning::first-seen dates not updated", said)

    def test_never_raises(self):
        self.write("{}")
        with mock.patch.object(scholar, "dump_seen", side_effect=OSError("disk full")):
            n, said = quiet(scholar.update_seen, pubs("New"), self.path, "2026-11-16")
        self.assertEqual(n, 0)
        self.assertIn("disk full", said)
        # not even when the warning itself cannot be written
        with mock.patch.object(scholar, "stamp_seen", side_effect=RuntimeError("boom")), \
                mock.patch.object(scholar, "annotate", side_effect=OSError("no summary file")):
            n, _ = quiet(scholar.update_seen, pubs("New"), self.path, "2026-11-16")
        self.assertEqual(n, 0)
        self.assertEqual(self.path.read_text(encoding="utf-8"), "{}")


class MainTest(unittest.TestCase):
    """scholar.main() with the fetch replaced: the list is written first, the dates after it."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.output = Path(self.dir.name) / "publications.json"
        self.seen = Path(self.dir.name) / "publications-seen.json"
        for name, value in (("OUTPUT", self.output), ("SEEN", self.seen)):
            patcher = mock.patch.object(scholar, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def run_main(self, fetched, argv=("scholar.py",)):
        with mock.patch.object(scholar, "fetch_publications", return_value=fetched), mock.patch.object(sys, "argv", list(argv)):
            return quiet(scholar.main)

    def test_a_run_writes_the_list_and_stamps_the_new_paper(self):
        self.output.write_text(json.dumps(pubs("Old One", "Old Two")), encoding="utf-8")
        self.seen.write_text('{"oldone": null, "oldtwo": null}', encoding="utf-8")
        fetched = pubs("Old One", "Old Two", "Fresh Paper", year=THIS_YEAR) + [pub("Found Late", THIS_YEAR - 9)]
        _, said = self.run_main(fetched)
        self.assertEqual([p["title"] for p in json.loads(self.output.read_text(encoding="utf-8"))],
                         ["Old One", "Old Two", "Fresh Paper", "Found Late"])
        today = datetime.now(timezone.utc).date().isoformat()
        self.assertEqual(scholar.load_seen(self.seen), {"oldone": None, "oldtwo": None, "freshpaper": today, "foundlate": None})
        self.assertIn(f"::notice::First seen on {today}: 1 paper(s)", said)
        self.assertIn("::notice::1 older paper(s) joined the list", said)

    def test_a_run_without_the_dates_file_still_writes_the_list(self):
        _, said = self.run_main(pubs("One", "Two"))
        self.assertEqual(len(json.loads(self.output.read_text(encoding="utf-8"))), 2)
        self.assertFalse(self.seen.exists())
        self.assertIn("::warning::publications-seen.json is missing", said)

    def test_a_failure_while_stamping_does_not_undo_the_list_or_fail_the_run(self):
        self.seen.write_text("{}", encoding="utf-8")
        with mock.patch.object(scholar, "stamp_seen", side_effect=RuntimeError("boom")):
            result, said = self.run_main(pubs("One", "Two"))  # must not raise or exit
        self.assertIsNone(result)
        self.assertEqual(len(json.loads(self.output.read_text(encoding="utf-8"))), 2)
        self.assertEqual(self.seen.read_text(encoding="utf-8"), "{}")
        self.assertIn("::warning::first-seen dates not updated", said)

    def test_a_blocked_fetch_touches_neither_file(self):
        self.output.write_text("[]", encoding="utf-8")
        self.seen.write_text("{}", encoding="utf-8")
        with mock.patch.object(scholar, "fetch_publications", side_effect=RuntimeError("captcha")), \
                mock.patch.object(sys, "argv", ["scholar.py"]):
            with self.assertRaises(SystemExit) as stop:
                quiet(scholar.main)
        self.assertEqual(stop.exception.code, 0)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "[]")
        self.assertEqual(self.seen.read_text(encoding="utf-8"), "{}")

    def test_clean_only_stamps_too(self):
        self.output.write_text(json.dumps(pubs("Kept", "Added By Hand")), encoding="utf-8")
        self.seen.write_text('{"kept": null}', encoding="utf-8")
        self.run_main([], argv=("scholar.py", "--clean-only"))
        self.assertEqual(list(scholar.load_seen(self.seen)), ["kept", "addedbyhand"])


class ReplayTest(unittest.TestCase):
    def test_the_first_commit_is_the_seed_and_single_additions_are_dated(self):
        seen = backfill_seen.replay([
            ("2026-04-08", pubs("A", "B")),
            ("2026-04-20", pubs("A", "B")),
            ("2026-05-15", pubs("C", "A", "B")),
            ("2026-09-06", pubs("D", "C", "A")),      # B left the list
            ("2026-10-01", pubs("D", "C", "A", "B")),  # and came back
        ])
        self.assertEqual(list(seen.items()), [("a", None), ("b", None), ("c", "2026-05-15"), ("d", "2026-09-06")])

    def test_a_commit_that_rebuilds_the_list_gives_no_dates(self):
        rebuilt = pubs(*[f"Scholar Title {i}" for i in range(scholar.MAX_NEW_AT_ONCE + 1)])
        seen = backfill_seen.replay([
            ("2026-04-08", pubs("Hand Written")),
            ("2026-04-09", rebuilt),
            ("2026-05-15", rebuilt + pubs("New")),
        ])
        self.assertEqual({k for k, day in seen.items() if day}, {"new"})
        self.assertEqual(seen["new"], "2026-05-15")
        self.assertEqual(len(seen), 1 + len(rebuilt) + 1)

    def test_a_small_seed_is_undated_as_well(self):
        self.assertEqual(backfill_seen.replay([("2026-04-08", pubs("Only"))]), {"only": None})
        self.assertEqual(backfill_seen.replay([]), {})

    def test_merge_keeps_what_the_file_has_and_appends_the_rest(self):
        existing = {"stamped": "2026-11-20", "seed": None}
        replayed = {"seed": "2026-01-01", "fromhistory": "2026-05-15", "stamped": None}
        merged = backfill_seen.merge(existing, replayed)
        self.assertEqual(list(merged.items()), [("stamped", "2026-11-20"), ("seed", None), ("fromhistory", "2026-05-15")])
        self.assertEqual(existing, {"stamped": "2026-11-20", "seed": None}, "the input is not modified")


class HistoryTest(unittest.TestCase):
    """backfill_seen against a real, throw-away git repository."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.repo = Path(self.dir.name) / "repo"
        (self.repo / "src" / "data").mkdir(parents=True)
        self.data = self.repo / "src" / "data" / "publications.json"
        self.file = Path(self.dir.name) / "publications-seen.json"
        self.git("init", "-q", "-b", "main")

    def git(self, *args, date=None):
        env = {
            "PATH": os.environ["PATH"], "HOME": self.dir.name,
            "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.org",
            "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.org",
        }
        if date:
            env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = date
        subprocess.run(["git", "-c", "commit.gpgsign=false", *args], cwd=self.repo, env=env, check=True, capture_output=True)

    def commit(self, date, content=None, message="update"):
        """Commit the list (a list of titles, raw text, or None to delete the file)."""
        if content is None:
            self.git("rm", "-q", "src/data/publications.json")
        else:
            text = content if isinstance(content, str) else json.dumps(pubs(*content))
            self.data.parent.mkdir(parents=True, exist_ok=True)  # git removes a folder it has emptied
            self.data.write_text(text, encoding="utf-8")
            self.git("add", "src/data/publications.json")
        self.git("commit", "-q", "-m", message, date=date)

    def build(self):
        seed = ["Seed One", "Seed Two", "Seed Three"]
        fetched = [f"Scholar Title {i}" for i in range(8)]
        self.commit("2026-04-09T00:24:41+03:00", seed)                          # 8 April in UTC
        self.commit("2026-04-09T07:52:20+00:00", fetched)                       # the first real fetch: a rebuild
        self.commit("2026-05-15T08:00:00+00:00", fetched + ["First New"])
        self.commit("2026-06-01T22:30:00-05:00", fetched + ["First New", "Late Evening"])  # 2 June in UTC
        self.commit("2026-07-01T08:00:00+00:00", "{ broken")
        self.commit("2026-07-02T08:00:00+00:00", None)
        self.commit("2026-07-03T08:00:00+00:00", fetched[1:] + ["First New", "Late Evening", "After The Gap"])
        (self.repo / "README.md").write_text("x", encoding="utf-8")            # a commit that is not about the list
        self.git("add", "README.md")
        self.git("commit", "-q", "-m", "docs", date="2026-08-01T08:00:00+00:00")
        return seed, fetched

    def run_backfill(self, *args):
        return quiet(backfill_seen.main, ["--repo", str(self.repo), "--file", str(self.file), *args])

    def test_history_reads_every_readable_commit_oldest_first_in_utc(self):
        self.build()
        # The days are UTC days on any machine: here on one that is nine hours ahead.
        with local_zone("AHEAD-9"):
            snapshots, said = quiet(backfill_seen.history, "HEAD", self.repo)
        self.assertEqual([day for day, _ in snapshots], ["2026-04-08", "2026-04-09", "2026-05-15", "2026-06-02", "2026-07-03"])
        self.assertEqual([len(p) for _, p in snapshots], [3, 8, 9, 10, 10])
        self.assertEqual(said.count("skipped"), 2, "the broken copy and the deleted one")

    def test_backfill_writes_dates_for_single_additions_only(self):
        seed, fetched = self.build()
        code, said = self.run_backfill()
        self.assertEqual(code, 0)
        seen = scholar.load_seen(self.file)
        self.assertEqual({k: d for k, d in seen.items() if d},
                         {"firstnew": "2026-05-15", "lateevening": "2026-06-02", "afterthegap": "2026-07-03"})
        self.assertEqual(len(seen), len(seed) + len(fetched) + 3)
        self.assertIsNone(seen["scholartitle0"], "a paper that left the list keeps its entry")
        self.assertEqual(list(seen)[:3], ["seedone", "seedtwo", "seedthree"], "in the order of first appearance")
        self.assertIn("3 with a date", said)

    def test_a_second_run_changes_nothing(self):
        self.build()
        self.run_backfill()
        before = self.file.read_bytes()
        code, said = self.run_backfill()
        self.assertEqual(code, 0)
        self.assertEqual(self.file.read_bytes(), before)
        self.assertIn("up to date", said)

    def test_entries_already_in_the_file_win_and_newer_commits_are_added(self):
        seed, fetched = self.build()
        self.file.write_text(json.dumps({"firstnew": "2026-05-20", "seedone": "2026-01-01", "stampedbythebot": "2026-07-30"}), encoding="utf-8")
        self.commit("2026-09-06T08:00:00+00:00", fetched[1:] + ["First New", "Late Evening", "After The Gap", "Newest"])
        code, _ = self.run_backfill()
        self.assertEqual(code, 0)
        seen = scholar.load_seen(self.file)
        self.assertEqual(seen["firstnew"], "2026-05-20")
        self.assertEqual(seen["seedone"], "2026-01-01")
        self.assertEqual(seen["stampedbythebot"], "2026-07-30")
        self.assertEqual(seen["newest"], "2026-09-06")
        self.assertEqual(list(seen)[:3], ["firstnew", "seedone", "stampedbythebot"], "what was there stays first")

    def test_dry_run_writes_nothing(self):
        self.build()
        code, said = self.run_backfill("--dry-run")
        self.assertEqual(code, 0)
        self.assertFalse(self.file.exists())
        self.assertIn("dry run", said)

    def test_errors_are_reported_and_nothing_is_written(self):
        code, said = self.run_backfill()                       # no commit at all
        self.assertEqual(code, 1)
        self.assertIn("ERROR", said)
        self.build()
        code, said = self.run_backfill("--ref", "no-such-branch")
        self.assertEqual(code, 1)
        self.assertFalse(self.file.exists())
        self.file.write_text("[1, 2]", encoding="utf-8")       # not a first-seen file
        code, said = self.run_backfill()
        self.assertEqual(code, 1)
        self.assertEqual(self.file.read_text(encoding="utf-8"), "[1, 2]")


class RepoDataTest(unittest.TestCase):
    """The file in the repo, against the list in the repo."""

    def test_the_file_is_a_first_seen_map(self):
        self.assertTrue(SEEN.exists(), "src/data/publications-seen.json is missing: python3 scripts/backfill_seen.py")
        seen = scholar.load_seen(SEEN)
        self.assertGreater(len(seen), 0)
        today = datetime.now(timezone.utc).date().isoformat()
        for k, day in seen.items():
            self.assertRegex(k, r"^[a-z0-9]+$")
            if day:
                self.assertLessEqual(day, today, f"{k} was first seen in the future")
        self.assertTrue(SEEN.read_text(encoding="utf-8").endswith("}\n"))

    def test_every_listed_paper_has_an_entry(self):
        # A listed paper without an entry would get the day of the next bot run
        # as its date. After new papers arrive from main: python3 scripts/backfill_seen.py
        seen = scholar.load_seen(SEEN)
        listed = json.loads(DATA.read_text(encoding="utf-8"))
        missing = [p["title"] for p in listed if scholar._key(p["title"]) not in seen]
        self.assertEqual(missing, [], "no first-seen entry; run: python3 scripts/backfill_seen.py")

    def test_dates_once_written_stay(self):
        seen = scholar.load_seen(SEEN)
        known = {
            "Ancient grains illuminate the mosaic origin of domesticated wheat": "2026-05-15",
            "Haplotype Blocks Are Associated With Rapid Local Adaptation to Environmental Shifts in Wild Barley": "2026-09-06",
            "MineGraph facilitates plastid and mitochondrial graph pangenome analysis in plants": "2026-10-25",
        }
        for title, day in known.items():
            self.assertEqual(seen.get(scholar._key(title)), day, title)
        # the papers of the seed and of the first Scholar fetch carry no date
        self.assertIsNone(seen[scholar._key("Hybridization and extinction")])
        self.assertIsNone(seen[scholar._key("Dual domestications and origin of traits in grapevine evolution")])


if __name__ == "__main__":
    unittest.main()
