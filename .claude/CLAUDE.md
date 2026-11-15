## Git / Deployment

- **One repository, two remote names.** `hubnerlab` and `origin` both point to `git@github.com:hubner-lab/hubner-lab.github.io.git`. `origin` is an alias of `hubnerlab`; it exists because the lanes tool lands through a remote of that name.
- Never add a remote that points anywhere else (the retired private repository included).
- All commits push to that repository: `git push hubnerlab main`
- A push to `main` triggers the GitHub Actions deploy to the live site (`hubner-lab.github.io`)
- Two bots also commit to `main` (`scholar.yml` every four hours, `members-sync.yml`): run `git pull --ff-only hubnerlab main` before committing.

## Active Obsidian Project
- Project: HubnerLabWebSite
- File: ~/Orthidian/projects/HubnerLabWebSite/HubnerLabWebSite.md

## Browser / Playwright Hygiene
- Always run `playwright-cli close` after every task that uses it (with the same `-s=<name>` when the session was named).
- Never leave Chromium running after inspection/screenshot is done.
- After any playwright work, verify: `ps aux | grep ms-playwright | grep -v grep` — kill stragglers with `pkill -f "ms-playwright/chromium"`.
- **In a lane, or while lanes run in other worktrees: never `pkill`.** Stop only what you started: `playwright-cli -s=<your lane> close`, or the pid you launched.

## Dev Server Hygiene
- Run **one** dev server instance at a time (`pnpm dev`, default port 4321). Port 4321 belongs to the main checkout; a lane uses its own port.
- If multiple instances needed for A/B testing: kill all when done (`pkill -f "astro.mjs"`).
- Before starting: `ps aux | grep astro | grep -v grep` — kill any stale instances first.
- **In a lane, or while lanes run in other worktrees: never `pkill`.** Stop only the dev server and the emulators you started, by pid.
