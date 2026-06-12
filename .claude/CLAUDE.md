## Git / Deployment

- **Only remote is `hubnerlab`** → `git@github.com:hubner-lab/hubner-lab.github.io.git`
- All commits push to `hubnerlab` remote: `git push hubnerlab main`
- `PotapenkoEugene/HubnerLabWebSite` remote (`origin`) has been removed — do not re-add it
- Push to `hubnerlab` triggers GitHub Actions deploy to the live site (`hubner-lab.github.io`)

## Active Obsidian Project
- Project: HubnerLabWebSite
- File: ~/Orthidian/projects/HubnerLabWebSite.md

## Browser / Playwright Hygiene
- Always run `playwright-cli close` after every task that uses it.
- Never leave Chromium running after inspection/screenshot is done.
- After any playwright work, verify: `ps aux | grep ms-playwright | grep -v grep` — kill stragglers with `pkill -f "ms-playwright/chromium"`.

## Dev Server Hygiene
- Run **one** dev server instance at a time (`pnpm dev`, default port 4321).
- If multiple instances needed for A/B testing: kill all when done (`pkill -f "astro.mjs"`).
- Before starting: `ps aux | grep astro | grep -v grep` — kill any stale instances first.
