# Content guide for Hübner Lab website

This guide covers what you will edit most: news posts, team members, publications, and the facts
the pages share (contact, affiliations, funders, the "Join us" block).
No code knowledge required — everything is plain text files.

---

## Adding a news post

Create a file in `src/content/news/` named `YYYY-MM-DD-short-title.md`.

**Example:** `src/content/news/2026-09-01-new-paper-barley.md`

```markdown
---
title: New paper on barley adaptation published in Nature Plants
date: 2026-09-01
tags: [publication, barley, adaptation]
summary: One sentence about the post.
---

Full text of the post goes here. Standard Markdown works: **bold**, *italic*,
[links](https://example.com), headings, bullet lists, quotes, tables, etc.
```

- The post gets its own page; the file name is its address (`/news/2026-09-01-new-paper-barley/`).
- The `summary` is the line under the title in three places: the "Latest" list on the home page,
  the News page, and the RSS feed (`/rss.xml`). One sentence, under 120 characters, reads best.
  Without a summary the post is listed by its title alone.
- The `date` decides the order and is the day the lists show. The `tags` appear as small labels
  on the post's page.

### New papers appear in the news by themselves

You do not write a post for a new paper. When the publications job (below) lists a paper for the
first time, it notes the day in `src/data/publications-seen.json`. From then on the paper stands
as "New paper" on the News page, in the "Latest" list of the home page and in the RSS feed, with
that day.

- The home page shows six rows: the newest news posts and new papers together and, while these
  are fewer than six, the most recent of the other papers.
- To take a paper out of the news, replace its day in `src/data/publications-seen.json` by `null`.
  The job never changes an entry that is already in the file. The paper stays on the
  Publications page.

---

## Updating team members

Team members write their own cards in the members portal: <https://hubner-lab.github.io/members>.

1. The member signs in (Google, or an email and password account that an admin created), fills in
   the card, adds a photo and presses **Submit for approval**.
2. An admin opens the **Admin queue** tab on the same page and approves the card
   (`docs/members-admin.md`).
3. The job "Sync team cards from the members portal" copies the approved card into this repository
   and the site rebuilds. **Publish now** in the admin queue starts that job at once.

A file in `src/content/team/` with a `uid:` line belongs to the portal. Do not edit it by hand: the
next sync overwrites the edit. Change the card in the portal instead. The same holds for the photos
in `src/assets/team/`.

**To mark someone as alumni:** the member (or an admin, with "Edit") ticks "I have left the lab" on
the card. They move to the Alumni section after the next approval.

### What the Team page shows

- **Current members**: one card per person, the principal investigator first. A card shows the
  photo, the name, the role, the bio in full, the research interests, the links (email, ORCID,
  Google Scholar, GitHub, website, LinkedIn) and "Since 2023" from the year the person joined.
  Whatever is not filled in is left out. Without a photo the card shows the person's two initials.
- **Alumni**: a list of names, each with the role, the years and the current position, for
  example `PhD Student, 2019–2022 · now: Postdoc, Example University`.

### People who will not use the portal

Alumni, and anyone else who does not keep their own card, are kept by an admin in the portal: the
group **People without an account** of the **Admin queue** tab. The admin adopts an existing
hand-written entry or adds a person, fills in the record (with "Left the lab", the years and the
current position for alumni, and a photo if wanted) and publishes it. The record reaches the site
like a member's card. See "People without an account" in `docs/members-admin.md`.

### Hand-written entries

A file written by hand stays possible, for someone nobody keeps in the portal. A file without `uid:`
is never touched by the sync, unless a portal card or record with the same file name is published
later; that card then replaces it.

**Example:** `src/content/team/jane-doe.md`

```markdown
---
name: Jane Doe
role: PhD Student
group: phd        # pi, postdoc, phd, grad, msc, staff, undergrad or visitor
alumni: false     # true moves the person to the Alumni list
order: 3          # optional: pins the position inside the group (lower = first)
interests: [wild barley, local adaptation]
email: jane@example.org
orcid: 0000-0001-2345-6789
scholar: GOOGLE_SCHOLAR_ID        # the value after "user=" in the profile link
github: janedoe                   # the user name
linkedin: jane-doe                # the part after "/in/"
website: https://example.org      # a whole address, starting with https://
yearJoined: 2023
photo: ../../assets/team/jane-doe.jpg
---
Short bio paragraph (1–3 sentences). The card shows it in full.
```

Only `name`, `role` and `group` are required. For someone who has left, set `alumni: true` and,
where known, `yearLeft: 2025` and `currentPosition: Postdoc, Example University`: the Alumni list
shows them after the role.

**To add a photo:** place a square JPG (640×640 px is what the portal produces) in
`src/assets/team/` and point `photo:` at it as in the example. The old `public/team/` folder is no
longer read.

A key the site does not know, or a photo file that is missing, stops the build with an error, so a
typo cannot go live unnoticed. The previous version of the site stays online until it is fixed.

---

## Publications

Publications are updated automatically from Google Scholar by a scheduled GitHub Action that runs
every four hours. Google Scholar turns away about two attempts in three, so a new paper usually
arrives within a day. You should not need to edit `src/data/publications.json` manually.

If you need to trigger an immediate update:
1. Go to the repository on GitHub
2. Click **Actions** → **Update publications from Google Scholar**
3. Click **Run workflow**

**Lab members in bold.** In an author list the page prints in bold everyone who is on the Team
page, current or former. An author who was a lab member and is not on the Team page gets bold
when the name is added to `labAuthors` in `src/site.config.ts`, spelled as the papers spell it:

```ts
labAuthors: ['Jane Doe'],
```

---

## Facts the pages share

One file holds what several pages print: `src/site.config.ts`. Change a value there and every
page follows.

| What | Where in the file | Where it shows |
|---|---|---|
| The PI's name, title and email | `pi` | Contact page, footer |
| The postal address | `address` | Contact page (with a "Copy" button) |
| The two institutes | `affiliations` | hero of the home page, footer, Contact page |
| Funders | `funders` | footer, beside the institutes |
| The "Join us" block | `joinUs` | home page and Contact page |
| Lab members who are not on the Team page | `labAuthors` | bold names on the Publications page |
| The place on the map | `map` | Contact page |
| The pages of the navigation | `nav` | top bar, phone menu, footer |

**To add funders:** fill the list. The footer's column then reads "Affiliations and funding".

```ts
funders: [
  { name: 'Example Foundation', url: 'https://example.org' },
],
```

**To switch the "Join us" block on:** write the lab's own wording into `title` and `text` (what
stands there is a draft), then set `enabled: true`. The block appears at the end of the home page
and of the Contact page. `enabled: false` hides it again.

**To move the map:** change `lat` and `lon` (and `osmUrl`, the link the map opens) under `map`,
then run `node scripts/contact-map.mjs` and commit the three files it writes into
`src/assets/contact/`. The map is a picture, so it does not follow the numbers by itself; the
tests fail until the picture matches.

---

## Research and home page texts

- **Research page**: the text of the three themes is in `src/pages/research.astro`; their pictures
  are the three files in `src/assets/research/` (replace a file to change a picture).
- **Study systems**: the list `systems` at the top of `src/pages/research.astro`. A species is one
  line with its common name and its Latin name, which the page prints in italics:

  ```ts
  { name: 'Sunflower', latin: 'Helianthus annuus' },
  ```

- **Home page**: the title, the line under it and the two buttons are in
  `src/components/Hero.astro`; the mission paragraph is in `src/pages/index.astro`.

---

## Deploying changes

Any change pushed to the `main` branch on GitHub automatically triggers a rebuild and deploy
to GitHub Pages (usually takes 2–3 minutes). You can push changes directly via the GitHub web
editor by clicking the pencil icon on any file.

---

## File locations at a glance

| What | Where |
|---|---|
| News posts | `src/content/news/*.md` |
| Team members | the members portal; files in `src/content/team/*.md` |
| Team photos | `src/assets/team/*.jpg` |
| Portal and sync guides | `docs/members-admin.md`, `docs/members-sync.md` |
| Publications (auto) | `src/data/publications.json` |
| The day each paper was first listed (auto) | `src/data/publications-seen.json` |
| Contact, affiliations, funders, "Join us", lab authors, map point | `src/site.config.ts` |
| The map picture | `src/assets/contact/`, drawn by `scripts/contact-map.mjs` |
| Research text and study systems | `src/pages/research.astro` |
| Research pictures | `src/assets/research/` |
| Home page texts | `src/components/Hero.astro`, `src/pages/index.astro` |
| The picture a shared link shows | `public/og.jpg` (how to remake it: `README.md`) |
| Filling the first-seen days from history | `scripts/backfill_seen.py` |
