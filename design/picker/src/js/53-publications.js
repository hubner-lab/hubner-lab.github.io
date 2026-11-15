/* ==========================================================================
   Publications: the row, driven by the tools checklist. Long author lists
   fold in every variant and keep the lab members visible.
   ========================================================================== */
'use strict';

function pubToolbar() {
  const on = (id) => fieldOn('pubTools', id);
  const s = SITE.papers.stats;
  let html = '';
  if (on('search') || on('filter')) {
    html += '<div class="mk-row" style="gap:14px;justify-content:space-between">' +
      (on('search') ? '<div class="mk-card mk-search"><span>Search title, author or venue</span></div>' : '<span></span>') +
      (on('filter') ? '<div class="mk-chips"><span class="mk-chip mk-chip--sel">All ' + s.count + '</span><span class="mk-chip">Articles ' + (s.count - s.preprints) + '</span><span class="mk-chip">Preprints ' + s.preprints + '</span></div>' : '') + '</div>';
  }
  if (on('years')) {
    const ys = [];
    for (let y = s.firstYear; y <= s.lastYear; y++) ys.push([y, s.years[String(y)] || 0]);
    const max = Math.max.apply(null, ys.map((a) => a[1]));
    html += '<div class="mk-years" aria-hidden="true"><div class="mk-bars">' + ys.map((a) => '<span style="height:' + Math.max(3, Math.round((a[1] / max) * 36)) + 'px"></span>').join('') + '</div>' +
      '<div class="mk-yl"><span>' + s.firstYear + '</span><span>Jump to a year</span><span>' + s.lastYear + '</span></div></div>';
  }
  return html ? '<div class="mk-stack" style="gap:14px">' + html + '</div>' : '';
}

function pubSampleRows() {
  const f = SITE.papers.first, t = SITE.papers.top;
  return [f[0], f[1], t[3], t[1], f[7]].sort((a, b) => b.year - a.year);
}

function pubMeta(p, withYear) {
  const on = (id) => fieldOn('pubTools', id);
  const bits = [];
  if (p.venue) bits.push('<em>' + esc(p.venue) + '</em>');
  if (withYear) bits.push(String(p.year));
  if (on('cites') && p.citations) bits.push('<span class="mk-cites">' + p.citations + (p.citations === 1 ? ' citation' : ' citations') + '</span>');
  return '<div class="mk-pubmeta">' + bits.join(' &middot; ') + (on('copyDoi') ? '<span class="mk-copy">Copy DOI</span>' : '') + '</div>';
}

function pubItem(p, withYear) {
  return '<div class="mk-prow__t">' + esc(p.title) + '</div><div class="mk-prow__m">' + authorLine(p.authors, 3) + '</div>' + pubMeta(p, withYear);
}

function pubsHtml(ctx, key) {
  const rows = pubSampleRows();
  let list;
  if (key === 'B') {
    const years = [];
    rows.forEach((p) => { if (!years.length || years[years.length - 1].y !== p.year) years.push({ y: p.year, items: [] }); years[years.length - 1].items.push(p); });
    list = '<div>' + years.map((g) => '<div class="mk-pub2"><div class="mk-pub2__y mk-h">' + g.y + '</div><div>' + g.items.map((p) => '<div class="mk-pub">' + pubItem(p, false) + '</div>').join('') + '</div></div>').join('') + '</div>';
  } else if (key === 'C') {
    const sel = SITE.papers.top, rest = SITE.papers.first.slice(0, 3);
    list = '<div class="mk-stack" style="gap:28px"><div class="mk-stack" style="gap:14px"><p class="mk-eyebrow">Selected</p><div class="mk-grid2">' + sel.map((p) => '<article class="mk-card mk-pubsel">' + pubItem(p, true) + '</article>').join('') + '</div></div>' +
      '<div class="mk-stack" style="gap:6px"><p class="mk-eyebrow">All publications, newest first</p><div>' + rest.map((p) => '<div class="mk-pub">' + pubItem(p, true) + '</div>').join('') + '</div></div></div>';
  } else {
    list = '<div>' + rows.map((p) => '<div class="mk-pub">' + pubItem(p, true) + '</div>').join('') + '</div>';
  }
  return '<div class="mk-stack" style="gap:22px">' + pubToolbar() + list + '</div>';
}

function pubsSample(key) {
  return (ctx) => '<div class="mk-pad" style="padding:36px 48px"><div class="mk-wrap">' + pubsHtml(ctx, key) + '</div></div>';
}

registerChoice({
  id: 'pubRow',
  group: 'element',
  title: 'Publication row',
  problem: 'Authors are one raw string, "A and B and C", with up to 89 names; the PI is never bold; an unexplained arrow sits before the citation count; 12 entries have no venue.',
  layout: 'wide',
  views: [{ w: 1200 }],
  affects: [],
  variants: [
    { key: 'A', label: 'Cleaned rows', current: true, suggested: true, rationale: 'Title, a folded author line with lab members bold, then venue, year and a plain "N citations". The same list, readable.', render: pubsSample('A') },
    { key: 'B', label: 'Year column', rationale: 'Years in a left column with the papers beside them. Easy to find a year, and it pairs with the per-year jump strip.', render: pubsSample('B') },
    { key: 'C', label: 'Selected first', rationale: 'The four most-cited papers as cards above the full list. Shows the lab\'s best-known work without anyone scrolling 60 entries.', render: pubsSample('C') },
  ],
});
