# Members portal: admin guide

For the two admins of the lab website. A member writes their own card at `/members`; nothing is public until an admin approves it. The site never reads Firebase: a job copies approved cards into this repository, and the Team page is built from those files (`docs/members-sync.md`).

## Who is an admin

- The Firestore document `config/access`, field `admins`: an array of sign-in addresses, all lowercase. It can be edited only in the Firebase console; the portal has no screen for it.
- You are treated as an admin when your signed-in address is verified and is in that list. A Google sign-in is verified. An email-and-password account is not, so admins sign in with Google.
- The admin addresses are kept out of this repository on purpose. Do not write them into a file, a commit message or an issue.
- "Publish now" needs write access to the GitHub repository for both admins.

## The queue

Open `https://hubner-lab.github.io/members`, sign in, and choose the tab "Admin queue". The tab appears only for an admin. Pending cards come first, then the most recently changed.

Open a row to see:

- The account behind the card: its address, the sign-in provider and whether the address is verified. This is the only check on who wrote the card, so read it before approving. "NOT verified" means an email-and-password account whose address was never confirmed.
- What would change: every field against the copy that is live, or the whole card when nothing is published yet.
- The photo.

## What you can do

- **Approve** publishes the card as it is now, with its photo. If the member changed the card after you opened the row, the approval stops and the list reloads: read it again. On a card that is already approved the button reads "Re-publish".
- **Request changes** needs a note. The member sees the note on their page; the live card, if there is one, stays as it is.
- **Edit** changes any field before you approve. Only here can a card get the group "Principal investigator", a pinned order (0-9999; pinned people come first inside their group) and a slug.
- **Unpublish** takes the card off the Team page at the next update and puts it back to draft. The member can submit it again.
- **Reject and delete** removes the card, its photo and any live copy. It cannot be undone.

A member can also take their own live card down. Every later edit by a member needs your approval again; until then the live card stays unchanged.

## The slug

The slug is the card's file name in the repository (`src/content/team/<slug>.md`). It is derived from the name at the first approval and never changes afterwards.

- A card whose slug equals the file of a hand-written entry replaces that entry. This is how the people already on the Team page move to the portal: `sariel-hubner`, `dana-sisou`, and so on.
- If the member spells their name differently from the existing file name, the slug differs and the person appears twice. Before the first approval, open "Edit" and type the existing file name (without `.md`) into "Slug".
- Two published cards can never share a slug; the portal refuses the second one.

## When the Team page updates

Approving a card does not change the site by itself. The job "Sync team cards from the members portal" copies approved cards into the repository and deploys the site.

- "Publish now" in the queue opens that job on GitHub; press "Run workflow" there. A minute or two later the card is live.
- Until the hourly schedule is switched on (see "Scheduling" in `docs/members-sync.md`), this manual run is the only way a card reaches the site.
- With the schedule on, a card appears within the hour by itself. If an approved card has waited more than 90 minutes, the queue shows a warning: open the job and look at its last run.
- The member's page says "Approved and live" once the site has the card.

## A member without a Google account

1. Firebase console, Authentication, Sign-in method: enable "Email/Password" (once).
2. Authentication, Users, "Add user": the member's address and a first password. Tell them both in person.
3. The member signs in with the email and password form at `/members`. There is no sign-up and no password reset on the page; set a new password in the console when one is forgotten.

Such an account shows "NOT verified" in the queue. That is expected for a member and can never make an admin.

## When the sync job is red

The details are in `docs/members-sync.md`, "When a run is red". In short:

- **A red `flag-skipped` job**: one card failed the checks and was left out; everyone else was updated. The warning names the card and the reason. Fix the card with "Edit" or ask the member, approve again, run the job again.
- **"0 published cards while N synced file(s) exist"**: the job never empties the Team page by itself. If the last portal card was taken down on purpose, run the job by hand with `allow_shrink` ticked. If not, look at the `published` collection in the Firebase console before doing anything.
- **"N synced cards would be removed (limit 2)"**: the same question on a larger scale. Tick `allow_shrink` only when the removals are intended.
- **"Members sync failed"**: Firestore could not be reached. Nothing was written; run it again later.

A red run never damages the live site: the previous deployment stays in place.

## What is stored where

- Firebase (Spark plan, free): the working copies of the cards and photos, the published copies, and the admin list. If the free daily quota is used up, only the portal and the sync pause; the public site is not affected.
- This repository: every published card as a file, and the photos. An approved card is public and stays in the repository's public history even after it is taken down.
- The security rules are in `firebase/firestore.rules`. The copy in the Firebase console (Firestore, Rules) is the one that is enforced: after changing the file, run its tests and paste it there again. The tests need the Firebase CLI and Java 21: `pnpm --dir tests/rules install`, then `firebase emulators:exec --only firestore --project demo-members "node --test tests/rules"`.
