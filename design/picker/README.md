# Hubner Lab design picker

A single page, published as a Claude Artifact, where the owner chooses one variant per visual
element of the lab website. Every variant is a live HTML mock-up built from the site's real
people, papers, news and copy. The picks save by themselves and are read back later to apply the
chosen design in a separate plan. Nothing here is read by the site build.

Artifact URL: https://claude.ai/artifact/4z6p9wbSWPPuGRAYtm9Ysm (private; share it from the page's Share menu)

## What is in it

- `#pick` (default): every choice with its variants, a one-line note on what is wrong today, a
  rationale per variant, a "Suggested" mark, a note box, and a summary with "Copy choices".
- `#preview`: whole pages assembled from the current picks, at desktop or phone width, dark or
  light. A choice that is not decided yet shows its suggested variant; the summary says which
  choices are decided.
- Six foundations apply to every mock-up at once: palette, default theme, typeface pairing,
  corners and buttons, brand motif, motion.
- Nineteen choices, three checklists. Elements: navigation (desktop, phone), home hero, home below the
  hero, section header, research pillars, study systems, person card, team layout, publication row,
  news, footer, contact page. Checklists: what a member card shows (with the no-photo fallback),
  publication tools, additions. The checklists drive the mock-ups: switching a card field or a
  publication tool off removes it from the cards, rows and preview pages.
- Preview pages: Home, Research, Team, Publications, News, Contact, assembled from the picks.

## Layout

```
build.py        reads the repo's content, resizes images, writes dist/picker.html and dist/preview.html
check.mjs       asserts size, script syntax, variant coverage, palette contrast and allowed hosts
src/head.html   title, viewport-fit meta, Google Fonts link (the ten confirmed families)
src/body.html   the page shell
src/chrome.css  the tool interface (its own neutral palette and Geist type, follows the viewer's theme)
src/mock.css    mock-up styles, driven only by CSS variables named like the site's future tokens
src/js/         00 core (registry, lists, tokens, stages, dot wordmark)  10 foundations  20 shared pieces
                30 navigation  40 hero  50 home and section header  51 research  52 team
                53 publications  54 news, footer, contact  55 checklists  60 preview  90 app
dist/           build output, git-ignored
```

A choice is a data entry, `registerChoice({ id, group, title, problem, views, variants })`, and the
rail, summary, saved document and `check.mjs` all iterate that list. A checklist is
`registerList({ id, bag, after, items, states })`. Adding an element means adding an entry; nothing
else needs wiring.

Mock-up tokens are set on each `.mk` element by `applyScope()` and never on `:root`, so a
foundation pick re-skins every stage without redrawing it. The picked palette can be pasted into the
site as `--color-paper`, `--color-surface`, `--color-ink`, `--color-muted`, `--color-line`,
`--color-link`, `--color-accent`, `--color-accent-ink`, `--color-leaf`.

## Rebuild and republish

The picker has done its work: the design chosen with it was applied to the site in November 2026.
`build.py` reads the site as it was before that: the markup of the home, Research and Contact
pages and of the footer, and five pictures in `public/botanical/` that have since moved or gone.
On the current tree it stops with an error. To build the picker again, check out the commit that
added it, for example in a worktree of its own, and run the two commands there:

```
git worktree add ../picker-build 73746cb
cd ../picker-build
python3 design/picker/build.py          # needs python3 and ImageMagick (magick)
node design/picker/check.mjs
```

To look at it locally, serve `dist/` on a free port of your own (`file:` URLs are blocked in
playwright-cli) and open `preview.html`; it is the same page inside a minimal skeleton.

Publish `dist/picker.html` with the Artifact tool: the page is the artifact body (no doctype, html,
head or body), it declares `capabilities: {db: {}, user: {}}` and icon word `palette`. Republish to
the same URL by passing it as `url` (read the artifact first after a `/clear`).

## Saved document

One database document, `choices/main`:

```
{ v: 1,
  foundations: { palette, theme, type, corner, motif, motion },   // only decided choices appear
  elements:    { navDesktop, navPhone, hero, homeBelow, sectionHeader, ... },
  cardFields: [], pubTools: [], additions: [],   // "itemId:state" for items the owner touched
  cardFallback: '',                              // 'initials' | 'pattern' once chosen
  notes: { <choice id>: text },
  decided: { <choice id>: true },                                  // an explicit pick, never a default
  updatedAt: ISO string }
```

Untouched checklist items show their default (the defaults are in `src/js/55-lists.js`).
Read it with `ArtifactData` (`get` on `choices/main`). A choice missing from `decided` was never
picked by the owner; do not read its suggested variant as a decision. Writes are debounced, one at
a time and only on change. `localStorage` keeps a per-browser copy, and "Copy choices" produces the
same JSON plus a readable summary when the page cannot save.

## Content numbers

`build.py` takes every number from the data it reads, so they follow the scholar bot's refreshes.
On 2026-11-15 that was 60 publications, 4,716 citations, 2009 to 2026, 7 bioRxiv preprints, up to
89 authors on one paper and 12 entries without a venue.
