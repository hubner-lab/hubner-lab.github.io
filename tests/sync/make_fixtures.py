"""Builds saved Firestore REST responses for the members-sync tests.

`python3 tests/sync/make_fixtures.py` regenerates tests/sync/fixtures/ (the
committed base set: four cards over two pages, two with photos). The tests
import `build()` and write their own variants into temporary directories.
"""

import base64
import hashlib
import json
import random
import sys
from pathlib import Path

PROJECT = "demo-members"
DOCS = f"projects/{PROJECT}/databases/(default)/documents"


def jpeg(side=640, seed=1, extra=2000):
    """A JPEG-shaped blob: SOI, JFIF, a comment, SOF0 with the given size, SOS, EOI.
    The sync reads only the header, so no real image data is needed."""
    rnd = random.Random(seed)
    comment = bytes(rnd.randrange(32, 127) for _ in range(extra))
    sof = b"\xff\xc0" + (11).to_bytes(2, "big") + b"\x08" + side.to_bytes(2, "big") + side.to_bytes(2, "big") + b"\x01\x01\x11\x00"
    return (
        b"\xff\xd8"
        + b"\xff\xe0" + (16).to_bytes(2, "big") + b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        + b"\xff\xfe" + (len(comment) + 2).to_bytes(2, "big") + comment
        + sof
        + b"\xff\xda" + (8).to_bytes(2, "big") + b"\x01\x01\x00\x00\x3f\x00"
        + bytes(rnd.randrange(256) for _ in range(64))
        + b"\xff\xd9"
    )


def enc(value):
    if isinstance(value, bool):
        return {"booleanValue": value}
    if value is None:
        return {"nullValue": None}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, bytes):
        return {"bytesValue": base64.b64encode(value).decode()}
    return {"stringValue": value}


def rev_of(content):
    return hashlib.sha256(json.dumps(content, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:16]


def spec(uid, slug, name, role, group, **kw):
    """One published card. kw overrides any field; `photo` is a JPEG side (or None)."""
    photo = kw.pop("photo", None)
    fields = {
        "name": name, "role": role, "group": group, "alumni": False, "bio": "", "interests": "",
        "email": "", "orcid": "", "scholar": "", "github": "", "linkedin": "", "website": "",
        "yearJoined": None, "yearLeft": None, "currentPosition": "", "photoRev": "",
    }
    fields.update({k: v for k, v in kw.items() if k in fields})
    photo_bytes = kw.get("photo_bytes")
    if photo is not None and photo_bytes is None:
        photo_bytes = jpeg(photo, seed=sum(uid.encode()))
    if photo_bytes is not None and "photoRev" not in kw:
        fields["photoRev"] = hashlib.sha256(photo_bytes).hexdigest()[:16]
    meta = {"v": 1, "slug": slug, "rev": rev_of(fields), "order": kw.get("order"), "publishedAt": None}
    meta.update({k: v for k, v in kw.items() if k in meta})
    return {"uid": uid, "fields": {**fields, **meta}, "photo_bytes": photo_bytes, "photo_rev": kw.get("photo_doc_rev")}


def base_specs():
    return [
        spec("uidJane0000000000000000001", "jane-doe", "Jane Doe", "PhD Student", "phd", bio="Studies wild barley.",
             interests="wild barley, local adaptation", email="jane@example.org", orcid="0000-0001-2345-6789",
             scholar="AbCdEfGhIjKl", github="janedoe", website="https://example.org/jane", linkedin="jane-doe",
             yearJoined=2023, order=3, photo=640),
        spec("uidJohn0000000000000000002", "john-roe", "John Roe", "Research Assistant", "staff", alumni=True,
             yearJoined=2018, yearLeft=2022, currentPosition="Analyst, Example Ltd"),
        spec("uidAna00000000000000000003", "ana-lopez", "Ana López", "Postdoc", "postdoc", yearJoined=2024, photo=512),
        spec("uidKim00000000000000000004", "kim-park", "Kim Park", "MSc Student", "msc", interests=" soil ,, microbes "),
    ]


def doc_of(s):
    return {"name": f"{DOCS}/published/{s['uid']}", "fields": {k: enc(v) for k, v in s["fields"].items()},
            "createTime": "2026-11-01T10:00:00Z", "updateTime": "2026-11-01T10:00:00Z"}


def photo_doc_of(s):
    rev = s["photo_rev"] or s["fields"]["photoRev"]
    return {"name": f"{DOCS}/published_photos/{s['uid']}",
            "fields": {"data": enc(s["photo_bytes"]), "rev": enc(rev), "w": enc(640), "h": enc(640),
                       "updatedAt": {"timestampValue": "2026-11-01T10:00:00Z"}}}


def build(directory, specs=None, pages=None):
    """Write published.json, published.page2.json, ... and published_photos.<uid>.json.
    `pages` is a list of lists of specs; default: two per page."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    for old in directory.glob("*.json"):
        old.unlink()
    specs = base_specs() if specs is None else specs
    if pages is None:
        pages = [specs[i:i + 2] for i in range(0, len(specs), 2)] or [[]]
    for n, page in enumerate(pages, start=1):
        body = {"documents": [doc_of(s) for s in page]} if page else {}
        if n < len(pages):
            body["nextPageToken"] = f"page{n + 1}"
        name = "published.json" if n == 1 else f"published.page{n}.json"
        (directory / name).write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    for s in (s for page in pages for s in page):
        if s["photo_bytes"] is not None:
            (directory / f"published_photos.{s['uid']}.json").write_text(
                json.dumps(photo_doc_of(s), indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    out = Path(__file__).resolve().parent / "fixtures"
    build(out)
    print(f"wrote {len(list(out.glob('*.json')))} fixture files to {out}", file=sys.stderr)
