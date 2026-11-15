/* ==========================================================================
   Research page: pillars and study systems.
   ========================================================================== */
'use strict';

const PILLAR_IMG = ['speciation', 'adaptation', 'domestication'];

function splitQuestion(body) {
  const m = body.match(/^[^?.]*[?.]/);
  const q = m ? m[0] : body;
  return { q: q, rest: body.slice(q.length).trim() };
}

function pillarsHtml(ctx, key) {
  const ps = SITE.copy.pillars;
  const head = secHead(ctx, { eyebrow: 'Research', title: 'Three questions', note: 'Speciation, adaptation and domestication across wild and cultivated relatives.' });
  const chips = (p) => '<div class="mk-chips">' + p.organisms.map((o) => '<span class="mk-chip"><em>' + esc(o) + '</em></span>').join('') + '</div>';
  let body;
  if (key === 'B') {
    body = '<div class="mk-stack" style="gap:24px">' + ps.map((p, i) => {
      const sq = splitQuestion(p.body);
      return '<article class="mk-card mk-prow2' + (i % 2 ? ' is-flip' : '') + '"><div class="mk-pplate"><div class="mk-pimg im-' + PILLAR_IMG[i] + '"></div></div>' +
        '<div class="mk-stack" style="gap:12px;padding:8px 8px"><h3 class="mk-h mk-h2" style="font-size:30px">' + esc(p.title) + '</h3><p class="mk-eyebrow" style="letter-spacing:0.02em;text-transform:none;font-size:15px">' + esc(sq.q) + '</p><p class="mk-text">' + esc(sq.rest) + '</p>' + chips(p) + '</div></article>';
    }).join('') + '</div>';
  } else if (key === 'C') {
    body = '<div class="mk-grid3">' + ps.map((p) => {
      const sq = splitQuestion(p.body);
      return '<article class="mk-card mk-pillar" style="padding:28px;gap:14px"><p class="mk-eyebrow">' + esc(p.title) + '</p><h3 class="mk-h" style="font-size:27px;line-height:1.2">' + esc(sq.q) + '</h3><p class="mk-text" style="font-size:15px">' + esc(sq.rest) + '</p>' + chips(p) + '</article>';
    }).join('') + '</div>';
  } else {
    body = '<div class="mk-grid3">' + ps.map((p, i) =>
      '<article class="mk-card mk-pillar" style="padding:0;overflow:hidden"><div class="mk-pplate"><div class="mk-pimg im-' + PILLAR_IMG[i] + '"></div></div><div class="mk-pillar" style="padding:22px 24px 24px"><h3 class="mk-h mk-h3">' + esc(p.title) + '</h3><p>' + esc(p.body) + '</p>' + chips(p) + '</div></article>').join('') + '</div>';
  }
  return '<div class="mk-stack" style="gap:28px">' + head + body + '</div>';
}

function pillarsSample(key) {
  return (ctx) => '<div class="mk-pad" style="padding:48px"><div class="mk-wrap">' + pillarsHtml(ctx, key) + '</div></div>';
}

registerChoice({
  id: 'pillars',
  group: 'element',
  title: 'Research pillars',
  problem: 'Cream image boxes sit inside dark cards, and the three images are a 225 px raster, a 2.1 MB render and a flat silhouette, so they do not look like a set.',
  layout: 'wide',
  views: [{ w: 1200 }],
  variants: [
    { key: 'A', label: 'Image-top cards', current: true, rationale: 'Today\'s three cards with the images on one even plate. The three images still do not match and one weighs 2.1 MB at source.', render: pillarsSample('A') },
    { key: 'B', label: 'Wide alternating rows', rationale: 'One pillar per row with the image on alternating sides. Gives each question room, and still needs the images.', render: pillarsSample('B') },
    { key: 'C', label: 'Question-led cards', suggested: true, rationale: 'Each card opens with the research question as its heading. No images to source, and the questions are what a reader remembers.', render: pillarsSample('C') },
  ],
});

function systemsHtml(ctx, key) {
  const sys = SITE.copy.systems;
  const head = '<p class="mk-eyebrow" style="margin-bottom:14px">Study systems</p>';
  if (key === 'B') {
    return '<div>' + head + '<div class="mk-specstrip">' + sys.map((s) => '<div><div class="mk-ph mk-ph--sq">photo<br>cutout</div><p class="mk-spec-label"><i>' + esc(s.replace(/\s*\(.*\)/, '')) + '</i></p></div>').join('') + '</div>' +
      '<p class="mk-cap">Placeholders: needs photographic cutouts sourced for each species</p></div>';
  }
  return '<div>' + head + '<div class="mk-chips" style="gap:10px">' + sys.map((s) => '<span class="mk-chip mk-pill-lg"><em>' + esc(s) + '</em></span>').join('') + '</div></div>';
}

registerChoice({
  id: 'systems',
  group: 'element',
  title: 'Study systems',
  problem: 'Seven species names in a row of pills. It is accurate and has no picture of a plant anywhere on the research page.',
  layout: 'two',
  views: [{ w: 900 }],
  variants: [
    { key: 'A', label: 'Species pills', current: true, suggested: true, rationale: 'The current pills, with species names in real italics. Suggested until photographic cutouts exist.', render: (ctx) => '<div class="mk-pad" style="padding:36px">' + systemsHtml(ctx, 'A') + '</div>' },
    { key: 'B', label: 'Specimen strip of photographic cutouts', flag: 'needs sourcing', rationale: 'A herbarium-style row, one cutout per species. Drawn here with placeholders; it needs seven properly licensed photographs.', render: (ctx) => '<div class="mk-pad" style="padding:36px">' + systemsHtml(ctx, 'B') + '</div>' },
  ],
});
