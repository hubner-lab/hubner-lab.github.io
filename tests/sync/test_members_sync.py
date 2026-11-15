"""Tests for scripts/members_sync.py. Run: python3 -m unittest discover -s tests/sync -v

Every case runs against a temporary repo tree (the two target folders plus the
config file), fed by saved REST responses built by make_fixtures.py.
"""

import contextlib
import hashlib
import http.server
import importlib.util
import io
import json
import os
import shutil
import tempfile
import threading
import unittest
import urllib.parse
from pathlib import Path
from unittest import mock

import make_fixtures as mf

ROOT = Path(__file__).resolve().parents[2]
spec_ = importlib.util.spec_from_file_location("members_sync", ROOT / "scripts" / "members_sync.py")
ms = importlib.util.module_from_spec(spec_)
spec_.loader.exec_module(ms)
ms.RETRY_DELAY = 0

HAND_WRITTEN = "---\nname: Legacy Member\nrole: Lab Manager\norder: 9\nalumni: false\n---\nA hand-written bio.\n"
JANE_MD = (
    '---\n'
    'name: "Jane Doe"\n'
    'role: "PhD Student"\n'
    'group: "phd"\n'
    'alumni: false\n'
    'bio: "Studies wild barley."\n'
    'interests: ["wild barley", "local adaptation"]\n'
    'email: "jane@example.org"\n'
    'orcid: "0000-0001-2345-6789"\n'
    'scholar: "AbCdEfGhIjKl"\n'
    'github: "janedoe"\n'
    'website: "https://example.org/jane"\n'
    'linkedin: "jane-doe"\n'
    'yearJoined: 2023\n'
    'photo: "../../assets/team/jane-doe.jpg"\n'
    'order: 3\n'
    'uid: "uidJane0000000000000000001"\n'
    'rev: "{rev}"\n'
    '---\n'
)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        (self.repo / "src" / "data").mkdir(parents=True)
        (self.repo / "src" / "data" / "firebase-config.json").write_text('{"projectId": "demo-members"}\n')
        self.team = self.repo / "src" / "content" / "team"
        self.team.mkdir(parents=True)
        (self.team / "legacy-member.md").write_text(HAND_WRITTEN, encoding="utf-8")
        self.assets = self.repo / "src" / "assets" / "team"  # absent until the first photo
        self.fix = self.root / "fixture"
        self.specs = mf.base_specs()
        self.build()
        self.out_file = self.root / "github_output"
        env = {"GITHUB_OUTPUT": str(self.out_file)}
        patcher = mock.patch.dict(os.environ, env)
        patcher.start()
        self.addCleanup(patcher.stop)
        os.environ.pop("GITHUB_STEP_SUMMARY", None)

    def build(self, specs=None, pages=None):
        mf.build(self.fix, self.specs if specs is None else specs, pages)

    def sync(self, *args, fixture=True):
        argv = ["--repo", str(self.repo)]
        if fixture:
            argv += ["--fixture", str(self.fix)]
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = ms.main(argv + list(args))
        return code, buf.getvalue()

    def snapshot(self):
        snap = {}
        for folder in (self.team, self.assets):
            if folder.is_dir():
                for p in sorted(folder.iterdir()):
                    snap[str(p.relative_to(self.repo))] = p.read_bytes()
        return snap

    def skipped(self):
        for line in self.out_file.read_text().splitlines()[::-1]:
            if line.startswith("skipped="):
                return int(line.split("=")[1])
        self.fail("no skipped= line in GITHUB_OUTPUT")

    def spec_for(self, slug):
        return next(s for s in self.specs if s["fields"]["slug"] == slug)


class TestRun(Base):
    def test_pagination_first_run_and_idempotence(self):
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        snap = self.snapshot()
        self.assertEqual(
            sorted(snap),
            [
                "src/assets/team/ana-lopez.jpg",
                "src/assets/team/jane-doe.jpg",
                "src/content/team/ana-lopez.md",
                "src/content/team/jane-doe.md",
                "src/content/team/john-roe.md",
                "src/content/team/kim-park.md",
                "src/content/team/legacy-member.md",
            ],
        )
        rev = self.spec_for("jane-doe")["fields"]["rev"]
        self.assertEqual(snap["src/content/team/jane-doe.md"].decode(), JANE_MD.format(rev=rev))
        self.assertEqual(snap["src/assets/team/jane-doe.jpg"], self.spec_for("jane-doe")["photo_bytes"])
        self.assertIn("4 added", out)
        self.assertEqual(self.skipped(), 0)

        # alumni card: no photo key, alumni true, years and position kept, empty keys left out
        john = snap["src/content/team/john-roe.md"].decode()
        self.assertIn("alumni: true\n", john)
        self.assertIn('currentPosition: "Analyst, Example Ltd"\n', john)
        self.assertNotIn("photo:", john)
        self.assertNotIn("email:", john)
        self.assertNotIn("order:", john)
        # interests are trimmed and empty items dropped
        self.assertIn('interests: ["soil", "microbes"]\n', snap["src/content/team/kim-park.md"].decode())
        # non-ASCII survives as UTF-8
        self.assertIn('name: "Ana López"', snap["src/content/team/ana-lopez.md"].decode())

        code, out = self.sync()
        self.assertEqual(code, 0)
        self.assertEqual(self.snapshot(), snap)
        self.assertIn("no changes", out)

    def test_changed_card_rewrites_only_its_file(self):
        self.sync()
        before = self.snapshot()
        kim = self.spec_for("kim-park")
        kim["fields"]["role"] = "PhD Student"
        kim["fields"]["group"] = "phd"
        kim["fields"]["rev"] = "0123456789abcdef"
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        after = self.snapshot()
        changed = {k for k in after if before.get(k) != after[k]}
        self.assertEqual(changed, {"src/content/team/kim-park.md"})
        self.assertIn('role: "PhD Student"', after["src/content/team/kim-park.md"].decode())
        self.assertIn("1 updated", out)

    def test_unpublished_card_removes_file_and_photo(self):
        self.sync()
        self.specs = [s for s in self.specs if s["fields"]["slug"] != "ana-lopez"]
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        snap = self.snapshot()
        self.assertNotIn("src/content/team/ana-lopez.md", snap)
        self.assertNotIn("src/assets/team/ana-lopez.jpg", snap)
        self.assertIn("src/assets/team/jane-doe.jpg", snap)
        self.assertIn("src/content/team/legacy-member.md", snap)
        self.assertIn("1 removed", out)

    def test_photo_not_refetched_when_hash_matches(self):
        self.sync()
        for p in self.fix.glob("published_photos.*.json"):
            p.unlink()  # a fetch now would fail the run
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), 0)

    def test_changed_photo_is_replaced_and_dropped_photo_deleted(self):
        self.sync()
        jane = self.spec_for("jane-doe")
        new = mf.jpeg(640, seed=999)
        jane["photo_bytes"] = new
        jane["fields"]["photoRev"] = hashlib.sha256(new).hexdigest()[:16]
        ana = self.spec_for("ana-lopez")
        ana["photo_bytes"] = None
        ana["fields"]["photoRev"] = ""
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        snap = self.snapshot()
        self.assertEqual(snap["src/assets/team/jane-doe.jpg"], new)
        self.assertNotIn("src/assets/team/ana-lopez.jpg", snap)
        self.assertNotIn("photo:", snap["src/content/team/ana-lopez.md"].decode())

    def test_renamed_slug_moves_the_files(self):
        self.sync()
        self.spec_for("jane-doe")["fields"]["slug"] = "jane-roe"
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        snap = self.snapshot()
        self.assertNotIn("src/content/team/jane-doe.md", snap)
        self.assertNotIn("src/assets/team/jane-doe.jpg", snap)
        self.assertIn('photo: "../../assets/team/jane-roe.jpg"', snap["src/content/team/jane-roe.md"].decode())
        self.assertIn("src/assets/team/jane-roe.jpg", snap)

    def test_dry_run_writes_nothing(self):
        before = self.snapshot()
        code, out = self.sync("--dry-run")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(self.assets.exists())
        self.assertIn("would write src/content/team/jane-doe.md", out)
        self.assertIn("Dry run", out)

    def test_dry_run_reports_removals_and_still_deletes_nothing(self):
        self.sync()
        before = self.snapshot()
        self.specs = self.specs[:3]
        self.build()
        code, out = self.sync("--dry-run")
        self.assertEqual(code, 0)
        self.assertEqual(self.snapshot(), before)
        self.assertIn("would delete src/content/team/kim-park.md", out)


class TestGuards(Base):
    def test_missing_config_exits_zero_with_notice(self):
        (self.repo / "src" / "data" / "firebase-config.json").unlink()
        before = self.snapshot()
        code, out = self.sync()
        self.assertEqual(code, 0)
        self.assertIn("::notice::members portal not configured", out)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.skipped(), 0)

    def test_bad_config_fails(self):
        (self.repo / "src" / "data" / "firebase-config.json").write_text('{"projectId": "../x"}')
        code, out = self.sync()
        self.assertEqual(code, 1)
        self.assertIn("::error::", out)

    def test_zero_documents_refused_while_synced_files_exist(self):
        self.sync()
        before = self.snapshot()
        self.build(specs=[], pages=[[]])
        code, out = self.sync()
        self.assertEqual(code, 1)
        self.assertIn("::error::", out)
        self.assertEqual(self.snapshot(), before)

    def test_zero_documents_fine_without_synced_files(self):
        self.build(specs=[], pages=[[]])
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(sorted(self.snapshot()), ["src/content/team/legacy-member.md"])

    def test_more_than_two_removals_refused_without_allow_shrink(self):
        self.sync()
        before = self.snapshot()
        self.specs = self.specs[:1]  # three of four synced cards unpublished
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 1)
        self.assertIn("--allow-shrink", out)
        self.assertEqual(self.snapshot(), before)
        # --dry-run is refused the same way, it is a guard, not a write
        code, _ = self.sync("--dry-run")
        self.assertEqual(code, 1)

        code, out = self.sync("--allow-shrink")
        self.assertEqual(code, 0, out)
        self.assertEqual(
            sorted(self.snapshot()),
            ["src/assets/team/jane-doe.jpg", "src/content/team/jane-doe.md", "src/content/team/legacy-member.md"],
        )

    def test_two_removals_allowed(self):
        self.sync()
        self.specs = self.specs[:2]
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)

    def test_http_pagination_and_photo_urls(self):
        fix, hits = self.fix, []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                hits.append(self.path)
                url = urllib.parse.urlparse(self.path)
                prefix = "/v1/projects/demo-members/databases/(default)/documents/"
                q = urllib.parse.parse_qs(url.query)
                if not url.path.startswith(prefix):
                    code, body = 404, b"{}"
                elif url.path == prefix + "published":
                    token = q.get("pageToken", [None])[0]
                    name = "published.json" if token is None else f"published.{token}.json"
                    code, body = 200, (fix / name).read_bytes()
                else:
                    f = fix / ("published_photos." + url.path[len(prefix + "published_photos/"):] + ".json")
                    code, body = (200, f.read_bytes()) if f.is_file() else (404, b"{}")
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        code, out = self.sync("--base-url", f"http://127.0.0.1:{server.server_port}", fixture=False)
        self.assertEqual(code, 0, out)
        self.assertIn("4 added", out)
        listed = [h for h in hits if "/documents/published?" in h]
        self.assertEqual(len(listed), 2)
        self.assertIn("pageSize=300", listed[0])
        self.assertIn("pageToken=page2", listed[1])
        self.assertEqual(len([h for h in hits if "published_photos" in h]), 2)

    def test_unreachable_firestore_exits_one_and_retries_three_times(self):
        hits = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                hits.append(self.path)
                self.send_response(500)
                self.end_headers()

            def log_message(self, *a):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        before = self.snapshot()
        code, out = self.sync("--base-url", f"http://127.0.0.1:{server.server_port}", fixture=False)
        self.assertEqual(code, 1)
        self.assertEqual(len(hits), 3)
        self.assertIn("::error::", out)
        self.assertEqual(self.snapshot(), before)


class TestSkips(Base):
    def assertOthersWritten(self, snap, slugs=("jane-doe", "john-roe", "ana-lopez", "kim-park")):
        for slug in slugs:
            self.assertIn(f"src/content/team/{slug}.md", snap)

    def test_unsafe_slugs_are_skipped_and_never_written(self):
        self.specs += [
            mf.spec("uidEvil0000000000000000005", "../evil", "Evil", "Role", "phd"),
            mf.spec("uidEvil0000000000000000006", "a/b", "Evil", "Role", "phd"),
            mf.spec("uidEvil0000000000000000007", "A-b", "Evil", "Role", "phd"),
            mf.spec("uidEvil0000000000000000008", "x" * 49, "Evil", "Role", "phd"),
            mf.spec("uidEvil0000000000000000009", "-bad", "Evil", "Role", "phd"),
        ]
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), 5)
        self.assertEqual(out.count("::warning::"), 5)
        snap = self.snapshot()
        self.assertOthersWritten(snap)
        self.assertEqual(len(snap), 7)
        # nothing escaped the two target folders
        everything = {p.relative_to(self.root).as_posix() for p in self.root.rglob("*") if p.is_file()}
        self.assertFalse([p for p in everything if "evil" in p])
        self.assertFalse((self.repo / "src" / "content" / "evil.md").exists())

    def test_two_cards_with_one_slug_are_both_skipped_and_previous_file_kept(self):
        self.sync()
        before = self.snapshot()
        self.specs.append(mf.spec("uidDupe0000000000000000010", "jane-doe", "Jane Two", "Intern", "undergrad"))
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), 2)
        self.assertEqual(self.snapshot(), before)  # jane-doe.md kept as it was

    def test_invalid_fields_skip_only_that_card(self):
        bad = [
            ("website", "http://example.org"),
            ("group", "grad"),
            ("bio", "x" * 601),
            ("yearJoined", 1949),
            ("yearJoined", 9999),
            ("orcid", "0" * 20),
            ("name", ""),
            ("photoRev", "XYZ"),
            ("bio", "bell\x07"),
            ("v", 2),
        ]
        for i, (key, value) in enumerate(bad):
            self.specs.append(mf.spec(f"uidBad{i:023d}", f"bad-{i}", "Bad", "Role", "phd"))
            self.specs[-1]["fields"][key] = value
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), len(bad))
        snap = self.snapshot()
        self.assertOthersWritten(snap)
        self.assertFalse([k for k in snap if "bad-" in k])

    def test_wrong_type_is_skipped(self):
        s = mf.spec("uidType000000000000000011", "wrong-type", "Typed", "Role", "phd")
        self.specs.append(s)
        self.build()
        page = self.fix / "published.page2.json"
        body = json.loads(page.read_text())
        body["documents"][-1]["fields"]["alumni"] = {"stringValue": "yes"}
        page.write_text(json.dumps(body))
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), 1)

    def test_photo_hash_mismatch_skips_the_card(self):
        jane = self.spec_for("jane-doe")
        jane["photo_bytes"] = mf.jpeg(640, seed=12345)  # bytes no longer hash to photoRev
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), 1)
        self.assertIn("hash does not match", out)
        snap = self.snapshot()
        self.assertNotIn("src/content/team/jane-doe.md", snap)
        self.assertNotIn("src/assets/team/jane-doe.jpg", snap)
        self.assertOthersWritten(snap, ("john-roe", "ana-lopez", "kim-park"))

    def test_bad_photos_are_skipped(self):
        variants = {
            "tiny": mf.jpeg(128, seed=2),
            "huge": mf.jpeg(2048, seed=3),
            "oversize": mf.jpeg(640, seed=4) + b"0" * 270000,
            "not-a-jpeg": b"\x89PNG\r\n\x1a\n" + b"0" * 100,
        }
        # non-square: patch the frame header of a 640 square to 640x480
        sq = bytearray(mf.jpeg(640, seed=5))
        i = bytes(sq).index(b"\xff\xc0")
        sq[i + 5:i + 7] = (480).to_bytes(2, "big")
        variants["non-square"] = bytes(sq)
        for i, (name, data) in enumerate(variants.items()):
            self.specs.append(mf.spec(f"uidPhoto{i:020d}", f"photo-{name}", name, "Role", "phd", photo_bytes=data))
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), len(variants))
        self.assertFalse([k for k in self.snapshot() if "photo-" in k])

    def test_missing_photo_document_skips_the_card(self):
        (self.fix / f"published_photos.{self.spec_for('jane-doe')['uid']}.json").unlink()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), 1)
        self.assertNotIn("src/content/team/jane-doe.md", self.snapshot())

    def test_skipped_card_keeps_its_previous_file_and_is_not_a_removal(self):
        self.sync()
        before = self.snapshot()
        self.spec_for("kim-park")["fields"]["website"] = "http://nope"
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), 1)
        self.assertEqual(self.snapshot(), before)

    def test_slug_held_by_another_cards_file_is_not_taken(self):
        self.sync()
        # kim becomes invalid (file stays), ana now asks for kim's slug
        self.spec_for("kim-park")["fields"]["website"] = "http://nope"
        self.spec_for("ana-lopez")["fields"]["slug"] = "kim-park"
        self.build()
        before = self.snapshot()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertEqual(self.skipped(), 2)
        self.assertEqual(self.snapshot(), before)


class TestOwnership(Base):
    def test_hand_written_file_is_left_alone_and_never_deleted(self):
        legacy = self.team / "legacy-member.md"
        self.sync()
        self.assertEqual(legacy.read_text(encoding="utf-8"), HAND_WRITTEN)
        self.specs = []
        self.build(specs=[], pages=[[]])
        # all four synced cards unpublished: refused by the zero-documents guard; the hand-written file survives
        self.sync()
        self.assertEqual(legacy.read_text(encoding="utf-8"), HAND_WRITTEN)
        self.sync("--allow-shrink")
        self.assertEqual(legacy.read_text(encoding="utf-8"), HAND_WRITTEN)

    def test_published_card_takes_over_a_hand_written_file(self):
        self.specs.append(mf.spec("uidTake0000000000000000012", "legacy-member", "Legacy Member", "Lab Manager", "staff", order=9))
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        text = (self.team / "legacy-member.md").read_text(encoding="utf-8")
        self.assertIn('uid: "uidTake0000000000000000012"', text)
        self.assertNotIn("A hand-written bio.", text)
        # once synced it is owned by the sync: unpublishing removes it
        self.specs.pop()
        self.build()
        code, out = self.sync()
        self.assertEqual(code, 0, out)
        self.assertFalse((self.team / "legacy-member.md").exists())

    def test_nothing_outside_the_two_folders_is_touched(self):
        (self.repo / "src" / "data" / "publications.json").write_text("[]\n")
        (self.team / "notes.txt").write_text("keep\n")
        self.sync()
        self.assertEqual((self.repo / "src" / "data" / "publications.json").read_text(), "[]\n")
        self.assertEqual((self.team / "notes.txt").read_text(), "keep\n")


class TestUnits(unittest.TestCase):
    def test_jpeg_size(self):
        self.assertEqual(ms.jpeg_size(mf.jpeg(640)), (640, 640))
        with self.assertRaises(ms.Invalid):
            ms.jpeg_size(b"GIF89a....")
        with self.assertRaises(ms.Invalid):
            ms.jpeg_size(b"\xff\xd8\xff\xd9")

    def test_decode_value(self):
        self.assertEqual(ms.decode_value({"integerValue": "2023"}), 2023)
        self.assertEqual(ms.decode_value({"nullValue": None}), None)
        self.assertEqual(ms.decode_value({"bytesValue": "AAEC"}), b"\x00\x01\x02")
        self.assertEqual(ms.decode_value({"arrayValue": {"values": [{"stringValue": "a"}]}}), ["a"])
        self.assertEqual(ms.decode_value({"mapValue": {"fields": {"k": {"booleanValue": True}}}}), {"k": True})
        self.assertEqual(ms.decode_value({"mapValue": {}}), {})
        with self.assertRaises(ms.Invalid):
            ms.decode_value({"integerValue": "12x"})
        with self.assertRaises(ms.Invalid):
            ms.decode_value({"mysteryValue": 1})

    def test_render_escapes_yaml_hazards(self):
        card = {k: "" for k in ("bio", "interests", "email", "orcid", "scholar", "github", "website", "linkedin", "currentPosition")}
        card.update(name='Q"uote\\', role="a b", group="phd", alumni=False, yearJoined=None, yearLeft=None,
                    order=None, slug="q", uid="u", rev="0" * 16)
        text = ms.render_card(card, False)
        self.assertIn('name: "Q\\"uote\\\\"', text)
        self.assertIn("\\u2028", text)
        self.assertNotIn(" ", text)


if __name__ == "__main__":
    unittest.main()
