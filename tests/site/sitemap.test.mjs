// Run after `pnpm build`: node --test tests/site/sitemap.test.mjs
// What a search engine is given:
//   sitemap-index.xml names the sitemap files, and together they list every page of the build
//     that may be found by its canonical address, and nothing else: not the members area
//     (it is marked noindex) and not the "page not found" page;
//   robots.txt names that index and closes nothing: a closed members area could not show its
//     noindex tag, so it would stay in search results by its address;
//   every page names the index in its head.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { site } from '../../src/site.config.ts';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
assert.ok(existsSync(dist), 'dist/ is missing: run `pnpm build` first');

const INDEX = 'sitemap-index.xml';
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
const pages = walk(dist)
  .filter((f) => f.endsWith('.html'))
  .map((f) => path.relative(dist, f).split(path.sep).join('/'))
  .sort();
const read = (file) => readFileSync(path.join(dist, file), 'utf8');
const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const linkTag = (html, rel) =>
  [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'rel') === rel);

/** The addresses every sitemap file of the index lists, in order. */
function listed() {
  assert.ok(existsSync(path.join(dist, INDEX)), `dist/${INDEX} is missing: the sitemap integration did not run`);
  const files = locs(read(INDEX));
  assert.ok(files.length > 0, `${INDEX} names no sitemap file`);
  return files.flatMap((address) => {
    assert.ok(address.startsWith(`${site.url}/`), `${INDEX} names ${address}, which is not on ${site.url}`);
    const file = address.slice(site.url.length + 1);
    assert.ok(existsSync(path.join(dist, file)), `${INDEX} names ${file}, which is not in the build`);
    return locs(read(file));
  });
}

test('the sitemap lists every page that may be found, by its canonical address, and nothing else', (t) => {
  const expected = pages.flatMap((page) => {
    const html = read(page);
    const canonical = attr(linkTag(html, 'canonical') ?? '', 'href');
    const hidden = /<meta\b[^>]*\bname="robots"[^>]*\bcontent="[^"]*noindex/.test(html);
    return canonical && !hidden ? [canonical] : [];
  });
  assert.ok(expected.length >= 7, `only ${expected.length} pages of the build may be found: ${expected.join(', ')}`);
  const got = listed();
  assert.deepEqual([...got].sort(), [...expected].sort());
  assert.equal(new Set(got).size, got.length, 'an address is listed twice');
  for (const address of got) {
    assert.ok(!/\/members(\/|$)/.test(address), `the members area is listed: ${address}`);
    assert.ok(!/\/404(\/|\.html|$)/.test(address), `the "page not found" page is listed: ${address}`);
  }
  t.diagnostic(`sitemap: ${got.length} addresses`);
});

test('robots.txt names the sitemap index and closes nothing', () => {
  assert.ok(existsSync(path.join(dist, 'robots.txt')), 'dist/robots.txt is missing');
  const rules = read('robots.txt')
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()];
    });
  const of = (field) => rules.filter(([f]) => f === field).map(([, value]) => value);
  assert.deepEqual(of('sitemap'), [`${site.url}/${INDEX}`], 'the Sitemap line');
  assert.deepEqual(of('user-agent'), ['*'], 'one group, for every crawler');
  assert.deepEqual(of('disallow').filter(Boolean), [], 'a Disallow line closes part of the site');
});

test('every page names the sitemap index in its head', () => {
  for (const page of pages) {
    assert.equal(attr(linkTag(read(page), 'sitemap') ?? '', 'href'), `/${INDEX}`, `${page}: link rel="sitemap"`);
  }
});
