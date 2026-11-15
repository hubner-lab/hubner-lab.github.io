/* ==========================================================================
   News, footer and contact.
   ========================================================================== */
'use strict';

/* ---- news ------------------------------------------------------------------ */

function newsHtml(ctx, key) {
  const n = SITE.news[0];
  const head = secHead(ctx, { eyebrow: 'News', title: 'From the lab', note: 'Announcements and new papers.' });
  let body;
  if (key === 'B') {
    const auto = SITE.papers.first.slice(0, 3);
    const rows = [{ kind: 'News', date: fmtDate(n.date), title: n.title, text: n.summary }]
      .concat(auto.map((p) => ({ kind: 'New paper', auto: true, date: String(p.year), title: p.title, text: (p.venue ? p.venue + '. ' : '') + authorLine(p.authors, 2, { bold: false }).replace(/<[^>]+>/g, '') })));
    body = '<div>' + rows.map((r) => '<div class="mk-prow" style="grid-template-columns:110px minmax(0,1fr) auto"><span class="mk-date">' + esc(r.date) + '</span><div><span class="mk-kind">' + r.kind + '</span>' + (r.auto ? ' <span class="mk-draft">added automatically</span>' : '') +
      '<div class="mk-prow__t">' + esc(r.title) + '</div><div class="mk-prow__m">' + esc(r.text) + '</div></div><span></span></div>').join('') + '</div>';
  } else {
    body = '<div class="mk-grid3">' + newsCard(n) + '</div>';
  }
  return '<div class="mk-stack" style="gap:24px">' + head + body + '</div>';
}

registerChoice({
  id: 'news',
  group: 'element',
  title: 'News',
  problem: 'News is one card for a launch announcement; a new paper is never announced, so the page is stale while the lab keeps publishing.',
  layout: 'two',
  views: [{ w: 900 }],
  variants: [
    { key: 'A', label: 'Cards', current: true, rationale: 'The current cards, one per post. Looks good with three or more posts and thin with one.', render: (ctx) => '<div class="mk-pad" style="padding:40px"><div class="mk-wrap">' + newsHtml(ctx, 'A') + '</div></div>' },
    { key: 'B', label: 'Dated list', suggested: true, rationale: 'A dated list that also takes automatic "new paper" items when the Scholar feed finds one. The page stays current without anyone writing a post.', render: (ctx) => '<div class="mk-pad" style="padding:40px"><div class="mk-wrap">' + newsHtml(ctx, 'B') + '</div></div>' },
  ],
});

/* ---- footer ---------------------------------------------------------------- */

function footerHtml(ctx, key) {
  const f = SITE.copy.footer, c = SITE.copy.contact;
  if (key === 'B') {
    return '<footer class="mk-foot mk-foot--line"><span class="mk-wm" style="font-size:17px">Hübner Lab</span><span>' + f.affiliations.slice(0, 2).map(esc).join(' &middot; ') + '</span><span style="color:var(--color-link)">' + esc(c.email) + '</span><span>&copy; 2026</span></footer>';
  }
  if (key === 'C') {
    const mission = SITE.copy.mission.title;
    return '<footer class="mk-foot mk-foot--full"><div class="mk-foot__stmt"><p class="mk-h" style="font-size:30px;max-width:22ch">' + esc(mission) + '</p></div>' +
      '<div><p class="mk-eyebrow" style="margin-bottom:10px">Contact</p><p>' + f.lines.map(esc).join('<br>') + '<br><span style="color:var(--color-link)">' + esc(c.email) + '</span></p></div>' +
      '<div><p class="mk-eyebrow" style="margin-bottom:10px">Affiliations</p><div class="mk-row" style="gap:10px;margin-bottom:10px"><div class="mk-ph" style="aspect-ratio:2/1;width:84px;font-size:10px">logo</div><div class="mk-ph" style="aspect-ratio:2/1;width:84px;font-size:10px">logo</div></div><p>' + f.affiliations.map(esc).join('<br>') + '</p></div>' +
      '<div class="mk-foot__base" style="grid-column:1/-1"><span>&copy; 2026 Hübner Lab. All rights reserved.</span></div></footer>';
  }
  return footerThree(ctx);
}

registerChoice({
  id: 'footer',
  group: 'element',
  title: 'Footer',
  problem: 'The footer repeats the address twice (contact and affiliations) and links to the framework the site is built with, which no visitor needs.',
  layout: 'wide',
  views: [{ w: 1200 }],
  variants: [
    { key: 'A', label: 'Three columns', current: true, suggested: true, rationale: 'Contact, explore and affiliations in three columns, with the framework link dropped and the duplicate address merged.', render: (ctx) => footerHtml(ctx, 'A') },
    { key: 'B', label: 'One line', rationale: 'Name, affiliations, email and year on a single line. The quietest footer and the least information.', render: (ctx) => footerHtml(ctx, 'B') },
    { key: 'C', label: 'Full: statement, contact, affiliations', rationale: 'A one-line statement of the lab\'s work, then contact and affiliations with room for institute logos.', render: (ctx) => footerHtml(ctx, 'C') },
  ],
});

/* ---- contact ---------------------------------------------------------------- */

function contactDetails() {
  const c = SITE.copy.contact;
  const pi = SITE.people.find((p) => /principal/i.test(p.role)) || { name: 'Sariel Hübner' };
  return '<div class="mk-stack" style="gap:20px"><div><p class="mk-eyebrow" style="margin-bottom:6px">Principal investigator</p><p class="mk-h" style="font-size:24px">' + esc(pi.name) + '</p><p class="mk-muted">' + esc(c.piTitle) + '</p></div>' +
    '<div><p class="mk-eyebrow" style="margin-bottom:6px">Email</p><p class="mk-copyline"><span style="color:var(--color-link)">' + esc(c.email) + '</span><span class="mk-copy">Copy</span></p></div>' +
    '<div><p class="mk-eyebrow" style="margin-bottom:6px">Address</p><address style="font-style:normal;color:var(--color-muted);line-height:1.8">' + c.address.map(esc).join('<br>') + '</address></div>' +
    '<div><p class="mk-eyebrow" style="margin-bottom:6px">Links</p><div class="mk-links2" style="font-size:15px"><span>Google Scholar</span><span>Migal Institute</span><span>Tel-Hai College</span></div></div></div>';
}
function mapBox(h) {
  return '<div><div class="mk-card mk-map im-map" style="height:' + h + 'px"></div><p class="mk-cap">Static map image. Today it is centred on the wrong place; the new one is re-centred on the institute.</p></div>';
}

function contactHtml(ctx, key) {
  const head = '<div class="mk-stack" style="gap:8px;margin-bottom:34px"><p class="mk-eyebrow">Contact</p><h1 class="mk-h mk-h1">Get in touch</h1></div>';
  let body;
  if (key === 'B') {
    body = mapBox(300).replace('<div>', '<div style="margin-bottom:28px">') + contactDetails().replace('mk-stack" style="gap:20px"', 'mk-grid2" style="gap:24px"');
  } else if (key === 'C') {
    const c = SITE.copy.contact;
    body = '<div class="mk-grid3">' +
      '<article class="mk-card mk-pillar"><p class="mk-eyebrow">Write</p><h3 class="mk-h mk-h3">Email the PI</h3><p class="mk-copyline"><span style="color:var(--color-link)">' + esc(c.email) + '</span><span class="mk-copy">Copy</span></p></article>' +
      '<article class="mk-card mk-pillar"><p class="mk-eyebrow">Visit</p><h3 class="mk-h mk-h3">Migal, Kiryat Shmona</h3><p style="color:var(--color-muted)">' + c.address.map(esc).join('<br>') + '</p></article>' +
      '<article class="mk-card mk-pillar"><p class="mk-eyebrow">Join<span class="mk-draft">draft copy</span></p><h3 class="mk-h mk-h3">Students and postdocs</h3><p>We welcome enquiries from people interested in plant genomics. Write to the PI to start a conversation.</p></article></div>' +
      '<div style="margin-top:20px">' + mapBox(220) + '</div>';
  } else {
    body = '<div class="mk-grid2" style="gap:44px">' + contactDetails() + mapBox(300) + '</div>';
  }
  return '<div class="mk-wrap">' + head + body + '</div>';
}

registerChoice({
  id: 'contact',
  group: 'element',
  title: 'Contact page',
  problem: 'The static map is centred on the wrong place, and the email is the only way to act: there is no sign of who to write to about what.',
  layout: 'wide',
  views: [{ w: 1200 }],
  variants: [
    { key: 'A', label: 'Two columns', current: true, suggested: true, rationale: 'Details on the left, map on the right, as now, with the map re-centred and the address copyable.', render: (ctx) => '<div class="mk-pad" style="padding:48px">' + contactHtml(ctx, 'A') + '</div>' },
    { key: 'B', label: 'Map first', rationale: 'The map across the top, details beneath. Good for visitors who need to find the building.', render: (ctx) => '<div class="mk-pad" style="padding:48px">' + contactHtml(ctx, 'B') + '</div>' },
    { key: 'C', label: 'Three cards: write, visit, join', rationale: 'Three reasons to get in touch, each with its own card, and a smaller map. Gives prospective students a clear route in.', render: (ctx) => '<div class="mk-pad" style="padding:48px">' + contactHtml(ctx, 'C') + '</div>' },
  ],
});
