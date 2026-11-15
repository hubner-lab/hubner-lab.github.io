#!/usr/bin/env python3
"""Build the Hubner Lab design picker.

Reads the site's real content (team, papers, news, page copy, images), inlines
it, concatenates the parts under src/ and writes

  dist/picker.html   the Artifact body (title and style first, no html/head/body tags)
  dist/preview.html  the same inside a minimal skeleton, for local screenshots

Standard library plus `magick` (ImageMagick) for image resizing. Exits non-zero
on any missing part, image or piece of copy, so a green build means the picker
was made from the repo as it is today.
"""
import base64
import html
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = HERE / "src"
DIST = HERE / "dist"

FONTS_URL = (
    "https://fonts.googleapis.com/css2"
    "?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700"
    "&family=Inter:wght@400;500;600"
    "&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700"
    "&family=Source+Sans+3:ital,wght@0,400..700;1,400..700"
    "&family=Instrument+Serif:ital@0;1"
    "&family=Instrument+Sans:wght@400..700"
    "&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400"
    "&family=IBM+Plex+Mono:wght@400;500"
    "&family=Geist:wght@400..700"
    "&family=Geist+Mono:wght@400..600"
    "&display=swap"
)

# Parts, in the order they are concatenated.
CSS_PARTS = ["chrome.css", "mock.css"]
JS_PARTS = [
    "js/00-core.js",
    "js/10-foundations.js",
    "js/20-components.js",
    "js/30-nav.js",
    "js/40-hero.js",
    "js/50-home.js",
    "js/51-research.js",
    "js/52-team.js",
    "js/53-publications.js",
    "js/54-site.js",
    "js/55-lists.js",
    "js/60-preview.js",
    "js/90-app.js",
]
BODY_PART = "body.html"

PREPRINT_VENUES = {"biorxiv", "arxiv", "medrxiv", "research square", "ssrn", "preprints.org", "preprints"}


def die(msg):
    print(f"build.py: {msg}", file=sys.stderr)
    sys.exit(1)


def read(path):
    p = Path(path)
    if not p.is_file():
        die(f"missing file {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}")
    return p.read_text(encoding="utf-8")


# ---------------------------------------------------------------- content ---

def frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        die("file without frontmatter")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        v = v.strip()
        if v.startswith("[") and v.endswith("]"):
            meta[k.strip()] = [x.strip() for x in v[1:-1].split(",") if x.strip()]
        elif v in ("true", "false"):
            meta[k.strip()] = v == "true"
        elif re.fullmatch(r"-?\d+", v):
            meta[k.strip()] = int(v)
        else:
            meta[k.strip()] = v.strip("\"'")
    return meta, m.group(2).strip()


def squash(s):
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def load_people():
    people = []
    files = sorted((ROOT / "src/content/team").glob("*.md"))
    if not files:
        die("no team files in src/content/team")
    for f in files:
        meta, body = frontmatter(read(f))
        people.append({
            "slug": f.stem,
            "name": meta["name"],
            "role": meta["role"],
            "order": meta.get("order", 99),
            "alumni": bool(meta.get("alumni", False)),
            "bio": body,
            "hasEmail": bool(meta.get("email")),
            "hasScholar": bool(meta.get("scholar")),
        })
    people.sort(key=lambda p: p["order"])
    return people


def load_papers():
    data = json.loads(read(ROOT / "src/data/publications.json"))
    if len(data) < 15:
        die("publications.json has fewer than 15 entries")

    def slim(p):
        return {
            "year": p["year"],
            "title": p["title"],
            "authors": p["authors"],
            "venue": p.get("venue", ""),
            "citations": p.get("citations", 0),
        }

    years = {}
    for p in data:
        years[str(p["year"])] = years.get(str(p["year"]), 0) + 1
    preprints = [p for p in data if p.get("venue", "").strip().lower() in PREPRINT_VENUES]
    venues = sorted({p.get("venue", "") for p in data})
    stats = {
        "count": len(data),
        "citations": sum(p.get("citations", 0) for p in data),
        "firstYear": min(p["year"] for p in data),
        "lastYear": max(p["year"] for p in data),
        "preprints": len(preprints),
        "maxAuthors": max(len(p["authors"].split(" and ")) for p in data),
        "noVenue": sum(1 for p in data if not p.get("venue", "").strip()),
        "years": years,
    }
    top = sorted(data, key=lambda p: -p.get("citations", 0))[:4]
    print(
        f"  papers: {stats['count']} entries, {stats['citations']:,} citations, "
        f"{stats['firstYear']}-{stats['lastYear']}, {stats['preprints']} preprints, "
        f"up to {stats['maxAuthors']} authors, {stats['noVenue']} without a venue"
    )
    print(f"  venues seen: {', '.join(v or '(none)' for v in venues)}")
    return {"first": [slim(p) for p in data[:11]], "top": [slim(p) for p in top], "stats": stats}


def load_news():
    out = []
    for f in sorted((ROOT / "src/content/news").glob("*.md"), reverse=True):
        meta, body = frontmatter(read(f))
        out.append({
            "title": meta["title"],
            "date": str(meta["date"]),
            "tags": meta.get("tags", []),
            "summary": meta.get("summary", ""),
            "body": squash(body),
        })
    if not out:
        die("no news files")
    return out[:3]


def rx(pattern, text, what, flags=re.S):
    m = re.search(pattern, text, flags)
    if not m:
        die(f"could not find {what}")
    return m


def load_copy():
    index = read(ROOT / "src/pages/index.astro")
    research = read(ROOT / "src/pages/research.astro")
    contact = read(ROOT / "src/pages/contact.astro")
    footer = read(ROOT / "src/components/Footer.astro")

    eyebrow = squash(rx(r'<p class="caption" style="color: var\(--color-leaf\);">(.*?)</p>', index, "hero eyebrow").group(1))
    tagline = squash(rx(r'<p class="text-lg leading-relaxed mb-5"[^>]*>(.*?)</p>', index, "hero tagline").group(1))
    mission = rx(r'<!-- Mission -->.*?<h2[^>]*>(.*?)</h2>.*?<p class="leading-relaxed"[^>]*>(.*?)</p>', index, "mission")
    mission_title, mission_body = squash(mission.group(1)), squash(mission.group(2))

    r_intro = rx(r'<h1 style="font-size: var\(--text-h1\);">(.*?)</h1>\s*<p class="mt-4[^>]*>(.*?)</p>', research, "research intro")
    pillars = []
    for m in re.finditer(r'<PillarCard\s+title="([^"]+)"\s+body="([^"]+)".*?organisms=\{\[(.*?)\]\}', research, re.S):
        orgs = re.findall(r"'([^']+)'", m.group(3))
        pillars.append({"title": m.group(1), "body": squash(m.group(2)), "organisms": orgs})
    if len(pillars) != 3:
        die(f"expected 3 research pillars, found {len(pillars)}")
    systems_block = rx(r"<p class=\"caption mb-6\">Study systems</p>.*?\[(.*?)\]\.map", research, "study systems").group(1)
    systems = re.findall(r"'([^']+)'", systems_block)
    if len(systems) != 7:
        die(f"expected 7 study systems, found {len(systems)}")

    email = rx(r'mailto:([^"]+)"', contact, "contact email").group(1)
    addr_html = rx(r"<address[^>]*>(.*?)</address>", contact, "contact address").group(1)
    address = [squash(x) for x in re.split(r"<br\s*/?>", addr_html) if squash(x)]
    pi_title = squash(rx(r'<p class="text-xl font-semibold mb-1"[^>]*>(.*?)</p>\s*<p style="color: var\(--color-soil\);">(.*?)</p>', contact, "PI title").group(2))
    foot_contact = rx(r'<p class="caption mb-3">Contact</p>\s*<p[^>]*>(.*?)<a href="mailto', footer, "footer contact").group(1)
    foot_lines = [squash(x) for x in re.split(r"<br\s*/?>", foot_contact) if squash(x)]
    foot_aff = rx(r'<p class="caption mb-3">Affiliations</p>\s*<p[^>]*>(.*?)</p>', footer, "footer affiliations").group(1)
    affiliations = [squash(x) for x in re.split(r"<br\s*/?>", foot_aff) if squash(x)]

    return {
        "heroEyebrow": eyebrow,
        "tagline": tagline,
        "mission": {"title": mission_title, "body": mission_body},
        "research": {"title": squash(r_intro.group(1)), "body": squash(r_intro.group(2))},
        "pillars": pillars,
        "systems": systems,
        "contact": {"email": email, "address": address, "piTitle": pi_title},
        "footer": {"lines": foot_lines, "affiliations": affiliations},
    }


# ----------------------------------------------------------------- images ---

def magick(src, dst, *args):
    cmd = ["magick", str(src), *args, str(dst)]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError) as e:
        die(f"magick failed for {Path(src).name}: {getattr(e, 'stderr', e)}")
    if not Path(dst).is_file() or Path(dst).stat().st_size == 0:
        die(f"magick produced no output for {Path(src).name}")


def load_images():
    pub = ROOT / "public/botanical"
    for n in ("wheat_hero_poster.jpg", "adaptation_crop.png", "domestication_crops.png",
              "phylogenetic_tree-removebg.png", "map_migal.png"):
        if not (pub / n).is_file():
            die(f"missing image public/botanical/{n}")
    specs = [
        ("hero", "wheat_hero_poster.jpg", "jpeg", ["-resize", "1400x", "-quality", "60", "-strip"]),
        ("speciation", "phylogenetic_tree-removebg.png", "png", ["-strip"]),
        ("adaptation", "adaptation_crop.png", "jpeg", ["-background", "#F7F6F1", "-flatten", "-resize", "480x480>", "-quality", "70", "-strip"]),
        ("domestication", "domestication_crops.png", "png", ["-resize", "480x480>", "-strip"]),
        ("map", "map_migal.png", "jpeg", ["-background", "white", "-flatten", "-quality", "80", "-strip"]),
    ]
    images = {}
    with tempfile.TemporaryDirectory() as tmp:
        for key, name, kind, args in specs:
            out = Path(tmp) / f"{key}.{'jpg' if kind == 'jpeg' else 'png'}"
            magick(pub / name, out, *args)
            b64 = base64.b64encode(out.read_bytes()).decode()
            images[key] = f"data:image/{kind};base64,{b64}"
            print(f"  image {key}: {out.stat().st_size // 1024} KB")
    return images


# ------------------------------------------------------------------ build ---

def main():
    print("Reading site content")
    site = {
        "people": load_people(),
        "papers": load_papers(),
        "news": load_news(),
        "copy": load_copy(),
        "builtFrom": "src/content, src/data, src/pages, public/botanical",
    }
    print(f"  people: {len(site['people'])}, news: {len(site['news'])}, pillars: 3, systems: 7")

    print("Preparing images")
    images = load_images()
    img_css = "\n".join(
        f".im-{k}{{background-image:url({v})}}" for k, v in images.items()
    )

    css = "\n".join(read(SRC / p) for p in CSS_PARTS) + "\n" + img_css
    site_js = "const SITE = " + json.dumps(site, ensure_ascii=False).replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029") + ";\n"
    js = site_js + "\n".join(read(SRC / p) for p in JS_PARTS)
    if "</script" in js.lower():
        die("a script part contains a closing script tag")
    body = read(SRC / BODY_PART)
    head = read(SRC / "head.html").replace("@@FONTS@@", html.escape(FONTS_URL, quote=True))

    page = f"{head}\n<style>\n{css}\n</style>\n{body}\n<script>\n{js}\n</script>\n"
    DIST.mkdir(exist_ok=True)
    (DIST / "picker.html").write_text(page, encoding="utf-8")

    skeleton = (
        "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">"
        "<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>"
        "</head><body>\n" + page + "\n</body></html>\n"
    )
    (DIST / "preview.html").write_text(skeleton, encoding="utf-8")
    size = (DIST / "picker.html").stat().st_size
    print(f"Wrote dist/picker.html ({size / 1024 / 1024:.2f} MB) and dist/preview.html")


if __name__ == "__main__":
    main()
