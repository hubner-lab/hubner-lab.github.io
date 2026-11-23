# Hübner Lab website

The website of the Hübner Lab (evolutionary and landscape genomics, Tel-Hai College and Migal),
live at <https://hubner-lab.github.io>. It is a static site: [Astro](https://astro.build) 6 builds
plain HTML from the files in this repository, and GitHub Pages serves it. Every push to `main`
goes live by itself.

## Start here

| You want to | Read |
|---|---|
| Change a text, add a news post, add a person, switch a block on | [`CONTENT.md`](CONTENT.md) |
| Approve member cards, keep records for alumni | [`docs/members-admin.md`](docs/members-admin.md) |
| Understand or repair the job that copies cards into the site | [`docs/members-sync.md`](docs/members-sync.md) |
| Build, test, change or release the site | this file |

## Run it

You need Node 22 (`.nvmrc`; 22.18 or newer for the tests and the two `.mjs` scripts, which read
TypeScript files directly) and pnpm 10.

| Command | What it does |
|---|---|
| `pnpm install` | installs the packages |
| `pnpm dev` | serves the site at `http://localhost:4321` and reloads on a change |
| `pnpm build` | builds the site into `dist/` |
| `pnpm preview` | serves `dist/` at `http://localhost:4321`, exactly as it will be published |

Check a layout on `pnpm build` and `pnpm preview`, not only on `pnpm dev`: the published site is
the build.

## What is where

| Path | What it holds |
|---|---|
| `src/site.config.ts` | the facts the pages share: names, navigation, contact, address, affiliations, funders, the map point, the switches |
| `src/pages/` | one file per page: home, Research, Team, Publications, News and its posts, Contact, the "page not found" page, the members portal, the RSS feed |
| `src/components/` | the parts of the pages; `ui/` holds the shared small ones (button, card, chip, section header, icon, portrait, post text) |
| `src/layouts/Base.astro` | the frame of every page: head, navigation, footer, and the one script every page runs |
| `src/styles/global.css` | the design tokens (colours of both themes, type sizes, corners) and the base rules; `fonts.css` beside it declares the two typefaces |
| `src/lib/` | the logic, as plain functions with tests: publications, the news list, the team order, the cards |
| `src/content/news/`, `src/content/team/` | news posts and people, one Markdown file each (`src/content.config.ts` states their fields) |
| `src/data/` | `publications.json` and `publications-seen.json`, both written by the Scholar job |
| `src/assets/` | pictures the build resizes and compresses: the hero poster, the research pictures, the contact map, people's photos |
| `src/members/`, `firebase/` | the members portal (`/members`) and its security rules |
| `public/` | files served as they are: the hero video, the social image, `robots.txt`, the icons |
| `scripts/` | the jobs and the tools: `scholar.py`, `backfill_seen.py`, `members_sync.py`, `contact-map.mjs`, `social-image.mjs` |
| `tests/` | `site/` (the built pages), `team/`, `portal/`, `rules/`, `scholar/`, `sync/` |
| `.github/workflows/` | `deploy.yml` (release), `ci.yml` (build check on other branches), `scholar.yml`, `members-sync.yml` |
| `design/` | sources that the build does not read: the design picker and the social image |

## Where the content comes from

- **News**: the files in `src/content/news/`.
- **Publications**: `src/data/publications.json`, which the job "Update publications from Google
  Scholar" rewrites every four hours (`scripts/scholar.py`). The same job records in
  `src/data/publications-seen.json` the day it first saw each paper; a paper with such a day
  appears as "New paper" in the news by itself.
- **People**: the files in `src/content/team/` and the photos in `src/assets/team/`. They are
  written by hand, or copied from the members portal by the job "Sync team cards from the members
  portal" (`scripts/members_sync.py`). The site never reads the portal's database.
- **Everything else**: `src/site.config.ts` and the page files.

One list (`src/lib/feed.ts`) feeds the "Latest" rows of the home page, the News page and
`/rss.xml`. The build asks no other site for anything, and neither does a public page when it is
opened: the fonts, the map and the video are files of this site.

## The look

The design was chosen in November 2026, element by element, with the picker in `design/picker/`.
What a change has to respect:

- **Tokens.** Every colour, corner and type size is a token in `src/styles/global.css`. The dark
  theme is the default and stands in the markup (`<html data-theme="dark">`); the light theme
  overrides the same names. Components read the tokens with `var()`. Tailwind's own palette is
  switched off, so a utility such as `text-muted` or `bg-surface` is always one of the site's
  colours.
- **Typefaces.** Source Serif 4 for headings and Source Sans 3 for text, from two packages pinned
  to one version, because `src/styles/fonts.css` names their files.
- **The page column** is the utility `wrap`. An element with the class `reveal` fades up when it
  enters the window.
- **Without JavaScript** every page shows all of its content. A control that needs a script
  carries `data-js-only` and is hidden until the script of the page head has run.
- **Reduced motion.** For a visitor who asks for it, the video is not fetched, the animations
  stand still and nothing fades.
- **Contrast.** Text reads at 4.5:1 or better in both themes, on chips and over the video too.

## Budgets

The tests fail when a page goes over one of these, and print what they measured.

| What | Limit |
|---|---|
| Stylesheet | 10 KB gzipped per page |
| Script | 6 KB gzipped per public page, counting everything the page reaches |
| Image | 80 KB each, for every image a page names |
| Video | 1.5 MB each |
| Text contrast | 4.5:1 |

Fonts have no limit; the test reports them (a first visit loads two files, about 148 KB).
`/members` is not a public page: it loads the Firebase packages and is kept out of search engines.

## Tests

```sh
pnpm install --frozen-lockfile && pnpm build      # the site tests read dist/
node --test "tests/site/*.test.mjs" tests/team/model.test.mjs tests/portal/limits.test.mjs tests/portal/managed.test.mjs tests/portal/preview.test.mjs
node tests/team/roster.test.mjs && node tests/portal/bundle.test.mjs
python3 -m unittest discover -s tests/sync && python3 -m unittest discover -s tests/scholar
```

The security rules of the portal have tests of their own, which need the Firebase CLI and
Java 21:

```sh
pnpm --dir tests/rules install
firebase emulators:exec --only firestore --project demo-members "node --test tests/rules"
```

What the site tests hold, by file in `tests/site/`: `budget` (the limits above, and the head of
every page), `contrast`, `nojs` (nothing is hidden without a script, nothing moves under reduced
motion), `tokens` (retired names stay out), `sitemap` (the sitemap and `robots.txt`),
`publications`, `feed`, `team`, `research`, `contact`.

## Release

- A push to `main` runs `deploy.yml`: build, then publish to GitHub Pages. It takes two to three
  minutes. A build that fails publishes nothing, and the site stays as it was.
- A push to any other branch runs `ci.yml`: the same build, and nothing is published.
- Two jobs also commit to `main`: the publications job every four hours, and the team-cards job
  whenever it runs. Run `git pull --ff-only` before you commit there.
- To undo a release, revert its commit and push: the previous site is built again.

## Pictures and video made by hand

Nothing in the build makes these; each is made once and committed.

**The hero video** (`public/botanical/wheat_hero.webm` and `.mp4`, about 1.4 MB each). From the
4K original, which is not in the repository (`assets/` is ignored; `assets/assets.list` names the
sources), the whole loop at 1280 x 720:

```sh
ffmpeg -i SRC -vf "scale=1280:720:flags=lanczos,fps=24" -an -c:v libsvtav1 -preset 4 -crf 45 -g 240 -pix_fmt yuv420p wheat_hero.webm
ffmpeg -i SRC -vf "scale=1280:720:flags=lanczos,fps=24" -an -c:v libx264 -preset slow -b:v 780k -maxrate 1200k -bufsize 2400k -pix_fmt yuv420p -movflags +faststart -pass 2 wheat_hero.mp4   # after the same line with -pass 1 -f null /dev/null
```

The poster that shows before the video plays is a frame of it, `src/assets/hero/poster.jpg`; the
build turns it into three AVIF files.

**The research pictures** are the three files in `src/assets/research/`. The build makes the small
WebP files the page shows, so a new picture only has to replace its file.

**The contact map** is drawn from OpenStreetMap tiles by `node scripts/contact-map.mjs`, which
reads the point and the zoom from `site.map` in `src/site.config.ts` and writes three files into
`src/assets/contact/`. Run it after a change of the point; a test fails until the picture
matches.

**The social image** (`public/og.jpg`, 1200 x 630 px, the picture a shared link to the site
shows) is a screenshot of `design/social/card.html`, a page of exactly that size with the site's
typefaces and the hero photograph. To make it again after a change of that page:

```sh
python3 -m http.server 4330 --bind 127.0.0.1     # in the repository root; stop it afterwards
playwright-cli -s=card open http://127.0.0.1:4330/design/social/card.html
playwright-cli -s=card run-code "async page => { await page.setViewportSize({ width: 1200, height: 630 }); await page.goto('http://127.0.0.1:4330/design/social/card.html'); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: '/tmp/card.png' }); }"
playwright-cli -s=card close
node scripts/social-image.mjs /tmp/card.png      # writes public/og.jpg at the highest quality within 80 KB
```

Any other way to take a screenshot of that page at 1200 x 630 px serves as well. The text stays
inside the middle 630 px, so an application that crops the picture to a square shows all of it.
With `?bare` after the address the page leaves the text out; measured against that picture, the
text reads 6.95:1 at its worst point.

## The members portal on your machine

Without `src/data/firebase-config.json` the page `/members` builds and says "not configured";
the public site does not need it. To try the portal, run it against the Firebase emulators
(Firebase CLI and Java 21):

```sh
firebase emulators:start --only auth,firestore --project demo-members
# make the test admin an admin (the header lets the request pass the security rules):
curl -X PATCH -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  "http://127.0.0.1:8180/v1/projects/demo-members/databases/(default)/documents/config/access" \
  -d '{"fields":{"admins":{"arrayValue":{"values":[{"stringValue":"admin@example.org"}]}}}}'
PUBLIC_FIREBASE_EMULATOR=1 pnpm dev
```

`http://localhost:4321/members/` then shows two extra buttons, "Test member" and "Test admin",
which sign in without a password. Nothing leaves your machine.

## Kept on purpose

- `src/components/TopoCanvas.astro`, `PhyloCanvas.astro` and their two engines, and three pictures
  in `public/botanical/` (`phylogenetic_tree.jpg`, `wheat_ai_1.jpg`, `wheat_field_sku.jpg`): no
  page uses them. They are kept by a decision of November 2026, not by oversight. The package
  `simplex-noise` is there for the two engines.
- `design/picker/`: the tool the design was chosen with. Its `build.py` read the pages as they
  were before the design was applied and stops with an error now; its README says how to build it
  again.
