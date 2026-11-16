// Run after `pnpm build`: node --test tests/site/budget.test.mjs
// What every built page must hold to, in two groups.
//
// The weight a visitor pays:
//   stylesheet   at most 10 KB gzipped per page
//   script       at most 6 KB gzipped per public page, counting everything the page reaches
//   image        none over 80 KB
//   video        none over 1.5 MB
// A file counts only when a built page, its stylesheets or its scripts name it, so files that sit
// unused in public/ do not fail the test. Fonts have no limit. /members is not a public page.
//
// The page head and the navigation:
//   every page has a title, a description and a social image; every page but the 404 page names
//   its own address (canonical); only /members is kept out of search engines;
//   the page a visitor is on is marked once in each list of the navigation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { site } from '../../src/site.config.ts';

const KB = 1024;
const LIMIT = { css: 10 * KB, js: 6 * KB, image: 80 * KB, video: 1.5 * KB * KB };

// Files that are over their limit today and are replaced later in the redesign. An entry must be
// deleted as soon as its file is within the limit or no page names it any more: the test fails on
// a stale entry, so this list can only get shorter.
const PENDING = new Map([
  // empty since the Research and Contact pages were rebuilt
]);

// Files a page names that are made later in the redesign. An entry must be deleted as soon as
// the file is in the build: the test fails on a stale entry.
const NOT_YET = new Set([
  'og.jpg', // the social image, made when the new hero exists
]);

const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg|ico)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i;

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
assert.ok(existsSync(dist), 'dist/ is missing: run `pnpm build` first');

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
const rel = (f) => path.relative(dist, f).split(path.sep).join('/');
const files = walk(dist);
const textOf = new Map();
const read = (f) => {
  if (!textOf.has(f)) textOf.set(f, readFileSync(f, 'utf8'));
  return textOf.get(f);
};
const gz = (data) => gzipSync(data, { level: 9 }).length;
const kb = (n) => `${(n / KB).toFixed(1)} KB`;

const pages = files.filter((f) => f.endsWith('.html')).map(rel).sort();
const publicPages = pages.filter((p) => !p.startsWith('members/'));
const media = files.filter((f) => IMAGE.test(f) || VIDEO.test(f));

/** A local URL in a page or a script, as a file in dist; null for anything else. */
function local(url, from) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return null;
  const clean = url.split(/[?#]/)[0];
  const f = clean.startsWith('/') ? path.join(dist, clean) : path.resolve(path.dirname(from), clean);
  return existsSync(f) && statSync(f).isFile() ? f : null;
}

/** What one page loads: its stylesheets, its inline styles and scripts, and every script it can reach. */
function reach(page) {
  const file = path.join(dist, page);
  const html = read(file);
  const css = new Set();
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    if (!/\brel="stylesheet"/.test(m[0])) continue;
    const f = local(/\bhref="([^"]+)"/.exec(m[0])?.[1] ?? '', file);
    if (f) css.add(f);
  }
  const inlineCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

  const js = new Set();
  const queue = [];
  let inlineJs = '';
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const type = /\btype="([^"]+)"/.exec(m[1])?.[1] ?? '';
    if (type && type !== 'module' && !/javascript/.test(type)) continue; // JSON, JSON-LD
    const src = /\bsrc="([^"]+)"/.exec(m[1])?.[1];
    if (src) queue.push(local(src, file));
    else inlineJs += m[2] + '\n';
  }
  for (const m of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*>/g)) {
    queue.push(local(/\bhref="([^"]+)"/.exec(m[0])?.[1] ?? '', file));
  }
  const imports = (code, from) =>
    [...code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+\.m?js)["']/g)].map((m) => local(m[1], from));
  queue.push(...imports(inlineJs, file));
  while (queue.length) {
    const f = queue.pop();
    if (!f || js.has(f)) continue;
    js.add(f);
    queue.push(...imports(read(f), f));
  }

  // Everything the page can name: its own markup, its stylesheets, its scripts.
  const haystack = [html, ...[...css, ...js].map(read)].join('\n');
  const named = media.filter((f) => haystack.includes('/' + rel(f)));

  return {
    css: [...css],
    cssBytes: [...css].reduce((n, f) => n + gz(readFileSync(f)), 0) + (inlineCss ? gz(inlineCss) : 0),
    jsBytes: [...js].reduce((n, f) => n + gz(readFileSync(f)), 0) + (inlineJs.trim() ? gz(inlineJs) : 0),
    named,
  };
}

const reached = new Map(pages.map((p) => [p, reach(p)]));

test('the build has the public pages', () => {
  for (const p of ['index.html', 'research/index.html', 'team/index.html', 'publications/index.html', 'news/index.html', 'contact/index.html']) {
    assert.ok(publicPages.includes(p), `dist/${p} is missing`);
  }
});

test('stylesheet: at most 10 KB gzipped on every page', (t) => {
  let top = 0;
  for (const p of publicPages) {
    const n = reached.get(p).cssBytes;
    top = Math.max(top, n);
    assert.ok(n > 0, `${p} loads no stylesheet`);
    assert.ok(n <= LIMIT.css, `${p}: ${kb(n)} of CSS gzipped, the limit is ${kb(LIMIT.css)}`);
  }
  t.diagnostic(`stylesheet: ${kb(top)} gzipped on the heaviest public page`);
});

test('script: at most 6 KB gzipped on every public page', (t) => {
  const lines = [];
  for (const p of publicPages) {
    const n = reached.get(p).jsBytes;
    lines.push(`${p} ${kb(n)}`);
    assert.ok(n <= LIMIT.js, `${p}: ${kb(n)} of script gzipped, the limit is ${kb(LIMIT.js)}`);
  }
  t.diagnostic(`script per page: ${lines.join(', ')}`);
});

test('images at most 80 KB and videos at most 1.5 MB, on every page that names them', (t) => {
  const over = new Map(); // file -> the pages that name it
  const namedAnywhere = new Set();
  let topImage = 0, topVideo = 0;
  for (const p of pages) {
    for (const f of reached.get(p).named) {
      namedAnywhere.add(rel(f));
      const size = statSync(f).size;
      const video = VIDEO.test(f);
      if (!PENDING.has(rel(f))) {
        if (video) topVideo = Math.max(topVideo, size); else topImage = Math.max(topImage, size);
      }
      if (size > (video ? LIMIT.video : LIMIT.image)) over.set(rel(f), [...(over.get(rel(f)) ?? []), p]);
    }
  }
  for (const [f, where] of over) {
    assert.ok(PENDING.has(f), `${f} is ${kb(statSync(path.join(dist, f)).size)}, over the limit, on ${where.join(', ')}`);
  }
  for (const [f, why] of PENDING) {
    assert.ok(namedAnywhere.has(f) && over.has(f),
      `${f} is no longer over its limit or no page names it: delete its PENDING entry (${why})`);
  }
  t.diagnostic(`largest image within the limit: ${kb(topImage)}; largest video within the limit: ${kb(topVideo)}; ` +
    `still over and waiting for a later step: ${PENDING.size ? [...PENDING.keys()].map((f) => `${f} ${kb(statSync(path.join(dist, f)).size)}`).join(', ') : 'none'}`);
});

test('fonts: every face the stylesheet names is in the build (no size limit, sizes reported)', (t) => {
  const faces = new Map(); // file -> bytes
  for (const sheet of reached.get('index.html').css) {
    for (const m of read(sheet).matchAll(/url\(\s*["']?([^"')]+\.woff2?)["']?\s*\)/g)) {
      const f = local(m[1], sheet);
      assert.ok(f, `${rel(sheet)} names the font ${m[1]}, which is not in the build: the text would fall back to a system font`);
      faces.set(f, statSync(f).size);
    }
  }
  assert.ok(faces.size > 0, 'the home page stylesheet names no font at all');
  // What a page with Latin text and no italics fetches: the upright Latin face of each family.
  const first = [...faces].filter(([f]) => /-latin-(?!ext)[a-z]+-normal\./.test(rel(f)));
  const sum = (list) => list.reduce((n, [, size]) => n + size, 0);
  t.diagnostic(`fonts: ${faces.size} faces, ${kb(sum([...faces]))} in all; a first visit loads ${first.length} of them, ` +
    `${kb(sum(first))} (${first.map(([f, size]) => `${rel(f).replace(/^_astro\//, '').replace(/\.[\w-]+\.woff2$/, '')} ${kb(size)}`).join(', ')})`);
});

// ---------------------------------------------------------------- the page head and the navigation

const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const metaTag = (html, key, value) =>
  [...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, key) === value);
const addressOf = (page) => `${site.url}/${page.replace(/index\.html$/, '')}`;
const isNotFound = (page) => page === '404.html';

test('the address of the site is the same in astro.config.mjs and in site.config.ts', () => {
  const config = readFileSync(fileURLToPath(new URL('../../astro.config.mjs', import.meta.url)), 'utf8');
  assert.equal(/\bsite:\s*['"]([^'"]+)['"]/.exec(config)?.[1], site.url);
});

test('every page has a title, a description and a social image', () => {
  for (const page of pages) {
    const html = read(path.join(dist, page));
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1].trim();
    assert.ok(title, `${page} has no title`);
    assert.ok(title.includes(site.name), `${page}: the title "${title}" does not name the lab`);
    assert.ok(attr(metaTag(html, 'name', 'description') ?? '', 'content')?.trim(), `${page} has no description`);
    const image = attr(metaTag(html, 'property', 'og:image') ?? '', 'content');
    assert.ok(image?.startsWith(`${site.url}/`), `${page}: og:image must be a full address on the site, got ${image}`);
    assert.equal(attr(metaTag(html, 'name', 'twitter:image') ?? '', 'content'), image, `${page}: twitter:image differs from og:image`);
  }
  assert.equal(/<title>([^<]*)<\/title>/.exec(read(path.join(dist, 'index.html')))[1], site.title, 'the home page title');
});

test('the social image is in the build and within the image limit', () => {
  const file = site.socialImage.path.replace(/^\//, '');
  const full = path.join(dist, file);
  if (existsSync(full)) {
    assert.ok(!NOT_YET.has(file), `${file} is in the build now: delete its NOT_YET entry`);
    assert.ok(statSync(full).size <= LIMIT.image, `${file} is ${kb(statSync(full).size)}, the limit is ${kb(LIMIT.image)}`);
  } else {
    assert.ok(NOT_YET.has(file), `the pages name ${file} as their social image, and it is not in the build`);
  }
});

test('every page but the 404 page names its own address, and only /members is hidden from search engines', () => {
  for (const page of pages) {
    const html = read(path.join(dist, page));
    const link = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'rel') === 'canonical');
    if (isNotFound(page)) {
      assert.ok(!link, 'the 404 page stands in for any address and must not name one of its own');
    } else {
      assert.equal(attr(link ?? '', 'href'), addressOf(page), `${page}: canonical address`);
      assert.equal(attr(metaTag(html, 'property', 'og:url') ?? '', 'content'), addressOf(page), `${page}: og:url`);
    }
    const hidden = /noindex/.test(attr(metaTag(html, 'name', 'robots') ?? '', 'content') ?? '');
    assert.equal(hidden, page.startsWith('members/'), `${page}: ${hidden ? 'is' : 'is not'} marked noindex`);
  }
});

test('the current page is marked once in each list of the navigation', () => {
  const strip = (p) => p.replace(/^\/+|\/+$/g, '');
  for (const page of pages) {
    const html = read(path.join(dist, page));
    const here = strip(page.replace(/index\.html$/, ''));
    const section = site.nav.find(({ href }) => here === strip(href) || here.startsWith(`${strip(href)}/`));
    const lists = [...html.matchAll(/<ul\b[^>]*\bdata-nav="([^"]+)"[^>]*>([\s\S]*?)<\/ul>/g)];
    assert.deepEqual(lists.map((m) => m[1]).sort(), ['bar', 'footer', 'sheet'], `${page}: the navigation lists`);
    for (const [, name, body] of lists) {
      const marked = [...body.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).filter((t) => attr(t, 'aria-current') === 'page');
      if (section) {
        assert.equal(marked.length, 1, `${page}: ${marked.length} links are marked as the current page in the ${name} list`);
        assert.equal(attr(marked[0], 'href'), section.href, `${page}: the ${name} list marks the wrong page`);
      } else {
        assert.equal(marked.length, 0, `${page}: the ${name} list marks a page, and this page is none of its links`);
      }
    }
    const wordmark = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]).find((t) => /\bwordmark\b/.test(attr(t, 'class') ?? ''));
    assert.ok(wordmark, `${page} has no wordmark link`);
    assert.equal(attr(wordmark, 'aria-current') === 'page', here === '', `${page}: the wordmark is the mark of the home page only`);
  }
});
