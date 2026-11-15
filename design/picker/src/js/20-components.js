/* ==========================================================================
   Shared mock-up pieces. Render functions return HTML strings and never use
   fixed ids, because the same function runs in several tiles and in the
   preview. Mock-up links carry no href so they cannot change the page hash.
   ========================================================================== */
'use strict';

const NAV_LINKS = ['Research', 'Team', 'Publications', 'News', 'Contact'];

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function norm(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const LAB_NAMES = (typeof SITE !== 'undefined' ? SITE.people : []).map((p) => norm(p.name));
function isLabMember(name) {
  const n = norm(name);
  return LAB_NAMES.some((l) => l === n);
}

/* "A and B and C ..." -> a short line, long lists folded, lab members always visible and bold. */
function authorLine(authors, max, o) {
  o = o || {};
  const bold = o.bold === undefined ? fieldOn('pubTools', 'labBold') : o.bold;
  const all = authors.split(' and ').map((a) => a.trim()).filter(Boolean);
  const head = all.slice(0, max);
  const hidden = all.slice(max);
  const lab = hidden.filter(isLabMember);
  const shown = head.concat(lab);
  const fmt = (a) => (bold && isLabMember(a) ? '<b>' + esc(a) + '</b>' : esc(a));
  const rest = all.length - shown.length;
  return shown.map(fmt).join(', ') + (rest > 0 ? ' <a class="mk-fold">+' + rest + ' more</a>' : '');
}

function wordmark() {
  return '<span class="mk-wm">Hübner Lab</span>';
}
function themeToggle() {
  return '<span class="mk-toggle" aria-hidden="true"></span>';
}

/* A motif divider: all four forms are present, the .mk data-motif attribute shows one. */
function motifDivider() {
  const cols = ['var(--color-leaf)', 'var(--color-accent)', 'var(--color-link)', 'var(--color-muted)'];
  let strips = '';
  for (let i = 0; i < 46; i++) {
    const h = dotHash(i, 7);
    const w = 6 + (h % 26);
    strips += '<span style="width:' + w + 'px;background:' + cols[h % cols.length] + ';opacity:' + (0.45 + (h % 5) / 10) + '"></span>';
  }
  return '<div class="mk-mf mk-mf--dots" aria-hidden="true"></div><div class="mk-mf mk-mf--contour" aria-hidden="true"></div><div class="mk-mf mk-mf--strips" aria-hidden="true">' + strips + '</div>';
}

/* Section header, driven by the sectionHeader pick. */
function secHead(ctx, o) {
  const k = ctx.picks.sectionHeader;
  const tag = o.tag || 'h2';
  const title = '<' + tag + ' class="mk-h mk-h2">' + o.title + '</' + tag + '>';
  if (k === 'B') {
    return '<div class="mk-sh--b"><div>' + title + '</div><p class="mk-text">' + esc(o.note || o.eyebrow || '') + '</p></div>';
  }
  if (k === 'C') {
    return '<div class="mk-sh--c"><span class="mk-marker"></span>' + title + '<span class="mk-rule"></span>' + (o.action ? '<a>' + esc(o.action) + '</a>' : '') + '</div>';
  }
  return '<div class="mk-sh--a">' + (o.eyebrow ? '<p class="mk-eyebrow">' + esc(o.eyebrow) + '</p>' : '') + title + '</div>';
}

function newsCard(n) {
  return '<article class="mk-card mk-news"><time>' + esc(fmtDate(n.date)) + '</time>' +
    '<h3 class="mk-h mk-h3">' + esc(n.title) + '</h3>' +
    '<p class="mk-text" style="font-size:15px">' + esc(n.summary) + '</p>' +
    '<div class="mk-chips">' + n.tags.map((t) => '<span class="mk-chip mk-chip--accent">' + esc(t) + '</span>').join('') + '</div></article>';
}

function paperRow(p, opts) {
  opts = opts || {};
  return '<div class="mk-prow"><span class="mk-date">' + p.year + '</span>' +
    '<div><div class="mk-prow__t">' + esc(p.title) + '</div>' +
    '<div class="mk-prow__m">' + authorLine(p.authors, 3) + (p.venue ? ' &middot; <em>' + esc(p.venue) + '</em>' : '') + '</div></div>' +
    (p.citations ? '<span class="mk-cites">' + p.citations + (p.citations === 1 ? ' citation' : ' citations') + '</span>' : '<span></span>') + '</div>';
}

function pillarCard(p) {
  const m = p.body.match(/^[^?.]*[?.]/);
  const first = m ? m[0] : p.body;
  return '<article class="mk-card mk-pillar"><h3 class="mk-h mk-h3">' + esc(p.title) + '</h3><p>' + esc(first) + '</p>' +
    '<div class="mk-chips">' + p.organisms.slice(0, 3).map((o) => '<span class="mk-chip"><em>' + esc(o) + '</em></span>').join('') + '</div></article>';
}

function footerThree(ctx) {
  const f = SITE.copy.footer;
  return '<footer class="mk-foot"><div class="mk-foot__cols">' +
    '<div><p class="mk-eyebrow" style="margin-bottom:10px">Contact</p><p>' + f.lines.map(esc).join('<br>') + '<br><span style="color:var(--color-link)">' + esc(SITE.copy.contact.email) + '</span></p></div>' +
    '<div><p class="mk-eyebrow" style="margin-bottom:10px">Explore</p><ul>' + NAV_LINKS.slice(0, 4).map((l) => '<li>' + l + '</li>').join('') + '</ul></div>' +
    '<div><p class="mk-eyebrow" style="margin-bottom:10px">Affiliations</p><p>' + f.affiliations.map(esc).join('<br>') + '</p></div>' +
    '</div><div class="mk-foot__base"><span>&copy; 2026 Hübner Lab. All rights reserved.</span></div></footer>';
}

/* A bare page slice with context under a nav, for the navigation tiles. */
function pageSlice(inner, o) {
  o = o || {};
  return '<div class="mk-slice">' + (o.motif === false ? '' : '<div class="mk-motifbg" aria-hidden="true"></div>') +
    inner + '<div class="mk-pad" style="padding-top:' + (o.top || 84) + 'px;padding-bottom:44px">' +
    '<p class="mk-eyebrow">Research</p><h1 class="mk-h mk-h1" style="margin-top:8px;max-width:16ch">' + esc(SITE.copy.research.title) + '</h1>' +
    '<p class="mk-lead" style="margin-top:14px">' + esc(SITE.copy.research.body.slice(0, 150)) + '&hellip;</p></div></div>';
}

/* ---- people ---------------------------------------------------------------- */

function initials2(name) {
  const parts = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}
function nameHash(name) {
  let h = 7;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return h >>> 0;
}
/* The no-photo avatar: two initials, or a small symmetric pattern drawn from the name. */
function avatarHtml(p, size, kind) {
  kind = kind || fallbackKind();
  const st = 'width:' + size + 'px;height:' + size + 'px';
  if (kind === 'pattern') {
    const cols = ['var(--color-leaf)', 'var(--color-accent)', 'var(--color-link)'];
    let h = nameHash(p.name), cells = '';
    const on = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) { h = (h * 1103515245 + 12345) >>> 0; on.push([(h >>> 8) % 100 < 56, (h >>> 16) % 3]); }
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const [f, ci] = on[r * 3 + (c < 3 ? c : 4 - c)];
        cells += '<span' + (f ? ' style="background:' + cols[ci] + '"' : '') + '></span>';
      }
    }
    return '<div class="mk-av mk-av--pat" style="' + st + ';padding:' + Math.round(size * 0.14) + 'px" aria-hidden="true">' + cells + '</div>';
  }
  return '<div class="mk-av" style="' + st + ';font-size:' + Math.round(size * 0.38) + 'px" aria-hidden="true">' + esc(initials2(p.name)) + '</div>';
}

function personGroup(p) {
  const r = p.role.toLowerCase();
  if (p.alumni) return 'alumni';
  if (r.indexOf('principal') >= 0) return 'pi';
  if (r.indexOf('phd') >= 0 || r.indexOf('graduate student') >= 0) return 'phd';
  if (r.indexOf('undergrad') >= 0) return 'undergrad';
  return 'staff';
}
function formerRole(p) { return p.role.replace(/\s*\(Alumni\)\s*/i, '').trim(); }

/* Real members, reduced to what the repo holds today. */
function realPeople() {
  return SITE.people.map((p) => ({ name: p.name, role: p.alumni ? formerRole(p) : p.role, bio: p.bio, alumni: p.alumni, group: personGroup(p), email: p.hasEmail, scholar: p.hasScholar, order: p.order }));
}
/* Sample members for the card tiles: every field present, marked as samples. */
const SAMPLE_PEOPLE = [
  { name: 'Jane Doe', role: 'PhD Student', group: 'phd', bio: 'Studies how wild barley populations adapt to local climate across the Galilee.', interests: ['wild barley', 'local adaptation'], email: true, orcid: true, scholar: true, github: true, website: true, yearJoined: 2023, sample: true },
  { name: 'Alex Sample', role: 'MSc', group: 'alumni', alumni: true, bio: '', interests: ['transposable elements'], email: true, orcid: true, scholar: false, github: true, website: false, yearJoined: 2019, yearLeft: 2022, nowAt: 'Postdoc, Example University', sample: true },
];
function cardPeople() {
  const pi = realPeople().find((p) => p.group === 'pi');
  return [pi].concat(SAMPLE_PEOPLE);
}

function personLinks(p) {
  const out = [];
  if (p.email && fieldOn('cardFields', 'email')) out.push('Email');
  if (p.orcid && fieldOn('cardFields', 'orcid')) out.push('ORCID');
  if (p.scholar && fieldOn('cardFields', 'scholar')) out.push('Scholar');
  if (p.github && fieldOn('cardFields', 'github')) out.push('GitHub');
  if (p.website && fieldOn('cardFields', 'website')) out.push('Website');
  return out;
}
function linkRow(p) {
  const l = personLinks(p);
  return l.length ? '<div class="mk-links2">' + l.map((x) => '<span>' + x + '</span>').join('') + '</div>' : '';
}
function sampleTag(p) { return p.sample ? ' <span class="mk-draft">sample</span>' : ''; }
function years(p) {
  if (!fieldOn('cardFields', 'joined') || !p.yearJoined) return '';
  return '<span class="mk-date">' + p.yearJoined + (p.alumni && p.yearLeft ? '&ndash;' + p.yearLeft : '&ndash;') + '</span>';
}
function nowAt(p) { return p.alumni && p.nowAt && fieldOn('cardFields', 'nowAt') ? '<p class="mk-now">Now: ' + esc(p.nowAt) + '</p>' : ''; }
function keywords(p) {
  return p.interests && fieldOn('cardFields', 'keywords') ? '<div class="mk-chips">' + p.interests.map((k) => '<span class="mk-chip">' + esc(k) + '</span>').join('') + '</div>' : '';
}

function personCardHtml(ctx, key, p) {
  const role = fieldOn('cardFields', 'role') ? '<p class="mk-muted" style="font-size:14px">' + esc(p.role) + (p.alumni ? ' (alumni)' : '') + '</p>' : '';
  const bio = p.bio && fieldOn('cardFields', 'bio') ? '<p class="mk-text mk-clamp" style="font-size:14px">' + esc(p.bio) + '</p>' : '';
  const photo = fieldOn('cardFields', 'photo');
  if (key === 'B') {
    return '<article class="mk-card mk-pc mk-pc--b">' + (photo ? '<div class="mk-ph mk-ph--sq" style="border-radius:var(--radius-card) var(--radius-card) 0 0;border-style:none none dashed none">photo</div>' : '') +
      '<div class="mk-pc__body"><h4 class="mk-h mk-h3">' + esc(p.name) + sampleTag(p) + '</h4>' + role + bio + keywords(p) + nowAt(p) + linkRow(p) + years(p) + '</div></article>';
  }
  if (key === 'C') {
    const rows = [];
    if (fieldOn('cardFields', 'role')) rows.push(['Role', esc(p.role) + (p.alumni ? ' (alumni)' : '')]);
    if (p.interests && fieldOn('cardFields', 'keywords')) rows.push(['Interests', esc(p.interests.join(', '))]);
    if (p.yearJoined && fieldOn('cardFields', 'joined')) rows.push(['Years', p.yearJoined + (p.alumni && p.yearLeft ? '&ndash;' + p.yearLeft : '&ndash;')]);
    if (p.alumni && p.nowAt && fieldOn('cardFields', 'nowAt')) rows.push(['Now', esc(p.nowAt)]);
    const l = personLinks(p);
    if (l.length) rows.push(['Contact', l.join(', ')]);
    return '<article class="mk-card mk-pc mk-pc--c"><p class="mk-eyebrow">Lab member</p><h4 class="mk-h mk-h3" style="margin:4px 0 10px">' + esc(p.name) + sampleTag(p) + '</h4>' +
      '<dl>' + rows.map((r) => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl>' + (p.bio && fieldOn('cardFields', 'bio') ? '<p class="mk-text mk-clamp" style="font-size:14px;margin-top:8px">' + esc(p.bio) + '</p>' : '') + '</article>';
  }
  return '<article class="mk-card mk-pc mk-pc--a">' + (photo ? avatarHtml(p, 56) : '') +
    '<div class="mk-pc__body"><h4 class="mk-h mk-h3" style="font-size:19px">' + esc(p.name) + sampleTag(p) + '</h4>' + role + bio + keywords(p) + nowAt(p) + linkRow(p) + years(p) + '</div></article>';
}
