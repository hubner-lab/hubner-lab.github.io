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

Each team member has a file in `src/content/team/`. Open an existing file to see the format.

**Example:** `src/content/team/jane-doe.md`

```markdown
---
name: Jane Doe
role: PhD Student
order: 3          # controls sort order (lower = shown first)
alumni: false     # set to true when they leave the lab
email: jane@migal.org.il
orcid: 0000-0001-2345-6789
scholar: GOOGLE_SCHOLAR_ID
photo: jane-doe.jpg    # place the file in public/team/
---
Short bio paragraph (1–3 sentences). Appears on the team card.
```

**To add a photo:** place the image file in `public/team/` (JPG or PNG, ideally square, 300×300px minimum) and set `photo: filename.jpg` in the frontmatter.

**To mark someone as alumni:** change `alumni: false` to `alumni: true`. They will move to the Alumni section.

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
| Team members | `src/content/team/*.md` |
| Team photos | `public/team/*.jpg` |
| Publications (auto) | `src/data/publications.json` |
| Research text | `src/pages/research.astro` |
| Contact info | `src/pages/contact.astro` |
