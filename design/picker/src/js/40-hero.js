/* ==========================================================================
   Home hero. The poster frame stands in for the looping video.
   ========================================================================== */
'use strict';

function heroButtons() {
  return '<div class="mk-row"><a class="mk-btn mk-btn--primary">Our research</a><a class="mk-btn mk-btn--ghost">Publications</a></div>';
}
const HERO_TITLE = 'Evolutionary and landscape genomics';
const VIDEO_NOTE = '<p class="mk-vidnote" style="position:absolute;right:48px;top:38px">Poster frame stands in for the video</p>';

function heroHtml(ctx, key) {
  const c = SITE.copy;
  const media = '<div class="mk-hero__media im-hero"></div><div class="mk-hero__scrim"></div>';
  if (key === 'B') {
    return '<section class="mk-hero mk-hero--media mk-hero--b">' + media + VIDEO_NOTE +
      '<div><canvas class="mk-dotstrip" data-text="HÜBNER LAB" data-cell="4" data-rows="16" data-stroke="0.12"></canvas></div>' +
      '<div class="mk-hero__foot"><p class="mk-eyebrow">' + esc(c.heroEyebrow) + '</p><h1 class="mk-hero__h1">' + HERO_TITLE + '</h1>' +
      '<p class="mk-hero__tag">' + esc(c.tagline) + '</p>' + heroButtons() + '</div></section>';
  }
  if (key === 'C') {
    return '<section class="mk-hero mk-hero--c"><div class="mk-motifbg" aria-hidden="true"></div>' +
      '<div class="mk-stack" style="gap:22px"><p class="mk-eyebrow">' + esc(c.heroEyebrow) + '</p><h1 class="mk-hero__h1">' + HERO_TITLE + '</h1>' +
      '<p class="mk-hero__tag">' + esc(c.tagline) + '</p>' + heroButtons() + '</div>' +
      '<div><div class="mk-frame im-hero"></div><p class="mk-cap">Poster frame stands in for the video</p></div></section>';
  }
  if (key === 'D') {
    const sp = ['Hordeum spontaneum', 'Helianthus annuus', 'Triticum aestivum'];
    return '<section class="mk-hero mk-hero--d"><div class="mk-stack" style="gap:22px"><p class="mk-eyebrow">' + esc(c.heroEyebrow) + '</p>' +
      '<h1 class="mk-hero__h1">' + HERO_TITLE + '</h1><p class="mk-hero__tag">' + esc(c.tagline) + '</p>' + heroButtons() + '</div>' +
      '<div><div class="mk-specimens">' + sp.map((s, i) => '<div><div class="mk-ph">photo<br>cutout</div><p class="mk-spec-label">Fig. ' + (i + 1) + '<br><i>' + s + '</i></p></div>').join('') + '</div>' +
      '<p class="mk-cap">Placeholders: needs photographic cutouts</p></div></section>';
  }
  if (key === 'E') {
    return '<section class="mk-hero mk-hero--media mk-hero--e">' + media +
      '<p class="mk-eyebrow">' + esc(c.heroEyebrow) + '</p>' +
      '<div class="mk-hero__foot"><h1 class="mk-hero__h1">' + HERO_TITLE + '</h1><p class="mk-hero__tag">' + esc(c.tagline) + '</p>' +
      '<div class="mk-row"><a class="mk-btn mk-btn--primary">Our research</a><a class="mk-btn mk-btn--ghost">Publications</a><a class="mk-btn mk-btn--ghost mk-btn--sm"><span class="mk-play"></span>Play background video</a></div></div></section>';
  }
  return '<section class="mk-hero mk-hero--media mk-hero--a">' + media + VIDEO_NOTE +
    '<p class="mk-eyebrow">' + esc(c.heroEyebrow) + '</p>' +
    '<div><canvas class="mk-dotword" data-text="Hübner Lab" data-cell="8" data-fit="1"></canvas><h1 class="mk-hero__h1 mk-only-phone">Hübner Lab</h1></div>' +
    '<div class="mk-hero__foot"><p class="mk-hero__tag">' + esc(c.tagline) + '</p>' + heroButtons() + '</div></section>';
}

registerChoice({
  id: 'hero',
  group: 'element',
  title: 'Home hero',
  problem: 'The dot-matrix wordmark is hard to read and unreadable on phones, and the tagline is set in a dark-page colour over bright video.',
  layout: 'wide',
  views: [{ w: 1200 }, { w: 390, phone: true }],
  variants: [
    { key: 'A', label: 'Video with a legible dot wordmark', current: true, rationale: 'Keeps today\'s idea: the name spelled in dots over the video. The dots are bigger and sit on a scrim, the tagline is light, and phones get real text.', render: (ctx) => heroHtml(ctx, 'A') },
    { key: 'B', label: 'Video with a crisp set title', suggested: true, rationale: 'A real headline in the display font does the work; the dot matrix shrinks to an accent strip. Readable at every size and still ours.', render: (ctx) => heroHtml(ctx, 'B') },
    { key: 'C', label: 'Split editorial', rationale: 'Headline on the left, framed media on the right, on a plain page. Calm, and the video can be a short loop in a frame.', render: (ctx) => heroHtml(ctx, 'C') },
    { key: 'D', label: 'Light specimen sheet', flag: 'needs cutouts', rationale: 'A herbarium plate: framed specimen crops with figure labels. Distinctive, but it needs photographic cutouts we do not have yet.', render: (ctx) => heroHtml(ctx, 'D') },
    { key: 'E', label: 'Still photo, video on request', rationale: 'A still image and a headline; the video plays only if asked. The lightest to load, and no autoplay on mobile data.', render: (ctx) => heroHtml(ctx, 'E') },
  ],
});
