/* ==========================================================================
   Navigation: desktop and phone. Variant A is always "current, cleaned up".
   ========================================================================== */
'use strict';

function linksHtml(current) {
  return '<ul class="mk-links">' + NAV_LINKS.map((l) => '<li><a' + (l === current ? ' aria-current="page"' : '') + '>' + l + '</a></li>').join('') + '</ul>';
}

function navDesktopHtml(ctx, key, current) {
  const wm = wordmark(), tg = themeToggle();
  if (key === 'B') return '<nav class="mk-nav-b" aria-label="Main">' + wm + linksHtml(current) + tg + '</nav>';
  if (key === 'C') return '<nav class="mk-nav-c" aria-label="Main">' + wm + linksHtml(current) + '<div class="mk-nav-c__end"><a class="mk-btn mk-btn--primary mk-btn--sm">Join us</a>' + tg + '</div></nav>';
  if (key === 'D') return '<nav class="mk-nav-d" aria-label="Main">' + wm + linksHtml(current) + tg + '</nav>';
  return '<nav class="mk-nav-a" aria-label="Main">' + wm + linksHtml(current) + tg + '</nav>';
}

/* How far a page's first content must clear the navigation. */
function navClearance(key) { return key === 'A' ? 92 : 48; }

registerChoice({
  id: 'navDesktop',
  group: 'element',
  title: 'Navigation, desktop',
  problem: 'Every link is underlined by a CSS bug and the current page is never marked.',
  layout: 'wide',
  views: [{ w: 1200 }],
  variants: [
    { key: 'A', label: 'Floating pill', current: true, rationale: 'Today\'s floating pill with the underline bug fixed and the current page marked.', render: (ctx) => pageSlice(navDesktopHtml(ctx, 'A', 'Research'), { top: navClearance('A') }) },
    { key: 'B', label: 'Flush top bar with a hairline', suggested: true, rationale: 'A full-width bar that sticks to the top, with a thin rule and an underline on the current page. Takes the least space and reads as a journal.', render: (ctx) => pageSlice(navDesktopHtml(ctx, 'B', 'Research'), { top: navClearance('B') }) },
    { key: 'C', label: 'Split bar with a "Join us" action', rationale: 'Name left, links centred, a primary action right. Gives prospective students and postdocs a way in from every page.', render: (ctx) => pageSlice(navDesktopHtml(ctx, 'C', 'Research'), { top: navClearance('C') }) },
    { key: 'D', label: 'Plain header that scrolls away', rationale: 'No sticky bar at all; the header leaves with the page. The lightest option, at the cost of finding the menu after scrolling.', render: (ctx) => pageSlice(navDesktopHtml(ctx, 'D', 'Research'), { top: navClearance('D') }) },
  ],
});

function navPhoneHtml(ctx, key, current, open, bare) {
  const page = bare ? '' : '<div class="mk-pn__page"><p class="mk-eyebrow">Research</p><h1 class="mk-h" style="font-size:32px">' + esc(SITE.copy.research.title) + '</h1>' +
    '<div class="mk-ph-line" style="width:92%;margin-top:6px"></div><div class="mk-ph-line" style="width:84%"></div><div class="mk-ph-line" style="width:60%"></div></div>';
  if (key === 'B') {
    return '<div class="mk-pn' + (open ? ' is-open' : '') + (bare ? ' mk-pn--bare' : '') + '"><div class="mk-pn__bar">' + wordmark() +
      '<button type="button" class="mk-menubtn" data-act="menu"><i></i>Menu</button>' + themeToggle() + '</div>' +
      '<div class="mk-sheet">' + NAV_LINKS.map((l) => '<a' + (l === current ? ' aria-current="page"' : '') + '>' + l + '</a>').join('') + '</div>' + page + '</div>';
  }
  return '<div class="mk-pn' + (bare ? ' mk-pn--bare' : '') + '"><div class="mk-pn__bar">' + wordmark() + themeToggle() + '</div>' +
    '<div class="mk-strip">' + NAV_LINKS.map((l) => '<a' + (l === current ? ' aria-current="page"' : '') + '>' + l + '</a>').join('') + '</div>' + page + '</div>';
}

registerChoice({
  id: 'navPhone',
  group: 'element',
  title: 'Navigation, phone',
  problem: 'A hidden sideways scroll shows two of the five links; the other three are invisible until you swipe.',
  layout: 'grid',
  views: [{ w: 390, phone: true }],
  variants: [
    { key: 'A', label: 'Scroll strip with an edge fade', current: true, rationale: 'The strip stays; an edge fade hints at more links. The links are still partly hidden.', render: (ctx) => navPhoneHtml(ctx, 'A', 'Research', false) },
    { key: 'B', label: 'Menu button with a full sheet', suggested: true, rationale: 'One tap shows all five links in large type. Tap Menu in the mock-up to open and close it.', render: (ctx) => navPhoneHtml(ctx, 'B', 'Research', true) },
  ],
});
