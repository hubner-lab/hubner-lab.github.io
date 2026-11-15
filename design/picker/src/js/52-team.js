/* ==========================================================================
   Team page: person card and team layout. Real members only carry what the
   repo holds today (name, role, bio, whether an email or Scholar id exists).
   Samples are marked "sample"; photo placeholders are neutral boxes.
   ========================================================================== */
'use strict';

function trunc(t, n) { if (t.length <= n) return t; const c = t.slice(0, n); return c.slice(0, c.lastIndexOf(' ')) + '...'; }

function cardGrid(ctx, people, cols) {
  const k = ctx.picks.personCard;
  return '<div class="mk-cards" style="--cols:' + (cols || 3) + '">' + people.map((p) => personCardHtml(ctx, k, p)).join('') + '</div>';
}

function alumniList(people) {
  return '<ul class="mk-alumni">' + people.map((p) => '<li><span class="mk-prow__t" style="font-weight:500">' + esc(p.name) + '</span> <span class="mk-muted">' + esc(p.role) + '</span></li>').join('') + '</ul>';
}

function teamHtml(ctx, key) {
  const all = realPeople();
  const pi = all.filter((p) => p.group === 'pi');
  const current = all.filter((p) => !p.alumni && p.group !== 'pi');
  const alumni = all.filter((p) => p.alumni);
  const h3 = (t, n) => '<h3 class="mk-h" style="font-size:24px;display:flex;align-items:baseline;gap:10px">' + t + (n ? '<span class="mk-date">' + n + '</span>' : '') + '</h3>';
  if (key === 'B') {
    const groups = [['Principal investigator', pi], ['PhD and graduate students', current.filter((p) => p.group === 'phd')], ['Staff', current.filter((p) => p.group === 'staff')], ['Undergraduate students', current.filter((p) => p.group === 'undergrad')]];
    return '<div class="mk-stack" style="gap:40px">' + groups.filter((g) => g[1].length).map((g) => '<div class="mk-stack" style="gap:16px">' + h3(g[0], g[1].length) + cardGrid(ctx, g[1], 3) + '</div>').join('') +
      '<div class="mk-stack" style="gap:12px">' + h3('Alumni', alumni.length) + alumniList(alumni) + '</div></div>';
  }
  if (key === 'C') {
    const row = (p) => '<tr><td><b>' + esc(p.name) + '</b></td><td>' + esc(p.role) + (p.alumni ? ' (alumni)' : '') + '</td><td class="mk-muted">' + esc(p.bio ? trunc(p.bio.split('. ')[0], 96) : '') + '</td><td class="mk-muted">' + [p.email ? 'Email' : '', p.scholar ? 'Scholar' : ''].filter(Boolean).join(', ') + '</td></tr>';
    return '<div class="mk-tablewrap"><table class="mk-table"><thead><tr><th>Name</th><th>Role</th><th>Focus</th><th>Links</th></tr></thead><tbody>' + pi.concat(current).map(row).join('') + '</tbody><tbody class="is-alumni">' + alumni.map(row).join('') + '</tbody></table></div>';
  }
  const feat = pi.map((p) => '<article class="mk-card mk-feature">' + (fieldOn('cardFields', 'photo') ? avatarHtml(p, 96) : '') + '<div class="mk-stack" style="gap:6px"><p class="mk-eyebrow">Principal investigator</p><h3 class="mk-h mk-h2" style="font-size:30px">' + esc(p.name) + '</h3><p class="mk-text">' + esc(p.bio) + '</p>' + linkRow(p) + '</div></article>').join('');
  return '<div class="mk-stack" style="gap:36px">' + feat + '<div class="mk-stack" style="gap:16px">' + h3('Current members', current.length) + cardGrid(ctx, current, 3) + '</div>' +
    '<div class="mk-stack" style="gap:12px">' + h3('Alumni', alumni.length) + alumniList(alumni) + '</div></div>';
}

function teamSample(key) {
  return (ctx) => '<div class="mk-pad" style="padding:40px 48px"><div class="mk-wrap">' + teamHtml(ctx, key) + '</div></div>';
}

function cardSample(key) {
  return (ctx) => {
    const k = key;
    return '<div class="mk-pad" style="padding:32px"><div class="mk-cards" style="--cols:3;gap:14px">' + cardPeople().map((p) => personCardHtml(ctx, k, p)).join('') + '</div></div>';
  };
}

registerChoice({
  id: 'personCard',
  group: 'element',
  title: 'Person card',
  problem: 'Nobody has a photo today, so every avatar is one initial. Use the checklist and the no-photo fallback below the cards to decide what a card shows.',
  layout: 'wide',
  views: [{ w: 1100 }],
  affects: ['teamLayout'],
  variants: [
    { key: 'A', label: 'Compact horizontal', current: true, suggested: true, rationale: 'Avatar on the left, text on the right. Works with or without photos. Suggested until photos exist.', render: cardSample('A') },
    { key: 'B', label: 'Portrait photo card', flag: 'needs a photo per member', rationale: 'A large square photo over the text. The strongest look, but it only works once every current member has a photo.', render: cardSample('B') },
    { key: 'C', label: 'Label card', rationale: 'A specimen-label card with no photo at all: labelled rows in the data font. Suits the herbarium and data-lab voices.', render: cardSample('C') },
  ],
});

registerChoice({
  id: 'teamLayout',
  group: 'element',
  title: 'Team layout',
  problem: 'The PI is found by the number 1 in a data file, current members and alumni sit in one flat grid, and nothing shows who is a student and who is staff.',
  layout: 'wide',
  views: [{ w: 1200 }],
  variants: [
    { key: 'A', label: 'PI feature, grid and alumni list', current: true, rationale: 'The current page: the PI on top, a grid of members, a list of alumni below.', render: teamSample('A') },
    { key: 'B', label: 'Grouped by role with headings', suggested: true, rationale: 'Students, staff and undergraduates under their own headings. A visitor sees how the lab is made up and which role to ask about.', render: teamSample('B') },
    { key: 'C', label: 'Directory table', rationale: 'One row per person with role, focus and links. Dense and quick to scan, with no photos and the least personality.', render: teamSample('C') },
  ],
});
