// node --test tests/site/feed.test.mjs   (the last group needs `pnpm build` first)
// The news of the lab in three groups:
//   1. the library src/lib/feed.ts on small made-up cases, and its key function on the list of
//      examples it shares with scripts/scholar.py;
//   2. the real data: the dates file against the list of papers;
//   3. the build: the "Latest" list of the home page, the News page, a news post and /rss.xml
//      all show what the library gives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildFeed, dayDate, formatDay, isDay, latest, seenDay, seenKey } from '../../src/lib/feed.ts';
import { authorsText, foldLine, labMatcher, toPaper } from '../../src/lib/publications.ts';
import { site } from '../../src/site.config.ts';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// ------------------------------------------------------------------------------ 1. the library

test('seenKey: the key that scripts/scholar.py gives, on every example the two share', () => {
  const pairs = JSON.parse(readFileSync(here('../scholar/fixtures/keys.json'), 'utf8'));
  assert.ok(pairs.length >= 5, 'tests/scholar/fixtures/keys.json lost its examples');
  for (const [title, key] of pairs) assert.equal(seenKey(title), key, JSON.stringify(title));
});

test('isDay: a real day of the calendar, written as the dates file writes it', () => {
  for (const day of ['2026-10-25', '2024-02-29', '1999-12-31', '2026-01-01']) assert.ok(isDay(day), day);
  const not = [
    '2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '2026-04-31',
    '2026-1-5', '26-10-25', '2026/10/25', '2026-10-25T00:00:00Z', ' 2026-10-25', '2026-10-25\n',
    '', 'yesterday', null, undefined, 20261025, {}, true,
  ];
  for (const value of not) assert.ok(!isDay(value), JSON.stringify(value));
});

test('seenDay: the day of a paper that arrived as news, and nothing for any other', () => {
  const seen = { apaper: '2026-10-25', anoldone: null, broken: '2026-13-01', anumber: 20261025 };
  assert.equal(seenDay(seen, 'A Paper'), '2026-10-25');
  assert.equal(seenDay(seen, '  a paper! '), '2026-10-25', 'case, spaces and signs do not matter');
  assert.equal(seenDay(seen, 'An old one'), null, 'an entry of null: the paper was always there');
  assert.equal(seenDay(seen, 'Not in the file'), null, 'no entry');
  assert.equal(seenDay(seen, 'Broken'), null, 'an entry that is not a day');
  assert.equal(seenDay(seen, 'A number'), null, 'an entry that is not text');
  // a name that every object has is not an entry
  for (const title of ['constructor', 'Constructor', '__proto__', 'toString', '']) {
    assert.equal(seenDay(seen, title), null, JSON.stringify(title));
  }
  assert.equal(seenDay({}, 'A Paper'), null);
});

test('formatDay and dayDate: the day as it is, whatever the time zone of the machine', () => {
  assert.equal(formatDay('2026-10-25'), '25 Oct 2026');
  assert.equal(formatDay('2026-04-08'), '8 Apr 2026');
  assert.equal(formatDay('2026-01-01'), '1 Jan 2026');
  assert.equal(formatDay('2026-12-31'), '31 Dec 2026');
  assert.equal(formatDay('2026-04-08', 'long'), '8 April 2026');
  assert.equal(formatDay('2026-12-31', 'long'), '31 December 2026');
  // September is "Sep" or "Sept", by the version of the date tables in Node
  assert.match(formatDay('2026-09-06'), /^6 Sept? 2026$/);
  assert.equal(dayDate('2026-10-25').toISOString(), '2026-10-25T00:00:00.000Z');
});

const isLab = labMatcher(['Lab Member']);
/** A paper as the pages hold it. */
const paper = (title, year, more = {}) =>
  toPaper({ year, title, authors: 'A One and Lab Member', venue: 'A Journal', url: `https://example.org/${seenKey(title)}`, citations: 0, ...more }, isLab);
/** A news post as the pages hold it. */
const post = (slug, day, more = {}) => ({ slug, title: `Post ${slug}`, date: new Date(`${day}T00:00:00Z`), ...more });
const brief = (items) => items.map((i) => `${i.day ?? 'no day'} ${i.kind} ${i.title}`);

test('buildFeed: the posts and the dated papers, newest first; a paper without a day is left out', () => {
  const papers = [paper('Autumn paper', 2026), paper('Old paper', 2020), paper('No entry', 2026), paper('Spring paper', 2026)];
  const seen = { autumnpaper: '2026-10-25', oldpaper: null, springpaper: '2026-05-15' };
  const feed = buildFeed([post('launch', '2026-04-08'), post('grant', '2026-11-01')], papers, seen);
  assert.deepEqual(brief(feed), [
    '2026-11-01 news Post grant',
    '2026-10-25 paper Autumn paper',
    '2026-05-15 paper Spring paper',
    '2026-04-08 news Post launch',
  ]);
  assert.deepEqual(buildFeed([], [], {}), []);
  assert.deepEqual(buildFeed([], papers, {}), [], 'no dates, no news');
});

test('buildFeed: what an item holds', () => {
  const p = paper('  Autumn   paper ', 2025);
  const [first, second] = buildFeed(
    [post('2026-04-08-launch', '2026-04-08', { title: 'Launch', summary: '  The site is new. ' }), post('plain', '2026-01-02')],
    [p],
    { autumnpaper: '2026-01-10' },
  );
  assert.deepEqual(first, { kind: 'news', day: '2026-04-08', year: 2026, title: 'Launch', href: '/news/2026-04-08-launch/', summary: 'The site is new.' });
  assert.deepEqual(second, { kind: 'paper', day: '2026-01-10', year: 2025, title: 'Autumn paper', key: 'autumnpaper', paper: p });
  const plain = buildFeed([post('plain', '2026-01-02')], [], {})[0];
  assert.equal(plain.summary, '', 'a post without a summary');
  // a post written with a time of day keeps its day
  assert.equal(buildFeed([{ slug: 'late', title: 'Late', date: new Date('2026-03-04T23:59:59Z') }], [], {})[0].day, '2026-03-04');
});

test('buildFeed: on one day the posts come first, by file name, then the papers in the order of the list', () => {
  const papers = [paper('First in the list', 2026), paper('Second in the list', 2026)];
  const seen = { firstinthelist: '2026-06-01', secondinthelist: '2026-06-01' };
  const want = ['2026-06-01 news Post a', '2026-06-01 news Post b', '2026-06-01 paper First in the list', '2026-06-01 paper Second in the list'];
  assert.deepEqual(brief(buildFeed([post('a', '2026-06-01'), post('b', '2026-06-01')], papers, seen)), want);
  assert.deepEqual(brief(buildFeed([post('b', '2026-06-01'), post('a', '2026-06-01')], papers, seen)), want, 'the order the posts are given in does not matter');
  // the input is left as it was
  const posts = [post('b', '2026-06-01'), post('a', '2026-06-01')];
  buildFeed(posts, papers, seen);
  assert.deepEqual(posts.map((p) => p.slug), ['b', 'a']);
});

test('buildFeed: a title that the list holds twice is one item', () => {
  const papers = [paper('Twice listed', 2026), paper('TWICE  listed!', 2026, { venue: 'Another Journal' })];
  const feed = buildFeed([], papers, { twicelisted: '2026-06-01' });
  assert.equal(feed.length, 1);
  assert.equal(feed[0].paper.venue, 'A Journal', 'the first of the two');
});

test('latest: a short news is filled up with the newest papers that never were news', () => {
  const papers = [
    paper('Undated 2026 first', 2026), paper('Dated 2026', 2026), paper('Undated 2026 second', 2026),
    paper('Undated 2025', 2025), paper('Undated 2024', 2024), paper('Undated 2023', 2023),
  ];
  const seen = { dated2026: '2026-10-25', undated2026first: null };
  const rows = latest([post('launch', '2026-04-08')], papers, seen, 6);
  assert.deepEqual(brief(rows), [
    '2026-10-25 paper Dated 2026',
    '2026-04-08 news Post launch',
    'no day paper Undated 2026 first',
    'no day paper Undated 2026 second',
    'no day paper Undated 2025',
    'no day paper Undated 2024',
  ]);
  assert.equal(new Set(rows.map((r) => r.title)).size, rows.length, 'no paper is listed twice');
  assert.deepEqual(brief(latest([post('launch', '2026-04-08')], papers, seen, 3)), brief(rows.slice(0, 3)));
  assert.equal(latest([post('launch', '2026-04-08')], papers, seen, 50).length, 7, 'fewer items than rows: all of them');
  assert.deepEqual(latest([post('launch', '2026-04-08')], papers, seen, 0), []);
  assert.deepEqual(latest([], [], {}, 6), []);
});

test('latest: with news enough, only the news, the newest of it', () => {
  const papers = [paper('Undated', 2026), paper('P one', 2026), paper('P two', 2026), paper('P three', 2026)];
  const seen = { pone: '2026-03-01', ptwo: '2026-02-01', pthree: '2026-01-15' };
  const posts = [post('a', '2026-05-01'), post('b', '2026-04-01'), post('c', '2026-01-01')];
  assert.deepEqual(brief(latest(posts, papers, seen, 4)), [
    '2026-05-01 news Post a',
    '2026-04-01 news Post b',
    '2026-03-01 paper P one',
    '2026-02-01 paper P two',
  ]);
});

test('latest: the rows are in the order of the year they show', () => {
  // A paper of 2026 that the bot lists in January 2027 is the newest news, and shows "2026":
  // it stands under the post of 2027 and at the top of 2026.
  const papers = [paper('December paper', 2026), paper('Autumn paper', 2026), paper('Filler 2027', 2027), paper('Filler 2025', 2025)];
  const seen = { decemberpaper: '2027-01-10', autumnpaper: '2026-10-25' };
  const posts = [post('new-year', '2027-01-05'), post('launch', '2026-04-08')];
  const rows = latest(posts, papers, seen, 6);
  assert.deepEqual(rows.map((r) => `${r.year} ${r.kind} ${r.title}`), [
    '2027 news Post new-year',
    '2027 paper Filler 2027',
    '2026 paper December paper',
    '2026 paper Autumn paper',
    '2026 news Post launch',
    '2025 paper Filler 2025',
  ]);
  // the news itself stays in the order of its days
  assert.deepEqual(brief(buildFeed(posts, papers, seen)).slice(0, 2), ['2027-01-10 paper December paper', '2027-01-05 news Post new-year']);
});

// ------------------------------------------------------------------------------ 2. the real data

const records = JSON.parse(readFileSync(here('../../src/data/publications.json'), 'utf8'));
const seen = JSON.parse(readFileSync(here('../../src/data/publications-seen.json'), 'utf8'));
const teamDir = here('../../src/content/team/');
const teamNames = readdirSync(teamDir).filter((f) => f.endsWith('.md')).map((f) => {
  const name = /^name:\s*(.+?)\s*$/m.exec(readFileSync(path.join(teamDir, f), 'utf8'))?.[1];
  assert.ok(name, `${f} has no name`);
  return name.replace(/^(['"])(.*)\1$/, '$2');
});
const papers = records.map((r) => toPaper(r, labMatcher([...teamNames, ...site.labAuthors, ...site.pi.spellings])));

test('data: the dates file maps a key to a day or to null, and no day is in the future', () => {
  assert.ok(seen && typeof seen === 'object' && !Array.isArray(seen), 'publications-seen.json is not a map');
  const today = new Date().toISOString().slice(0, 10);
  for (const [key, day] of Object.entries(seen)) {
    assert.match(key, /^[a-z0-9]+$/, `"${key}" is not a key that seenKey gives`);
    assert.ok(day === null || isDay(day), `${key}: ${JSON.stringify(day)} is neither a day nor null`);
    assert.ok(day === null || day <= today, `${key}: ${day} is in the future`);
  }
});

test('data: every listed paper has an entry in the dates file', () => {
  // A paper without an entry would get the day of the next bot run as its date, and would be
  // news on that day. After new papers arrive from main: python3 scripts/backfill_seen.py
  const missing = records.filter((r) => !Object.hasOwn(seen, seenKey(r.title))).map((r) => r.title);
  assert.deepEqual(missing, [], 'no first-seen entry; run: python3 scripts/backfill_seen.py');
});

test('data: the papers that are news are papers of the year they arrived in, or of the year before', (t) => {
  const dated = buildFeed([], papers, seen);
  for (const item of dated) {
    const arrived = Number(item.day.slice(0, 4));
    assert.ok(item.year === arrived || item.year === arrived - 1, `"${item.title}": a paper of ${item.year} dated ${item.day}`);
  }
  t.diagnostic(`papers: ${papers.length} listed, ${dated.length} with a first-seen day (${dated.map((i) => i.day).join(', ') || 'none'})`);
});

// ------------------------------------------------------------------------------ 3. the build

const dist = here('../../dist/');
const built = (file) => {
  const full = path.join(dist, file);
  assert.ok(existsSync(full), `dist/${file} is missing: run \`pnpm build\` first`);
  return readFileSync(full, 'utf8');
};
const unescape = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescape(m[1]) : undefined; };
const has = (tag, name) => new RegExp(`\\s${name}(?=[\\s=>])`).test(tag);
const hasClass = (tag, name) => (attr(tag, 'class') ?? '').split(/\s+/).includes(name);
const openTags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))];
/** The whole element that starts with the opening tag `m` (a match of openTags), nested elements of the same name included. */
function element(html, m) {
  assert.ok(m, 'an element the test looks for is not in the page');
  const name = /^<([a-z0-9]+)/i.exec(m[0])[1];
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
  re.lastIndex = m.index;
  let depth = 0, t;
  while ((t = re.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(m.index, t.index + t[0].length);
  }
  assert.fail(`<${name}> is not closed`);
}
/** The text of a piece of markup, as a reader sees it. */
const text = (html) => unescape(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
/** The first element of `html` with this tag name and class. */
const byClass = (html, tag, name) => {
  const m = openTags(html, tag).find((t) => hasClass(t[0], name));
  return m ? element(html, m) : null;
};

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

/**
 * The news posts, read back from their built pages: the address gives the slug, the page its
 * title, its day and its summary (the description of the page, unless the post has none and
 * the page fell back to the description of the site).
 */
function builtPosts() {
  const root = path.join(dist, 'news');
  assert.ok(existsSync(root), 'dist/news is missing: run `pnpm build` first');
  return walk(root)
    .filter((f) => path.basename(f) === 'index.html' && path.dirname(f) !== root)
    .map((f) => {
      const html = readFileSync(f, 'utf8');
      const slug = path.relative(root, path.dirname(f)).split(path.sep).join('/');
      const article = element(html, openTags(html, 'article')[0]);
      const day = attr(openTags(article, 'time')[0]?.[0] ?? '', 'datetime');
      assert.ok(isDay(day), `/news/${slug}/ shows no day`);
      const description = attr(openTags(html, 'meta').map((m) => m[0]).find((t) => attr(t, 'name') === 'description') ?? '', 'content') ?? '';
      return {
        slug,
        title: text(element(article, openTags(article, 'h1')[0])),
        date: dayDate(day),
        summary: description === site.description ? '' : description,
        html,
      };
    });
}

/** The rows of a list of the news in a built page. */
function rowsOf(html) {
  return openTags(html, 'li').filter((m) => has(m[0], 'data-feed-item')).map((m) => {
    const row = element(html, m);
    const link = openTags(row, 'a').find((t) => hasClass(t[0], 'to'));
    const title = byClass(row, 'p', 'title');
    assert.ok(title, 'a row has no title');
    return {
      kind: attr(m[0], 'data-kind'),
      day: attr(m[0], 'data-day') ?? null,
      when: text(byClass(row, 'span', 'when') ?? ''),
      time: attr(openTags(row, 'time')[0]?.[0] ?? '', 'datetime') ?? null,
      label: text(byClass(row, 'span', 'kind') ?? ''),
      // the words for a screen reader are not part of the title
      title: text(title.replace(/<span class="sr-only"[^>]*>[\s\S]*?<\/span>/g, '')),
      spoken: text(title),
      href: link ? attr(link[0], 'href') : null,
      target: link ? attr(link[0], 'target') ?? null : null,
      rel: link ? attr(link[0], 'rel') ?? '' : '',
      about: text(byClass(row, 'p', 'about') ?? ''),
      bold: [...(byClass(row, 'p', 'about') ?? '').matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/g)].map((b) => unescape(b[1])),
    };
  });
}

/** What a row must say about a paper: the first two authors, every lab member, then the venue. */
const aboutPaper = (p) => [authorsText(foldLine(p.authors.all, 2)), p.venue].filter(Boolean).join(' · ');

function checkRow(row, want, where) {
  const name = `${where}: "${want.title}"`;
  assert.equal(row.kind, want.kind, `${name}: kind`);
  assert.equal(row.day, want.day, `${name}: data-day`);
  assert.equal(row.title, want.title, `${name}: title`);
  if (want.kind === 'news') {
    assert.equal(row.href, want.href, `${name}: the title leads to the post`);
    assert.equal(row.target, null, `${name}: a post opens in the same tab`);
    assert.equal(row.about, want.summary, `${name}: the line under the title is the summary`);
    assert.deepEqual(row.bold, [], `${name}: nothing in bold`);
  } else {
    const p = want.paper;
    assert.equal(row.href, p.link?.href ?? null, `${name}: the title leads to the paper`);
    if (p.link) {
      assert.equal(row.target, '_blank', `${name}: a paper opens in a new tab`);
      assert.match(row.rel, /\bnoopener\b/, `${name}: rel`);
      assert.equal(row.spoken, `${want.title} (opens in a new tab)`, `${name}: a screen reader is told about the new tab`);
    }
    assert.equal(row.about, aboutPaper(p), `${name}: authors and venue`);
    assert.deepEqual(row.bold, foldLine(p.authors.all, 2).shown.filter((a) => a.lab).map((a) => a.name), `${name}: lab members in bold`);
  }
}

test('build: one page for every news post', () => {
  const sources = walk(here('../../src/content/news/')).filter((f) => f.endsWith('.md'));
  const posts = builtPosts();
  assert.equal(posts.length, sources.length, `${sources.length} posts in src/content/news, ${posts.length} pages under dist/news`);
  assert.equal(new Set(posts.map((p) => p.slug)).size, posts.length);
});

test('home: the "Latest" list is what the library gives, with the year and the kind of each row', (t) => {
  const html = built('index.html');
  const want = latest(builtPosts(), papers, seen, 6);
  const section = element(html, openTags(html, 'section').find((m) => has(m[0], 'data-latest')));
  const rows = rowsOf(section);
  assert.equal(rows.length, 6, 'the home page lists six rows');
  assert.equal(rows.length, want.length);
  rows.forEach((row, i) => {
    checkRow(row, want[i], `home row ${i + 1}`);
    assert.equal(row.when, String(want[i].year), `home row ${i + 1}: the year`);
    assert.equal(row.time, null, `home row ${i + 1}: the home page prints a year, not a day`);
    assert.equal(row.label, want[i].kind === 'news' ? 'News' : 'Paper', `home row ${i + 1}: the kind`);
  });
  const years = rows.map((r) => Number(r.when));
  assert.deepEqual(years, [...years].sort((a, b) => b - a), 'the years of the rows never rise down the list');
  // below the list: the way to all of the news and to all of the papers
  const links = openTags(section, 'a').map((m) => attr(m[0], 'href'));
  for (const href of ['/news/', '/publications/']) assert.ok(links.includes(href), `the "Latest" list has no link to ${href}`);
  assert.equal(rowsOf(html).length, rows.length, 'the rows of the news are in the "Latest" section only');
  t.diagnostic(`home: ${rows.filter((r) => r.day).length} rows of news, ${rows.filter((r) => !r.day).length} papers that fill the list`);
});

test('news: the page lists all of the news, newest first, with the day of each row', (t) => {
  const html = built('news/index.html');
  const want = buildFeed(builtPosts(), papers, seen);
  const rows = rowsOf(html);
  assert.equal(rows.length, want.length, 'one row per item of the news');
  rows.forEach((row, i) => {
    checkRow(row, want[i], `news row ${i + 1}`);
    assert.equal(row.time, want[i].day, `news row ${i + 1}: the day for a machine`);
    assert.equal(row.when, formatDay(want[i].day), `news row ${i + 1}: the day for a reader`);
    assert.equal(row.label, want[i].kind === 'news' ? 'News' : 'New paper', `news row ${i + 1}: the kind`);
  });
  const days = rows.map((r) => r.day);
  assert.deepEqual(days, [...days].sort().reverse(), 'newest first');
  assert.ok(openTags(html, 'a').some((m) => attr(m[0], 'href') === '/rss.xml'), 'the News page has no link to the feed');
  t.diagnostic(`news: ${rows.length} rows, ${rows.filter((r) => r.kind === 'news').length} posts and ${rows.filter((r) => r.kind === 'paper').length} papers`);
});

test('post: the text of a post is set by Prose, under its title, its day and the way back to the list', () => {
  for (const { slug, html, title } of builtPosts()) {
    const article = element(html, openTags(html, 'article')[0]);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `/news/${slug}/: one h1`);
    assert.ok(title, `/news/${slug}/ has no title`);
    const body = openTags(article, 'div').find((m) => has(m[0], 'data-post-body'));
    assert.ok(body && hasClass(body[0], 'prose'), `/news/${slug}/: the text is not inside Prose`);
    assert.ok(text(element(article, body)).length > 0, `/news/${slug}/: the post has no text`);
    assert.ok(openTags(article, 'a').some((m) => attr(m[0], 'href') === '/news/'), `/news/${slug}/: no link back to the News page`);
    assert.equal(unescape(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''), `${title} | ${site.name}`, `/news/${slug}/: the title of the page`);
  }
});

test('feed: /rss.xml is the same list, each item with a link, a day and a name that stays', (t) => {
  const xml = built('rss.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<rss\b[^>]*\bversion="2\.0"/, 'not an RSS 2.0 document');
  assert.ok(!/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(xml), 'a bare "&" in the feed: it would not parse');
  const field = (block, name) => {
    const m = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}>`).exec(block);
    return m ? { attrs: m[1], value: unescape(m[2]) } : null;
  };
  const channel = /<channel>([\s\S]*)<\/channel>/.exec(xml)?.[1] ?? '';
  const head = channel.split('<item>')[0];
  assert.equal(field(head, 'title')?.value, site.name);
  assert.equal(field(head, 'link')?.value, `${site.url}/`);
  assert.ok(field(head, 'description')?.value, 'the feed has no description');
  assert.match(head, new RegExp(`<atom:link href="${site.url}/rss\\.xml" rel="self" type="application/rss\\+xml"\\s*/>`), 'the feed does not name its own address');

  const posts = builtPosts();
  const want = buildFeed(posts, papers, seen);
  const items = [...channel.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  assert.equal(items.length, want.length, 'one item per item of the news');
  const ids = [];
  items.forEach((item, i) => {
    const w = want[i];
    const name = `feed item ${i + 1} "${w.title}"`;
    const guid = field(item, 'guid');
    assert.ok(guid, `${name}: no guid`);
    ids.push(guid.value);
    assert.equal(field(item, 'pubDate')?.value, dayDate(w.day).toUTCString(), `${name}: pubDate`);
    assert.equal([...item.matchAll(/<guid\b/g)].length, 1, `${name}: exactly one guid`);
    if (w.kind === 'news') {
      const link = `${site.url}${w.href}`;
      assert.equal(field(item, 'title')?.value, w.title, `${name}: title`);
      assert.equal(field(item, 'link')?.value, link, `${name}: link`);
      assert.ok(posts.some((p) => `${site.url}/news/${p.slug}/` === link), `${name}: the link leads to no page of the build`);
      assert.equal(guid.value, link, `${name}: the id of a post is its address`);
      assert.match(guid.attrs, /isPermaLink="true"/, `${name}: guid`);
      assert.equal(field(item, 'description')?.value ?? '', w.summary, `${name}: description`);
    } else {
      assert.equal(field(item, 'title')?.value, `New paper: ${w.title}`, `${name}: title`);
      assert.equal(field(item, 'link')?.value, w.paper.link?.href ?? `${site.url}/publications/#y${w.year}`, `${name}: link`);
      assert.equal(guid.value, `tag:hubner-lab.github.io,2026:paper:${w.key}`, `${name}: the id of a paper is made from its title, not from its link`);
      assert.match(guid.attrs, /isPermaLink="false"/, `${name}: guid`);
      assert.equal(field(item, 'description')?.value, [authorsText(foldLine(w.paper.authors.all, 2)), w.paper.venue].filter(Boolean).map((s) => `${s}.`).join(' '), `${name}: description`);
    }
  });
  assert.equal(new Set(ids).size, ids.length, 'two items of the feed have the same id');
  t.diagnostic(`feed: ${items.length} items, ${Buffer.byteLength(xml)} bytes`);
});

test('feed: every page tells a feed reader where the feed is', () => {
  const pages = walk(dist).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length > 0, 'no page in the build');
  for (const f of pages) {
    const link = openTags(readFileSync(f, 'utf8'), 'link').map((m) => m[0])
      .find((t) => attr(t, 'rel') === 'alternate' && attr(t, 'type') === 'application/rss+xml');
    assert.equal(attr(link ?? '', 'href'), '/rss.xml', `${path.relative(dist, f)} does not name the feed`);
  }
});

test('names and titles are written as text, and the old news card is gone', () => {
  const sources = ['src/components/LatestRow.astro', 'src/components/ui/Prose.astro', 'src/pages/index.astro', 'src/pages/news/index.astro', 'src/pages/news/[...slug].astro'];
  for (const f of sources) {
    assert.ok(!/set:html/.test(readFileSync(here(`../../${f}`), 'utf8')), `${f} writes a string as markup (set:html)`);
  }
  assert.ok(!existsSync(here('../../src/components/NewsCard.astro')), 'src/components/NewsCard.astro is back');
});
