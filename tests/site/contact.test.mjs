// Run after `pnpm build`: node --test tests/site/contact.test.mjs
// The built Contact page, and the "Join us" band it shares with the home page:
//   1. the facts are those of src/site.config.ts: the PI, the email, the address, the links;
//   2. the two copy buttons carry exactly the email and the address, and are shown only when a
//      script can serve them;
//   3. the map is a picture of the build, in two sizes, with the credit its licence asks for and
//      a link that opens the place; the page asks no other site for anything, and has no frame;
//   4. the picture shows the place of site.config.ts: src/assets/contact/map.json records what
//      scripts/contact-map.mjs drew, and the pin stands on the centre of the picture;
//   5. the "Join us" band is on the home page and here exactly when the config switches it on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { site } from '../../src/site.config.ts';
import { pictures, SHOWN, SCALES } from '../../scripts/contact-map.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = here('../../dist/');
assert.ok(existsSync(dist), 'dist/ is missing: run `pnpm build` first');

const KB = 1024;
const html = readFileSync(path.join(dist, 'contact/index.html'), 'utf8');
const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const has = (tag, name) => new RegExp(`\\s${name}(?=[\\s=>])`).test(tag);
const unescape = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (markup) => unescape(markup.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const tags = (markup, name) => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
/** Every link of `markup` as { href, text, tag }. */
const links = (markup) =>
  [...markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ tag: /<a\b[^>]*>/.exec(m[0])[0], href: attr(m[0], 'href'), text: text(m[1]) }));

// ------------------------------------------------------------------------------ 1. the facts

test('the page shows the PI, the email and the address of site.config.ts', () => {
  assert.ok(main, 'the page has no <main>');
  assert.equal([...main.matchAll(/<h1\b/g)].length, 1, 'one title');
  const words = text(main);
  assert.ok(words.includes(site.pi.name), 'the name of the PI');
  assert.ok(words.includes(site.pi.title), 'the title of the PI');

  const details = /<dl\b[^>]*\sdata-contact\b[^>]*>([\s\S]*?)<\/dl>/.exec(main)?.[1];
  assert.ok(details, 'the page has no list of contact details (dl[data-contact])');
  const mail = links(details).filter((a) => a.href?.startsWith('mailto:'));
  assert.deepEqual(mail.map((a) => a.href), [`mailto:${site.pi.email}`], 'one email link among the details, to the PI');
  assert.equal(mail[0].text, site.pi.email, 'the email address is written out, so it can be read and copied by hand');

  const address = /<address\b[^>]*>([\s\S]*?)<\/address>/.exec(main)?.[1];
  assert.ok(address, 'the page has no <address>');
  assert.deepEqual(address.split(/<br\b[^>]*>/).map(text), site.address, 'the lines of the address, in order');
});

test('the links: Google Scholar and the institutes, each in a new tab and said so', () => {
  const want = [
    `https://scholar.google.com/citations?user=${site.pi.scholar}`,
    ...site.affiliations.map((a) => a.url).filter(Boolean),
  ];
  const outside = links(main).filter((a) => /^https?:/.test(a.href ?? ''));
  for (const href of want) {
    assert.ok(outside.some((a) => a.href === href), `no link to ${href}`);
  }
  for (const a of outside) {
    assert.equal(attr(a.tag, 'target'), '_blank', `${a.href} leaves the site in the same tab`);
    assert.match(attr(a.tag, 'rel') ?? '', /\bnoopener\b/, `${a.href}: rel lacks noopener`);
    assert.match(a.text, /\(opens in a new tab\)$/, `${a.href}: a screen reader is not told that it opens a new tab`);
  }
});

// ------------------------------------------------------------------------------ 2. the copy buttons

test('the copy buttons carry the email and the address, and wait for a script', () => {
  const buttons = tags(main, 'button').filter((b) => has(b, 'data-copy'));
  assert.equal(buttons.length, 2, 'two copy buttons');
  const carried = buttons.map((b) => unescape(attr(b, 'data-copy') ?? ''));
  assert.deepEqual(carried, [site.pi.email, site.address.join('\n')], 'what the buttons copy: the email, then the address as lines');
  for (const b of buttons) {
    assert.equal(attr(b, 'type'), 'button');
    assert.ok(has(b, 'data-js-only'), 'a copy button without a script does nothing: it must be marked data-js-only');
    assert.match(attr(b, 'aria-label') ?? '', /^Copy the /, 'the name of the button starts with the word it shows, and says what it copies');
    assert.ok((attr(b, 'data-copied') ?? '').length > 0, 'the sentence for a screen reader after copying');
  }
  assert.notEqual(attr(buttons[0], 'aria-label'), attr(buttons[1], 'aria-label'), 'the two buttons have the same name');
  const status = tags(main, 'p').filter((p) => has(p, 'data-copy-status'));
  assert.equal(status.length, 1, 'one place that tells a screen reader what was copied');
  assert.equal(attr(status[0], 'role'), 'status');
});

// ------------------------------------------------------------------------------ 3. the map on the page

const figure = /<figure\b[^>]*\sdata-map\b[^>]*>([\s\S]*?)<\/figure>/.exec(main)?.[1] ?? '';
const about = JSON.parse(readFileSync(here('../../src/assets/contact/map.json'), 'utf8'));

test('the map is a picture of the build in two sizes, and says what it shows', async (t) => {
  assert.ok(figure, 'the page has no map (figure[data-map])');
  const imgs = tags(figure, 'img');
  assert.equal(imgs.length, 1, 'one picture');
  const img = imgs[0];
  assert.ok((attr(img, 'alt') ?? '').includes(site.map.label), 'the text of the picture names the place');
  assert.equal(Number(attr(img, 'width')), SHOWN.width);
  assert.equal(Number(attr(img, 'height')), SHOWN.height);
  assert.equal(attr(img, 'loading'), 'lazy');

  const offers = (attr(img, 'srcset') ?? '').split(',').map((s) => s.trim().split(/\s+/));
  assert.deepEqual(offers.map(([, density]) => density), SCALES.map((s) => `${s}x`), 'one file for a plain screen, one for a dense screen');
  assert.equal(attr(img, 'src'), offers[0][0], 'a browser that knows no srcset gets the plain picture');
  const sizes = [];
  for (const [i, [file]] of offers.entries()) {
    assert.match(file, /^\/_astro\/[^/]+\.webp$/, `${file} is not a file made by the build`);
    const full = path.join(dist, file);
    assert.ok(existsSync(full), `${file} is not in the build`);
    const { width, height } = await sharp(full).metadata();
    assert.deepEqual({ width, height }, { width: SHOWN.width * SCALES[i], height: SHOWN.height * SCALES[i] }, `${file}: the size of the picture for ${SCALES[i]}x`);
    assert.ok(statSync(full).size <= 80 * KB, `${file} is ${(statSync(full).size / KB).toFixed(1)} KB, over 80 KB`);
    sizes.push(`${SCALES[i]}x ${(statSync(full).size / KB).toFixed(1)} KB`);
  }
  t.diagnostic(`contact map: ${sizes.join(', ')}`);
});

test('the map has its credit and a link that opens the place', () => {
  const all = links(figure);
  const credit = all.find((a) => a.href === 'https://www.openstreetmap.org/copyright');
  assert.ok(credit, 'the map has no link to the OpenStreetMap copyright page');
  assert.ok(credit.text.startsWith(about.credit), `the credit must read "${about.credit}"`);
  assert.equal(about.credit, '© OpenStreetMap contributors');
  const open = all.filter((a) => has(a.tag, 'data-map-open'));
  assert.equal(open.length, 1, 'one link that opens the place');
  assert.equal(open[0].href, site.map.osmUrl);
  assert.match(site.map.osmUrl, /^https:\/\/www\.openstreetmap\.org\//, 'the place opens on openstreetmap.org');
  assert.match(open[0].text, /OpenStreetMap/);
});

test('opening the page asks no other site for anything', () => {
  assert.ok(!/<iframe\b/i.test(html), 'the page has a frame');
  assert.ok(!/openstreetmap\.org\/export/.test(html), 'the page still builds an embedded map');
  const loaded = [
    ...tags(html, 'img').flatMap((tag) => [attr(tag, 'src'), ...(attr(tag, 'srcset') ?? '').split(',').map((s) => s.trim().split(/\s+/)[0])]),
    ...tags(html, 'script').map((tag) => attr(tag, 'src')),
    ...tags(html, 'link').filter((tag) => /\b(stylesheet|preload|modulepreload|icon)\b/.test(attr(tag, 'rel') ?? '')).map((tag) => attr(tag, 'href')),
    ...tags(html, 'source').map((tag) => attr(tag, 'src')),
  ].filter(Boolean);
  assert.ok(loaded.length > 3, 'this test no longer sees what the page loads');
  for (const url of loaded) {
    assert.match(url, /^\/(?!\/)/, `the page loads ${url} from another site`);
  }
});

// ------------------------------------------------------------------------------ 4. the place

test('the picture was drawn for the point and the zoom of site.config.ts', () => {
  assert.deepEqual(
    { lat: about.lat, lon: about.lon, zoom: about.zoom },
    { lat: site.map.lat, lon: site.map.lon, zoom: site.map.zoom },
    'site.map changed and the picture did not: run `node scripts/contact-map.mjs`, look at the pictures, commit them with map.json',
  );
  assert.deepEqual(about.shown, SHOWN);
  const want = pictures(site.map.lat, site.map.lon, site.map.zoom);
  assert.equal(about.pictures.length, want.length);
  for (const [i, p] of want.entries()) {
    const got = about.pictures[i];
    assert.equal(got.file, p.file);
    assert.equal(got.tiles, `zoom ${p.tileZoom}, x ${p.x0} to ${p.x1}, y ${p.y0} to ${p.y1}`, `${p.file}: the tiles around the point`);
    // the file itself: a PNG of the recorded size (width and height are bytes 16 to 23)
    const png = readFileSync(here(`../../src/assets/contact/${p.file}`));
    assert.equal(png.toString('latin1', 1, 4), 'PNG', `${p.file} is not a PNG file`);
    assert.deepEqual({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }, { width: p.width, height: p.height }, `${p.file}: its size`);
    assert.deepEqual({ width: got.width, height: got.height, scale: got.scale }, { width: p.width, height: p.height, scale: p.scale });
  }
  assert.match(about.fetched, /^\d{4}-\d{2}-\d{2}$/, 'the day the tiles were fetched');
});

test('the pin stands on the centre of the frame, where the picture keeps the point', () => {
  assert.equal([...figure.matchAll(/<span\b[^>]*class="pin"[^>]*>/g)].length, 1, 'one pin');
  assert.equal(attr(/<span\b[^>]*class="pin"[^>]*>/.exec(figure)[0], 'aria-hidden'), 'true', 'the pin is a drawing: the text of the picture names the place');
  // The point is the centre of both pictures. So the frame must show the picture centred,
  // whatever its own width, and the pin must stand on the centre of the frame.
  const css = (/<style>([\s\S]*?)<\/style>/.exec(readFileSync(here('../../src/pages/contact.astro'), 'utf8'))?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector) => {
    const m = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `contact.astro has no rule "${selector}"`);
    return m[1];
  };
  assert.match(rule('.picture'), /object-fit:\s*cover/, 'the picture fills the frame');
  assert.match(rule('.picture'), /object-position:\s*center/, 'the picture is centred in the frame');
  assert.match(rule('.pin'), /left:\s*50%/, 'the pin is centred from side to side');
  assert.match(rule('.pin'), /top:\s*50%/, 'the pin is centred from top to bottom');
  assert.match(rule('.pin'), /margin:\s*calc\(var\(--pin\) \* -1\.207\) 0 0 calc\(var\(--pin\) \* -0\.5\)/, 'the tip of the pin, not its corner, is on the centre');
  assert.match(rule('.open::after'), /height:\s*var\(--map-height\)/, 'the link reaches over the whole map');
  assert.match(rule('.frame'), /height:\s*var\(--map-height\)/);
});

// ------------------------------------------------------------------------------ 5. the "Join us" band

test('the "Join us" band is on the home and contact pages exactly when the config says so', () => {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  const withBand = walk(dist)
    .filter((f) => f.endsWith('.html'))
    .filter((f) => /\sdata-join-us(?=[\s=>])/.test(readFileSync(f, 'utf8')))
    .map((f) => path.relative(dist, f).split(path.sep).join('/'))
    .sort();
  if (!site.joinUs.enabled) {
    assert.deepEqual(withBand, [], 'joinUs.enabled is false and the band is on a page');
    return;
  }
  assert.deepEqual(withBand, ['contact/index.html', 'index.html'], 'the pages that carry the band');
  assert.ok(site.joinUs.title.trim() && site.joinUs.text.trim(), 'the band is switched on without a title or a text');
  for (const page of withBand) {
    const band = /<section\b[^>]*\sdata-join-us\b[^>]*>([\s\S]*?)<\/section>/.exec(readFileSync(path.join(dist, page), 'utf8'))?.[1] ?? '';
    assert.equal(text(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(band)?.[1] ?? ''), site.joinUs.title, `${page}: the title of the band`);
    assert.ok(text(band).includes(site.joinUs.text), `${page}: the text of the band`);
    const [button, ...more] = links(band);
    assert.ok(button && more.length === 0, `${page}: the band has one button`);
    // from the home page the button leads to the Contact page; there, it writes to the PI
    assert.equal(button.href, page === 'index.html' ? '/contact/' : `mailto:${site.pi.email}`, `${page}: where the button leads`);
  }
});
