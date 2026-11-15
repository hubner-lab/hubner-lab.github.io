#!/usr/bin/env python3
"""
Copy approved member cards from the Firestore `published` collection into the
repo: src/content/team/<slug>.md and src/assets/team/<slug>.jpg.

Run by .github/workflows/members-sync.yml (by hand for now). The site itself
never reads Firebase; this job is the only bridge, so git stays the published
truth. Python standard library only. See docs/members-sync.md.

Exit codes: 0 = done (or portal not configured), 1 = refused or unreachable.
Cards that fail validation are skipped one by one (exit 0, `skipped=<n>` written
to $GITHUB_OUTPUT) so one bad card never blocks the others.
"""

import argparse
import base64
import binascii
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

DEFAULT_BASE_URL = "https://firestore.googleapis.com"
PAGE_SIZE = 300
MAX_PAGES = 100
TRIES = 3
RETRY_DELAY = 2  # seconds, multiplied by the attempt number
TIMEOUT = 30  # seconds per request
MAX_REMOVALS = 2  # more than this in one run needs --allow-shrink
USER_AGENT = "hubner-lab-members-sync"

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SLUG_MAX = 48
UID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
PROJECT_RE = re.compile(r"^[a-z][a-z0-9-]{3,62}$")
HEX16_RE = re.compile(r"^[0-9a-f]{16}$")

GROUPS = ("pi", "postdoc", "phd", "msc", "undergrad", "staff", "visitor")
# name -> (min, max) length; a missing optional string counts as ''.
STRING_LIMITS = {
    "name": (1, 80),
    "role": (1, 80),
    "bio": (0, 600),
    "interests": (0, 200),
    "email": (0, 120),
    "orcid": (0, 19),
    "scholar": (0, 20),
    "github": (0, 39),
    "linkedin": (0, 100),
    "website": (0, 200),
    "currentPosition": (0, 120),
}
YEAR_MIN = 1950

PHOTO_MAX_BYTES = 262144
PHOTO_MIN_SIDE = 256
PHOTO_MAX_SIDE = 1024

# Front-matter key order of a synced file (the contract's example).
KEY_ORDER = (
    "name", "role", "group", "alumni", "bio", "interests", "email", "orcid",
    "scholar", "github", "website", "linkedin", "yearJoined", "yearLeft",
    "currentPosition", "photo", "order", "uid", "rev",
)


class Invalid(Exception):
    """A document that does not satisfy the card contract."""


class FetchError(Exception):
    """Network or HTTP failure after all tries."""


class NotFound(FetchError):
    """HTTP 404: the document does not exist."""


def annotate(level, message):
    """Emit a GitHub Actions annotation so every path of the job is visible in
    the run, and append the same line to the job summary."""
    print(f"::{level}::{message}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(f"- **{level}** — {message}\n")


def set_output(name, value):
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(f"{name}={value}\n")


# --------------------------------------------------------------------------
# Firestore REST access
# --------------------------------------------------------------------------


class HttpSource:
    def __init__(self, base_url, project_id):
        self.docs_url = f"{base_url.rstrip('/')}/v1/projects/{project_id}/databases/(default)/documents"

    def _get(self, url):
        last = None
        for attempt in range(1, TRIES + 1):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    raise NotFound(f"HTTP 404 for {url}") from e
                last = f"HTTP {e.code}"
                if 400 <= e.code < 500 and e.code != 429:
                    break  # a client error will not fix itself
            except (urllib.error.URLError, OSError, ValueError) as e:
                last = f"{type(e).__name__}: {e}"
            if attempt < TRIES:
                time.sleep(RETRY_DELAY * attempt)
        raise FetchError(f"{last} for {url}")

    def list_published(self):
        docs, token, seen = [], None, set()
        for _ in range(MAX_PAGES):
            url = f"{self.docs_url}/published?pageSize={PAGE_SIZE}"
            if token:
                url += "&pageToken=" + urllib.parse.quote(token, safe="")
            page = self._get(url)
            docs.extend(page.get("documents", []))
            token = page.get("nextPageToken")
            if not token:
                return docs
            if token in seen:
                raise FetchError("pagination did not advance")
            seen.add(token)
        raise FetchError(f"more than {MAX_PAGES} pages of published cards")

    def get_photo(self, uid):
        return self._get(f"{self.docs_url}/published_photos/{urllib.parse.quote(uid, safe='')}")


class FixtureSource:
    """Saved REST responses: published.json, published.<pageToken>.json,
    published_photos.<uid>.json."""

    def __init__(self, directory):
        self.dir = Path(directory)

    def _load(self, name):
        path = self.dir / name
        if not path.is_file():
            raise NotFound(f"fixture {name} not found")
        return json.loads(path.read_text(encoding="utf-8"))

    def list_published(self):
        docs, token, seen = [], None, set()
        while True:
            name = "published.json" if token is None else f"published.{token}.json"
            try:
                page = self._load(name)
            except NotFound as e:
                raise FetchError(str(e)) from e
            docs.extend(page.get("documents", []))
            token = page.get("nextPageToken")
            if not token:
                return docs
            if token in seen:
                raise FetchError("pagination did not advance")
            seen.add(token)

    def get_photo(self, uid):
        return self._load(f"published_photos.{uid}.json")


# --------------------------------------------------------------------------
# Decoding and validation
# --------------------------------------------------------------------------


def decode_value(v):
    """Unwrap one Firestore REST value."""
    if not isinstance(v, dict) or len(v) != 1:
        raise Invalid("malformed Firestore value")
    ((kind, val),) = v.items()
    if kind == "stringValue":
        if not isinstance(val, str):
            raise Invalid("malformed stringValue")
        return val
    if kind == "booleanValue":
        if type(val) is not bool:
            raise Invalid("malformed booleanValue")
        return val
    if kind == "integerValue":
        if not isinstance(val, str) or not re.fullmatch(r"-?[0-9]{1,19}", val):
            raise Invalid("malformed integerValue")
        return int(val)
    if kind == "doubleValue":
        if type(val) not in (int, float):
            raise Invalid("malformed doubleValue")
        return float(val)
    if kind == "nullValue":
        return None
    if kind in ("timestampValue", "referenceValue"):
        if not isinstance(val, str):
            raise Invalid(f"malformed {kind}")
        return val
    if kind == "bytesValue":
        if not isinstance(val, str):
            raise Invalid("malformed bytesValue")
        try:
            return base64.b64decode(val, validate=True)
        except (binascii.Error, ValueError) as e:
            raise Invalid("bytesValue is not base64") from e
    if kind == "mapValue":
        return decode_fields(val)
    if kind == "arrayValue":
        if not isinstance(val, dict):
            raise Invalid("malformed arrayValue")
        return [decode_value(x) for x in val.get("values", [])]
    if kind == "geoPointValue":
        return val
    raise Invalid(f"unknown value type {kind}")


def decode_fields(container):
    fields = container.get("fields") if isinstance(container, dict) else None
    if fields is None:
        return {}
    if not isinstance(fields, dict):
        raise Invalid("malformed fields")
    return {k: decode_value(v) for k, v in fields.items()}


def doc_id(doc):
    name = doc.get("name") if isinstance(doc, dict) else None
    if not isinstance(name, str) or "/" not in name:
        raise Invalid("document has no name")
    return name.rsplit("/", 1)[-1]


def _clean_text(key, s):
    for ch in s:
        cat = unicodedata.category(ch)
        if (cat in ("Cc", "Cs") and ch not in "\n\t") or ch in "\ufffe\uffff\ufeff":
            raise Invalid(f"{key} contains a control character")


def validate_card(uid, fields, max_year):
    """Re-check a decoded `published` document against the card contract.
    Returns the normalised card as a dict of repo values."""
    if fields.get("v") != 1 or type(fields.get("v")) is not int:
        raise Invalid("unsupported schema version v")
    slug = fields.get("slug")
    if not isinstance(slug, str) or len(slug) > SLUG_MAX or not SLUG_RE.fullmatch(slug):
        raise Invalid("invalid slug")
    rev = fields.get("rev")
    if not isinstance(rev, str) or not HEX16_RE.fullmatch(rev):
        raise Invalid("invalid rev")

    card = {"slug": slug, "rev": rev, "uid": uid}
    for key, (lo, hi) in STRING_LIMITS.items():
        val = fields.get(key, "")
        if val is None:
            val = ""
        if not isinstance(val, str):
            raise Invalid(f"{key} is not a string")
        if not lo <= len(val) <= hi:
            raise Invalid(f"{key} length {len(val)} outside {lo}-{hi}")
        _clean_text(key, val)
        card[key] = val

    if fields.get("group") not in GROUPS:
        raise Invalid("invalid group")
    card["group"] = fields["group"]

    alumni = fields.get("alumni", False)
    if type(alumni) is not bool:
        raise Invalid("alumni is not a boolean")
    card["alumni"] = alumni

    if card["website"] and not card["website"].startswith("https://"):
        raise Invalid("website must start with https://")

    for key in ("yearJoined", "yearLeft"):
        val = fields.get(key)
        if val is None:
            card[key] = None
            continue
        if type(val) is not int or not YEAR_MIN <= val <= max_year:
            raise Invalid(f"{key} outside {YEAR_MIN}-{max_year}")
        card[key] = val

    photo_rev = fields.get("photoRev", "")
    if photo_rev is None:
        photo_rev = ""
    if not isinstance(photo_rev, str) or (photo_rev and not HEX16_RE.fullmatch(photo_rev)):
        raise Invalid("invalid photoRev")
    card["photoRev"] = photo_rev

    order = fields.get("order")
    if order is not None and (type(order) is not int or abs(order) > 1_000_000):
        raise Invalid("invalid order")
    card["order"] = order
    return card


_SOF_MARKERS = {m for m in range(0xC0, 0xD0) if m not in (0xC4, 0xC8, 0xCC)}


def jpeg_size(data):
    """(width, height) from the first frame header of a JPEG."""
    if data[:3] != b"\xff\xd8\xff":
        raise Invalid("photo is not a JPEG")
    n, i = len(data), 2
    while i < n:
        if data[i] != 0xFF:
            raise Invalid("photo has a malformed JPEG segment")
        while i < n and data[i] == 0xFF:
            i += 1
        if i >= n:
            break
        marker = data[i]
        i += 1
        if marker == 0x01 or 0xD0 <= marker <= 0xD8:
            continue
        if marker in (0xD9, 0xDA):
            break
        if i + 2 > n:
            break
        length = int.from_bytes(data[i:i + 2], "big")
        if length < 2:
            raise Invalid("photo has a malformed JPEG segment")
        if marker in _SOF_MARKERS:
            if length < 8 or i + 7 > n:
                raise Invalid("photo has a malformed JPEG frame header")
            height = int.from_bytes(data[i + 3:i + 5], "big")
            width = int.from_bytes(data[i + 5:i + 7], "big")
            return width, height
        i += length
    raise Invalid("photo has no JPEG frame header")


def validate_photo(doc, photo_rev):
    """Bytes of a validated photo document, or Invalid."""
    fields = decode_fields(doc)
    data = fields.get("data")
    if not isinstance(data, bytes):
        raise Invalid("photo document has no data")
    if len(data) > PHOTO_MAX_BYTES:
        raise Invalid(f"photo is {len(data)} bytes, over {PHOTO_MAX_BYTES}")
    width, height = jpeg_size(data)
    if width != height or not PHOTO_MIN_SIDE <= width <= PHOTO_MAX_SIDE:
        raise Invalid(f"photo is {width}x{height}, need a square of {PHOTO_MIN_SIDE}-{PHOTO_MAX_SIDE} px")
    digest = hashlib.sha256(data).hexdigest()[:16]
    if digest != photo_rev or fields.get("rev") != photo_rev:
        raise Invalid("photo hash does not match its rev")
    return data


# --------------------------------------------------------------------------
# Output files
# --------------------------------------------------------------------------


def js(value):
    """JSON text that is also a valid YAML flow scalar."""
    text = json.dumps(value, ensure_ascii=False)
    return text.replace("\u0085", "\\u0085").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def render_card(card, has_photo):
    values = {
        "name": card["name"],
        "role": card["role"],
        "group": card["group"],
        "alumni": card["alumni"],
        "bio": card["bio"],
        "interests": [s.strip() for s in card["interests"].split(",") if s.strip()],
        "email": card["email"],
        "orcid": card["orcid"],
        "scholar": card["scholar"],
        "github": card["github"],
        "website": card["website"],
        "linkedin": card["linkedin"],
        "yearJoined": card["yearJoined"],
        "yearLeft": card["yearLeft"],
        "currentPosition": card["currentPosition"],
        "photo": f"../../assets/team/{card['slug']}.jpg" if has_photo else "",
        "order": card["order"],
        "uid": card["uid"],
        "rev": card["rev"],
    }
    lines = ["---"]
    for key in KEY_ORDER:
        val = values[key]
        if val is None or val == "" or val == []:
            continue
        lines.append(f"{key}: {js(val)}")
    lines.append("---")
    return "\n".join(lines) + "\n"


_FM_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)
_UID_LINE = re.compile(r"^uid:[ \t]*(.+?)[ \t]*$", re.M)


def frontmatter_uid(text):
    """The `uid` of a synced file, or None for a hand-written one."""
    m = _FM_RE.match(text)
    if not m:
        return None
    um = _UID_LINE.search(m.group(1))
    if not um:
        return None
    raw = um.group(1)
    if raw.startswith('"'):
        try:
            val = json.loads(raw)
        except ValueError:
            return None
    else:
        val = raw.strip("'\"")
    return val if isinstance(val, str) and val else None


class Tree:
    """The two target folders of a repo, with checked paths."""

    def __init__(self, repo):
        self.team = repo / "src" / "content" / "team"
        self.assets = repo / "src" / "assets" / "team"

    def md(self, slug):
        return self._path(self.team, slug, ".md")

    def jpg(self, slug):
        return self._path(self.assets, slug, ".jpg")

    @staticmethod
    def _path(folder, slug, ext):
        if not SLUG_RE.fullmatch(slug) or len(slug) > SLUG_MAX:
            raise ValueError(f"refusing unsafe slug {slug!r}")
        path = folder / f"{slug}{ext}"
        if path.parent != folder:
            raise ValueError(f"refusing path outside {folder}")
        return path

    def scan(self):
        """[(slug, uid or None)] for every .md file in the team folder."""
        out = []
        if self.team.is_dir():
            for path in sorted(self.team.glob("*.md")):
                if path.is_symlink() or not path.is_file() or not SLUG_RE.fullmatch(path.stem):
                    out.append((path.stem, None))  # never touched as a synced file
                    continue
                text = path.read_text(encoding="utf-8", errors="replace")
                out.append((path.stem, frontmatter_uid(text)))
        return out

    def photo_rev(self, slug):
        path = self.jpg(slug)
        if not path.is_file():
            return None
        return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_bytes(data)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


# --------------------------------------------------------------------------
# The sync
# --------------------------------------------------------------------------


def run(source, tree, allow_shrink, dry_run, today_year):
    docs = source.list_published()

    # 1. Decode and validate every document in memory.
    published_ids = set()
    claims = {}  # slug -> [uid] over every document that names a well-formed slug
    cards = {}
    skipped = []  # (uid, reason)
    for doc in docs:
        try:
            uid = doc_id(doc)
        except Invalid as e:
            skipped.append(("?", str(e)))
            continue
        published_ids.add(uid)
        try:
            if not UID_RE.fullmatch(uid):
                raise Invalid("document id is not a valid uid")
            fields = decode_fields(doc)
            slug = fields.get("slug")
            if isinstance(slug, str) and len(slug) <= SLUG_MAX and SLUG_RE.fullmatch(slug):
                claims.setdefault(slug, []).append(uid)
            cards[uid] = validate_card(uid, fields, today_year)
        except Invalid as e:
            skipped.append((uid, str(e)))

    # 2. Two documents with one slug: neither is written.
    for slug, uids in claims.items():
        if len(uids) > 1:
            for uid in uids:
                if uid in cards:
                    del cards[uid]
                    skipped.append((uid, f"slug '{slug}' is used by {len(uids)} cards"))

    existing = tree.scan()  # [(slug, uid|None)]
    synced = [(slug, uid) for slug, uid in existing if uid]

    # 3. Guards, all before the first write.
    # An empty collection is what a wrong project or an emptied database looks
    # like, so it never empties the roster by itself. It is also what the take
    # down of the last card looks like: only an explicit --allow-shrink accepts it.
    if not published_ids and synced and not allow_shrink:
        annotate("error", f"Firestore returned 0 published cards while {len(synced)} synced file(s) exist; refusing to delete them (rerun with --allow-shrink if the last card was taken down on purpose)")
        return 1
    removals = [(slug, uid) for slug, uid in synced if uid not in published_ids]
    if len(removals) > MAX_REMOVALS and not allow_shrink:
        annotate("error", f"{len(removals)} synced cards would be removed (limit {MAX_REMOVALS}); rerun with --allow-shrink if this is intended")
        return 1

    # 4. Photos: fetch only what differs from the file in the repo.
    photos = {}  # uid -> bytes
    for uid in list(cards):
        card = cards[uid]
        if not card["photoRev"] or tree.photo_rev(card["slug"]) == card["photoRev"]:
            continue
        try:
            photos[uid] = validate_photo(source.get_photo(uid), card["photoRev"])
        except NotFound:
            del cards[uid]
            skipped.append((uid, "photoRev is set but the photo document does not exist"))
        except Invalid as e:
            del cards[uid]
            skipped.append((uid, str(e)))

    # 5. A card may not take a slug held by another card's file that stays.
    holder = {slug: uid for slug, uid in synced}
    while True:
        vacating = {slug for slug, uid in synced if uid not in published_ids or (uid in cards and cards[uid]["slug"] != slug)}
        blocked = [
            uid for uid, c in cards.items()
            if c["slug"] not in vacating and holder.get(c["slug"]) not in (None, uid)
        ]
        if not blocked:
            break
        for uid in blocked:
            skipped.append((uid, f"slug '{cards[uid]['slug']}' belongs to the file of another card"))
            del cards[uid]
            photos.pop(uid, None)

    # 6. Plan.
    targets = {c["slug"] for c in cards.values()}
    photo_targets = {c["slug"] for c in cards.values() if c["photoRev"]}
    own_slug = {uid: slug for slug, uid in synced}
    photo_ops, ops = [], []  # (kind, label, callable)
    added = updated = unchanged = 0
    for uid, card in sorted(cards.items(), key=lambda kv: kv[1]["slug"]):
        slug = card["slug"]
        md_path = tree.md(slug)
        text = render_card(card, bool(card["photoRev"])).encode("utf-8")
        old = md_path.read_bytes() if md_path.is_file() else None
        changed = False
        if old != text:
            changed = True
            ops.append(("write", f"src/content/team/{slug}.md", lambda p=md_path, t=text: write_atomic(p, t)))
        if uid in photos:
            changed = True
            photo_ops.append(("write", f"src/assets/team/{slug}.jpg", lambda p=tree.jpg(slug), t=photos[uid]: write_atomic(p, t)))
        elif not card["photoRev"] and own_slug.get(uid) == slug and tree.jpg(slug).is_file():
            changed = True
            ops.append(("delete", f"src/assets/team/{slug}.jpg", lambda p=tree.jpg(slug): p.unlink()))
        if not changed:
            unchanged += 1
        elif old is None:
            added += 1
        else:
            updated += 1

    deletes = []
    for slug, uid in synced:
        gone = uid not in published_ids
        moved = uid in cards and cards[uid]["slug"] != slug
        if not (gone or moved):
            continue
        if slug not in targets:
            deletes.append(("delete", f"src/content/team/{slug}.md", lambda p=tree.md(slug): p.unlink()))
        if slug not in photo_targets and tree.jpg(slug).is_file():
            deletes.append(("delete", f"src/assets/team/{slug}.jpg", lambda p=tree.jpg(slug): p.unlink()))
    ops = deletes + photo_ops + ops
    removed = len(removals)

    # 7. Report, then write.
    verb = {"write": "would write" if dry_run else "wrote", "delete": "would delete" if dry_run else "deleted"}
    for uid, reason in skipped:
        annotate("warning", f"Skipped card {uid}: {reason}")
    if not dry_run:
        for kind, label, fn in ops:
            fn()
    for kind, label, fn in ops:
        print(f"{verb[kind]} {label}")

    prefix = "Dry run — nothing written. " if dry_run else ""
    if ops:
        annotate("notice", f"{prefix}Fetched {len(docs)} published card(s): {added} added, {updated} updated, {removed} removed, {unchanged} unchanged")
    else:
        annotate("notice", f"{prefix}Fetched {len(docs)} published card(s), no changes")
    set_output("skipped", len(skipped))
    return 0


def load_project_id(config):
    try:
        data = json.loads(config.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise FetchError(f"cannot read {config.name}: {e}") from e
    pid = data.get("projectId") if isinstance(data, dict) else None
    if not isinstance(pid, str) or not PROJECT_RE.fullmatch(pid):
        raise FetchError(f"{config.name} has no valid projectId")
    return pid


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="report what would change, write nothing")
    ap.add_argument("--fixture", metavar="DIR", help="read saved REST responses from DIR instead of the network")
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL, help="replace the Firestore host (e.g. the emulator)")
    ap.add_argument("--allow-shrink", action="store_true", help=f"accept the removal of more than {MAX_REMOVALS} cards, or of the last one")
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parent.parent), help="repo root (default: the repo this script sits in)")
    args = ap.parse_args(argv)

    repo = Path(args.repo).resolve()
    config = repo / "src" / "data" / "firebase-config.json"
    if not config.is_file():
        annotate("notice", "members portal not configured (no src/data/firebase-config.json); nothing to sync")
        set_output("skipped", 0)
        return 0
    try:
        project_id = load_project_id(config)
        if args.fixture:
            source = FixtureSource(args.fixture)
        else:
            if not re.match(r"^https?://", args.base_url):
                raise FetchError("--base-url must start with http:// or https://")
            source = HttpSource(args.base_url, project_id)
        return run(source, Tree(repo), args.allow_shrink, args.dry_run, date.today().year + 1)
    except FetchError as e:
        annotate("error", f"Members sync failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
