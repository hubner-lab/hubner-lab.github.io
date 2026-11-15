/* ==========================================================================
   Preview: whole pages assembled from the current picks. The tiles and the
   preview call the same render functions.
   ========================================================================== */
'use strict';

const PREVIEW_PAGES = [];
function registerPage(p) { PREVIEW_PAGES.push(p); }

function pageHead(ctx, phone, eyebrow, title, lead) {
  const top = phone ? 28 : navClearance(ctx.picks.navDesktop) - (ctx.picks.navDesktop === 'A' ? 0 : 0);
  return '<div class="mk-slice"><div class="mk-motifbg" aria-hidden="true"></div><div class="mk-pad mk-rise" style="padding-top:' + (phone ? 28 : top + 24) + 'px;padding-bottom:12px"><div class="mk-wrap"><p class="mk-eyebrow">' + esc(eyebrow) + '</p><h1 class="mk-h mk-h1" style="margin-top:8px">' + esc(title) + '</h1>' +
    (lead ? '<p class="mk-lead" style="margin-top:14px">' + esc(lead) + '</p>' : '') + '</div></div></div>';
}
function pageBlock(inner, i) {
  return '<div class="mk-pad mk-rise" style="--i:' + (i || 0) + ';padding-top:36px;padding-bottom:36px"><div class="mk-wrap">' + inner + '</div></div>';
}

function pageFrame(ctx, phone, body, current) {
  const nav = phone ? navPhoneHtml(ctx, ctx.picks.navPhone, current || '', false, true) : navDesktopHtml(ctx, ctx.picks.navDesktop, current || '');
  return '<div class="mk-pv go">' + nav + body + footerHtml(ctx, ctx.picks.footer) + '</div>';
}

registerPage({
  id: 'home',
  label: 'Home',
  render(ctx, phone) {
    return pageFrame(ctx, phone, '<div class="mk-slice">' + heroHtml(ctx, ctx.picks.hero) + '</div>' + homeBelowHtml(ctx, ctx.picks.homeBelow), '');
  },
});

registerPage({
  id: 'research',
  label: 'Research',
  render(ctx, phone) {
    return pageFrame(ctx, phone, pageHead(ctx, phone, 'Research', SITE.copy.research.title, SITE.copy.research.body) +
      pageBlock(pillarsHtml(ctx, ctx.picks.pillars), 1) + pageBlock(systemsHtml(ctx, ctx.picks.systems), 2), 'Research');
  },
});

registerPage({
  id: 'team',
  label: 'Team',
  render(ctx, phone) {
    return pageFrame(ctx, phone, pageHead(ctx, phone, 'Team', 'People', 'Principal investigator, students, staff and alumni of the Hübner Lab.') +
      pageBlock(teamHtml(ctx, ctx.picks.teamLayout), 1), 'Team');
  },
});

registerPage({
  id: 'publications',
  label: 'Publications',
  render(ctx, phone) {
    const s = SITE.papers.stats;
    return pageFrame(ctx, phone, pageHead(ctx, phone, 'Publications', 'Publications', s.count + ' papers, ' + s.citations.toLocaleString('en-US') + ' citations, ' + s.firstYear + ' to ' + s.lastYear + '. Refreshed from Google Scholar.') +
      pageBlock(pubsHtml(ctx, ctx.picks.pubRow), 1), 'Publications');
  },
});

registerPage({
  id: 'news',
  label: 'News',
  render(ctx, phone) {
    return pageFrame(ctx, phone, pageHead(ctx, phone, 'News', 'News', '') + pageBlock(newsHtml(ctx, ctx.picks.news), 1), 'News');
  },
});

registerPage({
  id: 'contact',
  label: 'Contact',
  render(ctx, phone) {
    const clear = phone ? 28 : navClearance(ctx.picks.navDesktop) + 24;
    return pageFrame(ctx, phone, '<div class="mk-slice"><div class="mk-motifbg" aria-hidden="true"></div><div class="mk-pad mk-rise" style="padding-top:' + clear + 'px">' + contactHtml(ctx, ctx.picks.contact) + '</div></div>', 'Contact');
  },
});
