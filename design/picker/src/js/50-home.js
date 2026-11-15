/* ==========================================================================
   Home below the hero, and the section header.
   ========================================================================== */
'use strict';

function homeBelowHtml(ctx, key) {
  const c = SITE.copy, news = SITE.news[0], papers = SITE.papers;
  if (key === 'B') {
    return '<div class="mk-pad"><div class="mk-wrap mk-stack" style="gap:64px">' +
      '<div class="mk-stack mk-rise" style="gap:24px;--i:0">' + secHead(ctx, { eyebrow: 'Research', title: 'Three questions, seven plant systems', note: 'Speciation, adaptation and domestication across wild and cultivated relatives.' }) +
        '<div class="mk-grid3">' + c.pillars.map(pillarCard).join('') + '</div></div>' +
      motifDivider() +
      '<div class="mk-stack mk-rise" style="gap:18px;--i:1">' + secHead(ctx, { eyebrow: 'Publications', title: 'Newest papers', note: papers.stats.count + ' papers since ' + papers.stats.firstYear + ', refreshed from Google Scholar.', action: 'All publications' }) +
        '<div>' + papers.first.slice(0, 5).map((p) => paperRow(p)).join('') + '</div></div>' +
      '<div class="mk-stack mk-rise" style="gap:18px;--i:2">' + secHead(ctx, { eyebrow: 'News', title: 'From the lab', note: 'Announcements and new papers.', action: 'All news' }) + newsCard(news) + '</div>' +
      (ctx.preview && listState('additions', 'joinUs') !== 'on' ? '' : '<div class="mk-card mk-band mk-rise" style="--i:3"><div><h3 class="mk-h mk-h3">Join the lab<span class="mk-draft">draft copy</span></h3><p>We welcome enquiries from students and postdocs interested in plant genomics. Write to the PI to start a conversation.</p></div><a class="mk-btn mk-btn--primary">Get in touch</a></div>') +
      '</div></div>';
  }
  if (key === 'C') {
    const items = [{ kind: 'News', year: news.date.slice(0, 4), title: news.title, meta: esc(news.summary) }]
      .concat(papers.first.slice(0, 5).map((p) => ({ kind: 'Paper', year: String(p.year), title: p.title, meta: authorLine(p.authors, 2) + (p.venue ? ' &middot; <em>' + esc(p.venue) + '</em>' : '') })));
    return '<div class="mk-pad"><div class="mk-stack mk-rise" style="max-width:700px;margin-inline:auto;gap:30px;--i:0">' +
      '<div class="mk-stack" style="gap:16px"><h2 class="mk-h mk-h2">' + esc(c.mission.title) + '</h2><p class="mk-text">' + esc(c.mission.body) + '</p></div>' + motifDivider() +
      secHead(ctx, { eyebrow: 'Latest', title: 'Latest', note: 'New papers and news in one list.' }) +
      '<div>' + items.map((it) => '<div class="mk-prow" style="grid-template-columns:48px minmax(0,1fr)"><span class="mk-date">' + it.year + '</span><div><span class="mk-kind">' + it.kind + '</span><div class="mk-prow__t">' + esc(it.title) + '</div><div class="mk-prow__m">' + it.meta + '</div></div></div>').join('') + '</div>' +
      '</div></div>';
  }
  return '<div class="mk-pad"><div class="mk-wrap mk-stack" style="gap:60px">' +
    '<div class="mk-stack mk-rise" style="max-width:720px;gap:18px;--i:0">' + secHead(ctx, { eyebrow: 'Mission', title: esc(c.mission.title), note: 'What the lab works on.' }) + '<p class="mk-text">' + esc(c.mission.body) + '</p></div>' +
    '<div class="mk-stack mk-rise" style="gap:18px;--i:1">' + secHead(ctx, { eyebrow: 'Latest news', title: 'Latest news', note: 'Announcements from the lab.', action: 'All news' }) +
      '<div class="mk-grid3">' + newsCard(news) + '</div></div></div></div>';
}

registerChoice({
  id: 'homeBelow',
  group: 'element',
  title: 'Home below the hero',
  problem: 'One paragraph and one news card. A first-time visitor sees no papers, no people, no way to tell what the lab produces.',
  layout: 'wide',
  views: [{ w: 1200 }],
  variants: [
    { key: 'A', label: 'Mission and news', current: true, rationale: 'Today\'s content with tidier spacing and section headers. Still thin.', render: (ctx) => homeBelowHtml(ctx, 'A') },
    { key: 'B', label: 'Front page', suggested: true, rationale: 'Pillar teasers, newest papers, news and a join-us band. A visitor sees what the lab does, what it published and how to reach it without leaving the page.', render: (ctx) => homeBelowHtml(ctx, 'B') },
    { key: 'C', label: 'One text column with a merged "Latest" list', rationale: 'A narrow reading column: the mission, then papers and news in one stream. Quiet and fast, with less to scan.', render: (ctx) => homeBelowHtml(ctx, 'C') },
  ],
});

function sectionSample(ctx) {
  return '<div class="mk-pad" style="padding:40px"><div class="mk-stack" style="gap:18px">' +
    secHead(ctx, { eyebrow: 'Publications', title: 'Newest papers', note: SITE.papers.stats.count + ' papers since ' + SITE.papers.stats.firstYear + ', refreshed from Google Scholar.', action: 'All publications' }) +
    '<div>' + SITE.papers.first.slice(0, 3).map((p) => paperRow(p)).join('') + '</div></div></div>';
}

registerChoice({
  id: 'sectionHeader',
  group: 'element',
  title: 'Section header',
  problem: 'Each section opens with a small grey label and a heading; the label carries the real meaning and is the least readable text on the page.',
  layout: 'grid',
  views: [{ w: 760 }],
  affects: ['homeBelow'],
  variants: [
    { key: 'A', label: 'Eyebrow and title', current: true, suggested: true, rationale: 'A small label over the title, as now, with the label brought up to readable contrast.', render: sectionSample },
    { key: 'B', label: 'Title with a side note', rationale: 'The title on the left and a one-line note on the right. Uses width well on desktop and stacks on a phone.', render: sectionSample },
    { key: 'C', label: 'Marker and rule', rationale: 'A small square, the title and a rule that runs to the edge. Reads like a figure caption and takes the motif colour.', render: sectionSample },
  ],
});
