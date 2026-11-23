// Run after `pnpm build`: node --test tests/site/research.test.mjs
// The built Research page:
//   1. its outline: one title, the three research areas under "Three questions", the study systems;
//   2. the three pictures: WebP files of the build, made for the size they are shown at, each
//      with a text for a visitor who does not see it; the old copies in public/ are gone;
//   3. Latin names, and only Latin names, are in italics (<i>, the element for the name of a
//      species), in the cards and in the pills;
//   4. the animation is decoration: hidden from a screen reader and absent without a script.
// What keeps the head readable over the animation is held by tests/site/contrast.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
assert.ok(existsSync(dist), 'dist/ is missing: run `pnpm build` first');

const KB = 1024;
const SHOWN = 142; // px: how tall the plate lets a picture be (src/components/PillarCard.astro)

const html = readFileSync(path.join(dist, 'research/index.html'), 'utf8');
const main = /<main\b[^>]*>([\s\S]*?)<\/main>/.exec(html)?.[1] ?? '';
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const has = (tag, name) => new RegExp(`\\s${name}(?=[\\s=>])`).test(tag);
const text = (markup) => markup.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** The markup of every element `<name ...marker...>` ... `</name>` (not nested in itself). */
const blocks = (markup, name, marker) =>
  [...markup.matchAll(new RegExp(`<${name}\\b[^>]*${marker}[^>]*>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[0]);
const BINOMIAL = /^[A-Z][a-z]+ [a-z]+$/;

const cards = blocks(main, 'article', '\\sdata-pillar\\b');
const pillars = blocks(main, 'section', '\\sdata-pillars\\b')[0] ?? '';
const systems = blocks(main, 'section', '\\sdata-systems\\b')[0] ?? '';

test('the outline: one title, three research areas under one heading, the study systems', () => {
  assert.ok(main, 'the page has no <main>');
  const headings = [...main.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => `${m[1]} ${text(m[2])}`);
  assert.deepEqual(headings, [
    'h1 The genomics of plant evolution',
    'h2 Three questions',
    'h3 Speciation', 'h3 Adaptation', 'h3 Domestication',
    'h2 Study systems',
  ]);
  assert.equal(cards.length, 3, 'three cards');
  for (const card of cards) assert.ok(pillars.includes(card), 'every card stands in the section of the three questions');
});

test('each card has a picture, a text and its species', () => {
  for (const card of cards) {
    const title = text(/<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? '');
    assert.equal([...card.matchAll(/<img\b/g)].length, 1, `${title}: one picture`);
    const words = text(/<p\b[^>]*class="text"[^>]*>([\s\S]*?)<\/p>/.exec(card)?.[1] ?? '');
    assert.ok(words.length > 120, `${title}: the text is missing or short (${words.length} characters)`);
    assert.match(words, /\?/, `${title}: the text opens with the question the area asks`);
    const chips = /<ul\b[^>]*class="chips"[^>]*>([\s\S]*?)<\/ul>/.exec(card)?.[1] ?? '';
    assert.ok([...chips.matchAll(/<li\b/g)].length >= 2, `${title}: at least two species`);
  }
});

test('the pictures: WebP files of the build, sized for the plate, with a text for who does not see them', (t) => {
  const sizes = [];
  for (const card of cards) {
    const title = text(/<h3\b[^>]*>([\s\S]*?)<\/h3>/.exec(card)?.[1] ?? '');
    const img = /<img\b[^>]*>/.exec(card)[0];
    assert.ok((attr(img, 'alt') ?? '').length >= 10, `${title}: the picture has no text for a visitor who does not see it`);
    assert.ok(Number(attr(img, 'width')) > 0 && Number(attr(img, 'height')) > 0, `${title}: the picture gives no size, so the page jumps when it loads`);
    assert.equal(attr(img, 'loading'), 'lazy', `${title}: the picture is below the first screen on a phone and must wait for it`);
    assert.equal(attr(img, 'sizes'), `${SHOWN}px`, `${title}: the picture says how large it is shown`);
    const offers = (attr(img, 'srcset') ?? '').split(',').map((s) => s.trim().split(/\s+/));
    assert.ok(offers.length >= 2, `${title}: the picture comes in one size only`);
    const widths = offers.map(([, w]) => Number(/^(\d+)w$/.exec(w ?? '')?.[1]));
    assert.ok(widths.every((w) => w > 0), `${title}: every file of the picture names its width`);
    assert.equal(Math.min(...widths), SHOWN, `${title}: the smallest file is the size the picture is shown at`);
    assert.ok(Math.max(...widths) <= SHOWN * 2, `${title}: a file wider than twice the shown size (${Math.max(...widths)}px) is weight nobody sees`);
    for (const file of [attr(img, 'src'), ...offers.map(([f]) => f)]) {
      assert.match(file, /^\/_astro\/[^/]+\.webp$/, `${title}: ${file} is not a WebP file made by the build`);
      const full = path.join(dist, file);
      assert.ok(existsSync(full), `${title}: ${file} is not in the build`);
      sizes.push(statSync(full).size);
      assert.ok(statSync(full).size <= 80 * KB, `${title}: ${file} is ${(statSync(full).size / KB).toFixed(1)} KB, over 80 KB`);
    }
  }
  t.diagnostic(`pillar pictures: ${sizes.length} files named, the largest ${(Math.max(...sizes) / KB).toFixed(1)} KB`);
});

test('the old copies of the pictures in public/ are gone: no page names them and the build does not carry them', () => {
  const old = ['botanical/phylogenetic_tree-removebg.png', 'botanical/adaptation_crop.png', 'botanical/domestication_crops.png'];
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  const pages = walk(dist).filter((f) => f.endsWith('.html'));
  for (const file of old) {
    assert.ok(!existsSync(path.join(dist, file)), `${file} is still in the build`);
    for (const page of pages) {
      assert.ok(!readFileSync(page, 'utf8').includes(file), `${path.relative(dist, page)} still names ${file}`);
    }
  }
});

test('Latin names are in italics, and nothing else is', () => {
  const italics = [...main.matchAll(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => text(m[2]));
  assert.ok(italics.length >= 12, `only ${italics.length} italic runs: the species names lost their <i>`);
  for (const run of italics) assert.match(run, BINOMIAL, `"${run}" is in italics and is not a Latin name`);
  // a name that is in italics somewhere is in italics everywhere
  const plain = text(main.replace(/<(em|i)\b[^>]*>[\s\S]*?<\/\1>/g, ' '));
  for (const name of new Set(italics)) {
    assert.ok(!plain.includes(name), `"${name}" also stands in upright type on the page`);
  }
  // the chips of a card hold a Latin name and nothing else
  for (const card of cards) {
    const chips = /<ul\b[^>]*class="chips"[^>]*>([\s\S]*?)<\/ul>/.exec(card)[1];
    for (const [, item] of chips.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)) {
      assert.match(item, /<i\b[^>]*>[^<]+<\/i>/, `the chip "${text(item)}" is not in italics`);
      assert.match(text(item), BINOMIAL, `the chip "${text(item)}" is not a Latin name`);
    }
  }
});

test('the study systems: seven pills, the common name upright and the Latin name in italics', () => {
  const pills = [...systems.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  assert.equal(pills.length, 7, 'seven study systems');
  for (const pill of pills) {
    // upright text first; then, when the lab gives one, the Latin name alone in italics, in brackets
    const m = /^([^<(]+?)(?: \(<i\b[^>]*>([^<]+)<\/i>\))?$/.exec(pill.trim());
    assert.ok(m, `the pill "${text(pill)}" is not "Common name (Latin name)" with only the Latin name in italics`);
    if (m[2]) assert.match(m[2], BINOMIAL, `"${m[2]}" is not a Latin name`);
  }
  assert.ok(pills.filter((p) => /<i\b/.test(p)).length >= 6, 'the Latin names of the pills are gone');
});

test('the animation is decoration: hidden from a screen reader, absent without a script', () => {
  const canvases = [...main.matchAll(/<canvas\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(canvases.length, 1, 'one canvas');
  assert.ok(has(canvases[0], 'data-rd-preset'), 'the canvas is the reaction-diffusion one');
  const field = /<div\b[^>]*class="field"[^>]*>/.exec(main)?.[0];
  assert.ok(field, 'the frame of the animation (.field) is missing');
  assert.ok(main.indexOf(field) < main.indexOf(canvases[0]), 'the canvas stands inside its frame');
  assert.equal(attr(field, 'aria-hidden'), 'true', 'the animation is read out to a screen reader');
  assert.ok(has(field, 'data-js-only'), 'without a script nothing draws the animation: its frame must not take room then');
  assert.ok(main.indexOf(canvases[0]) < main.indexOf('<h1'), 'the animation belongs to the head of the page');
});
