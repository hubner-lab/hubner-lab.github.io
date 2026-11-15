# Content guide for Hübner Lab website

This guide covers the three things you'll edit most: news posts, team members, and publications.
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
summary: One-sentence description shown on the news listing page.
---

Full text of the post goes here. Standard Markdown works: **bold**, *italic*,
[links](https://example.com), bullet lists, etc.
```

The `summary` line appears on the news index and on the home page teaser. Keep it under 120 characters.

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
alumni: false     # true moves the person to the Alumni section
order: 3          # optional: pins the position inside the group (lower = first)
email: jane@example.org
orcid: 0000-0001-2345-6789
scholar: GOOGLE_SCHOLAR_ID
photo: ../../assets/team/jane-doe.jpg
---
Short bio paragraph (1–3 sentences). Appears on the team card.
```

**To add a photo:** place a square JPG (640×640 px is what the portal produces) in
`src/assets/team/` and point `photo:` at it as in the example. The old `public/team/` folder is no
longer read.

A key the site does not know, or a photo file that is missing, stops the build with an error, so a
typo cannot go live unnoticed. The previous version of the site stays online until it is fixed.

---

## Publications

Publications are updated automatically every day from Google Scholar via a scheduled GitHub Action.
You should not need to edit `src/data/publications.json` manually.

If you need to trigger an immediate update:
1. Go to the repository on GitHub
2. Click **Actions** → **Update publications from Google Scholar**
3. Click **Run workflow**

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
| Research text | `src/pages/research.astro` |
| Contact info | `src/pages/contact.astro` |
