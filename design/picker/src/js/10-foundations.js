/* ==========================================================================
   The six foundations. Each applies to every stage at once through the
   variables set by applyScope(); a tile shows its variant by overriding that
   one pick on its own .mk element.
   ========================================================================== */
'use strict';

/* A small slice of a page: used to show a palette, a corner style, a motif. */
function sampleSlice(ctx, opts) {
  opts = opts || {};
  const c = SITE.copy;
  return '' +
    '<div class="mk-sample">' +
      '<div class="mk-motifbg" aria-hidden="true"></div>' +
      (opts.header ? '<div class="mk-row" style="justify-content:space-between"><span class="mk-wm">Hübner Lab</span><span class="mk-toggle"></span></div>' : '') +
      '<p class="mk-eyebrow">' + esc(c.heroEyebrow) + '</p>' +
      '<h3 class="mk-h" style="font-size:40px">How plants adapt, <em>diversify</em> and are domesticated</h3>' +
      '<p class="mk-lead" style="font-size:16px">' + esc(c.tagline) + '</p>' +
      '<div class="mk-row"><a class="mk-btn mk-btn--primary">Our research</a><a class="mk-btn mk-btn--ghost">Publications</a><a>All news</a></div>' +
      '<div class="mk-card" style="padding:18px 20px;display:flex;flex-direction:column;gap:8px">' +
        '<div class="mk-row" style="justify-content:space-between"><span class="mk-date">8 Apr 2026</span><span class="mk-cites">' + SITE.papers.stats.citations.toLocaleString('en-US') + ' citations</span></div>' +
        '<h4 class="mk-h" style="font-size:20px">' + esc(SITE.news[0].title) + '</h4>' +
        '<div class="mk-chips"><span class="mk-chip">Hordeum spontaneum</span><span class="mk-chip mk-chip--accent">lab news</span></div>' +
      '</div>' +
      (opts.extra || '') +
    '</div>';
}

function swatches(palKey) {
  const pal = PALETTES[palKey];
  const rows = ['dark', 'light'].map((mode) => {
    const p = pal[mode];
    const cells = PALETTE_ORDER.map((k) => {
      const textOn = contrast('#000000', p[k]) > contrast('#FFFFFF', p[k]) ? '#000000' : '#FFFFFF';
      return '<div class="mk-sw" style="background:' + p[k] + ';color:' + textOn + '"><b>' + k + '</b>' + p[k] + '</div>';
    }).join('');
    return '<div><p class="mk-cap" style="margin:0 0 5px">' + mode + ' &middot; weakest text contrast ' + minTextContrast(p).toFixed(1) + ':1</p><div class="mk-swatches">' + cells + '</div></div>';
  });
  return '<div class="mk-sample" style="padding-top:0">' + rows.join('') + '</div>';
}

registerChoice({
  id: 'palette',
  group: 'foundation',
  title: 'Palette',
  problem: 'The light theme sets gold text on paper at 2.2:1, below the 4.5:1 floor. Each option below keeps every text colour at 4.5:1 or better on paper and on surface.',
  layout: 'two',
  views: [{ w: 700 }],
  variants: [
    { key: 'A', label: 'Soil', current: true, rationale: 'Today\'s warm brown dark theme and cool grey light theme, with the light theme\'s gold darkened to pass.', render: (ctx) => sampleSlice(ctx) + swatches('A') },
    { key: 'B', label: 'Night field', suggested: true, rationale: 'Deep green-black dark theme and a pale sage light theme. Reads as fieldwork and keeps the gold and leaf accents.', render: (ctx) => sampleSlice(ctx) + swatches('B') },
    { key: 'C', label: 'Herbarium', rationale: 'Warm paper and pressed-specimen tones; the dark theme is a dim museum drawer.', render: (ctx) => sampleSlice(ctx) + swatches('C') },
    { key: 'D', label: 'Slate and grain', rationale: 'Cool slate with wheat gold. The most neutral and the most like a data lab.', render: (ctx) => sampleSlice(ctx) + swatches('D') },
  ],
});

registerChoice({
  id: 'theme',
  group: 'foundation',
  title: 'Default theme',
  problem: 'Dark is the default today, so first-time visitors on a bright screen land on a dark page and the toggle is the only way out.',
  layout: 'two',
  views: [{ w: 700 }],
  variants: [
    { key: 'A', label: 'Dark first', current: true, rationale: 'Dark on first visit, with a toggle. What the site does now.', render: (ctx) => sampleSlice(ctx, { header: true }) },
    { key: 'B', label: 'Light first', rationale: 'Light on first visit, with a toggle. Best for print-like reading of long publication lists.', render: (ctx) => sampleSlice(ctx, { header: true }) },
    { key: 'C', label: 'Follow the visitor\'s device', suggested: true, rationale: 'Dark or light from the visitor\'s system setting, with a toggle to override. No visitor lands on the wrong one.', render: (ctx) =>
      '<div style="display:grid;grid-template-columns:1fr 1fr">' + mk(sampleSlice(ctx, { header: true, extra: '<p class="mk-cap">device set to dark</p>' }), { mode: 'dark', theme: 'C' }) + mk(sampleSlice(ctx, { header: true, extra: '<p class="mk-cap">device set to light</p>' }), { mode: 'light', theme: 'C' }) + '</div>' },
    { key: 'D', label: 'One theme only, no toggle', rationale: 'A single designed look and nothing to maintain. The toggle disappears from the navigation.', render: (ctx) => sampleSlice(ctx, { header: true }) },
  ],
});

/* Theme tiles show one mode per variant; the palette stays the viewer's pick. */
PICKER.byId.theme.modeFor = (key) => (key === 'B' ? 'light' : 'dark');

function typeSpecimen(ctx) {
  const t = TYPES[ctx.picks.type];
  const s = SITE.papers.stats;
  return '' +
    '<div class="mk-sample mk-spec">' +
      '<p class="mk-eyebrow">' + esc(t.name) + '</p>' +
      '<h3 class="mk-h big">Hübner <em>Lab</em></h3>' +
      '<h4 class="mk-h" style="font-size:26px">Evolutionary and landscape genomics</h4>' +
      '<p class="mk-text" style="font-size:16px">' + esc(SITE.copy.mission.body.slice(0, 190)) + '&hellip;</p>' +
      '<p class="mk-mono" style="font-size:13px;color:var(--color-muted)">' + s.count + ' publications &middot; ' + s.citations.toLocaleString('en-US') + ' citations &middot; ' + s.firstYear + '&ndash;' + s.lastYear + '</p>' +
      '<p style="font-size:15px"><em>Hordeum spontaneum</em>, <em>Triticum aestivum</em>, <em>Vitis vinifera</em></p>' +
    '</div>';
}

registerChoice({
  id: 'type',
  group: 'foundation',
  title: 'Typeface pairing',
  problem: 'Fraunces and Inter are fine, but the site loads no italics, so every species name (Hordeum spontaneum) is a slanted fake.',
  layout: 'two',
  views: [{ w: 700 }],
  variants: [
    { key: 'A', label: 'Fraunces + Inter', current: true, suggested: true, rationale: 'The current pairing, now with real italics for species names. Warm and recognisable.', render: typeSpecimen },
    { key: 'B', label: 'Source Serif 4 + Source Sans 3', rationale: 'Journal voice: sober, very readable at length, close to what the papers are set in.', render: typeSpecimen },
    { key: 'C', label: 'Instrument Serif + Instrument Sans', rationale: 'Contemporary editorial. The headings exist in one weight only, so there is no bold display.', render: typeSpecimen },
    { key: 'D', label: 'IBM Plex Sans + IBM Plex Mono', rationale: 'Data-lab voice with no serif at all. Numbers and labels set in Plex Mono.', render: typeSpecimen },
  ],
});

function cornerSample(ctx) {
  return '' +
    '<div class="mk-sample">' +
      '<div class="mk-row"><a class="mk-btn mk-btn--primary">Our research</a><a class="mk-btn mk-btn--ghost">Publications</a><a class="mk-btn mk-btn--primary mk-btn--sm">Join us</a></div>' +
      '<div class="mk-chips"><span class="mk-chip">Hordeum spontaneum</span><span class="mk-chip">Helianthus annuus</span><span class="mk-chip mk-chip--accent">lab news</span></div>' +
      '<div class="mk-grid2" style="gap:14px">' +
        '<div class="mk-card" style="padding:16px"><p class="mk-date">8 Apr 2026</p><h4 class="mk-h" style="font-size:19px;margin-top:4px">' + esc(SITE.news[0].title) + '</h4></div>' +
        '<div class="mk-card" style="padding:16px"><p class="mk-eyebrow">Adaptation</p><p class="mk-muted" style="font-size:14px;margin-top:4px">Signatures of local adaptation across gradients.</p></div>' +
      '</div>' +
      '<div class="mk-card" style="padding:10px 16px;border-radius:var(--radius-control);color:var(--color-muted);font-size:14px">Search publications</div>' +
    '</div>';
}

registerChoice({
  id: 'corner',
  group: 'foundation',
  title: 'Corners and buttons',
  problem: 'Every control is a full pill, including the navigation, which crowds the small screen and gives the site a consumer-app feel.',
  layout: 'grid',
  views: [{ w: 700 }],
  variants: [
    { key: 'A', label: 'Round pills', current: true, rationale: 'What the site has: full pills for buttons, tags and the navigation.', render: cornerSample },
    { key: 'B', label: 'Soft 6-8 px', suggested: true, rationale: 'Slightly rounded corners everywhere. Quieter, and it frees space in the phone navigation.', render: cornerSample },
    { key: 'C', label: 'Sharp with hairlines', rationale: 'No rounding, 1 px rules and no shadows. A printed-figure look; strongest with the Herbarium palette.', render: cornerSample },
  ],
});

function motifSample(ctx) {
  return '' +
    '<div class="mk-sample" style="min-height:230px">' +
      '<div class="mk-motifbg" aria-hidden="true"></div>' +
      '<p class="mk-eyebrow">Research</p>' +
      '<h3 class="mk-h" style="font-size:34px">The genomics of plant evolution</h3>' +
      motifDivider() +
      '<p class="mk-text" style="font-size:15px">Wild barley, sunflower, wheat, grapevine and tef.</p>' +
    '</div>';
}

registerChoice({
  id: 'motif',
  group: 'foundation',
  title: 'Brand motif',
  problem: 'Outside the home hero the pages are plain text on a flat colour, so nothing says "genomics" once you leave the front page.',
  layout: 'two',
  views: [{ w: 700 }],
  variants: [
    { key: 'A', label: 'None', current: true, rationale: 'No decoration. Cleanest, but the inner pages stay blank.', render: motifSample },
    { key: 'B', label: 'Dot grid', suggested: true, rationale: 'An echo of the hero wordmark and of a genotype matrix. Fades out under the page title.', render: motifSample },
    { key: 'C', label: 'Contour lines', rationale: 'Topographic lines for landscape genomics. Decorative, and the heaviest to look at.', render: motifSample },
    { key: 'D', label: 'Haplotype strips', rationale: 'Short coloured blocks used as section dividers, like a row of haplotypes.', render: motifSample },
  ],
});

function motionSample(ctx) {
  const items = ['Speciation', 'Adaptation', 'Domestication'].map((t, i) =>
    '<div class="mk-card mk-rise" style="--i:' + i + ';padding:16px 18px"><p class="mk-eyebrow">' + t + '</p><div class="mk-ph-line" style="width:80%;margin-top:10px"></div><div class="mk-ph-line" style="width:55%;margin-top:6px"></div></div>').join('');
  const trans =
    '<div class="mk-xwrap">' +
      '<div class="mk-xa mk-card" style="padding:18px 20px"><p class="mk-eyebrow">Page: Research</p><h4 class="mk-h" style="font-size:24px;margin-top:6px">The genomics of plant evolution</h4></div>' +
      '<div class="mk-xb mk-card" style="padding:18px 20px"><p class="mk-eyebrow">Page: Team</p><h4 class="mk-h" style="font-size:24px;margin-top:6px">People</h4></div>' +
    '</div>';
  return '' +
    '<div class="mk-sample mk-demo">' +
      '<div class="mk-row" style="justify-content:space-between"><p class="mk-eyebrow">Scrolling into view</p><a class="mk-btn mk-btn--ghost mk-btn--sm" data-act="replay">Replay</a></div>' +
      '<div class="mk-grid3" style="gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))">' + items + '</div>' +
      '<p class="mk-eyebrow" style="margin-top:8px">Moving to another page</p>' +
      trans +
    '</div>';
}

registerChoice({
  id: 'motion',
  group: 'foundation',
  title: 'Motion',
  problem: 'Sections fade up as they scroll in, which is pleasant on desktop but delays reading on slow phones. Use the replay button to compare.',
  layout: 'grid',
  views: [{ w: 700 }],
  variants: [
    { key: 'A', label: 'Fade-up on scroll', current: true, suggested: true, rationale: 'What the site does now: sections rise and fade in once as they enter the screen.', render: motionSample },
    { key: 'B', label: 'Still', rationale: 'Nothing moves. Fastest, and nothing to disable for people who prefer less motion.', render: motionSample },
    { key: 'C', label: 'Page transitions', rationale: 'The browser\'s own cross-document transition between pages. No script, and nothing moves while scrolling.', render: motionSample },
  ],
});
