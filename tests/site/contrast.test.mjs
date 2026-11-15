// node --test tests/site/contrast.test.mjs
// Reads the colour tokens of both themes from src/styles/global.css and holds every text colour
// to 4.5:1 (WCAG AA for body text) on the two backgrounds a page can have, paper and surface.
// Also: the text on an accent fill, the chip text on its tint, and the text over the hero video.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { site } from '../../src/site.config.ts';

const MIN = 4.5;
const CSS = readFileSync(fileURLToPath(new URL('../../src/styles/global.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first block whose prelude matches `head` (braces balanced). */
function block(head) {
  const m = head.exec(CSS);
  assert.ok(m, `global.css has no block matching ${head}`);
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}' && --depth === 0) return CSS.slice(m.index + m[0].length, i);
  }
  assert.fail(`unbalanced braces after ${head}`);
}

const colours = (body) =>
  Object.fromEntries([...body.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const DARK = colours(block(/@theme\s+static\s*\{/));
const LIGHT_OVERRIDES = colours(block(/:root\[data-theme="light"\]\s*\{/));
const THEMES = { dark: DARK, light: { ...DARK, ...LIGHT_OVERRIDES } };

/** Split on the commas of the outermost level only. */
function splitTop(s) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim());
}

/** A CSS colour as { r, g, b, a }: hex, `transparent`, var(--token), color-mix(in srgb, ...). */
function colour(expr, env, seen = []) {
  expr = expr.trim();
  let m;
  if ((m = /^#([0-9a-f]{3,8})$/i.exec(expr))) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    assert.ok(h.length === 6 || h.length === 8, `bad hex colour ${expr}`);
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  if (expr === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if ((m = /^var\((--[\w-]+)\)$/.exec(expr))) {
    assert.ok(m[1] in env, `${m[1]} is not a colour token`);
    assert.ok(!seen.includes(m[1]), `${m[1]} refers to itself`);
    return colour(env[m[1]], env, [...seen, m[1]]);
  }
  if ((m = /^color-mix\((.*)\)$/s.exec(expr))) {
    const [space, ...parts] = splitTop(m[1]);
    assert.equal(space, 'in srgb', `only "in srgb" mixes are understood: ${expr}`);
    assert.equal(parts.length, 2, `color-mix takes two colours: ${expr}`);
    const parsed = parts.map((p) => {
      const pm = /^(.*?)(?:\s+([\d.]+)%)?$/s.exec(p);
      return { c: colour(pm[1], env, seen), p: pm[2] === undefined ? null : Number(pm[2]) / 100 };
    });
    let [p1, p2] = [parsed[0].p, parsed[1].p];
    if (p1 === null && p2 === null) p1 = p2 = 0.5;
    else if (p1 === null) p1 = 1 - p2;
    else if (p2 === null) p2 = 1 - p1;
    assert.ok(Math.abs(p1 + p2 - 1) < 1e-9, `percentages that do not add up to 100% are not understood: ${expr}`);
    const [c1, c2] = [parsed[0].c, parsed[1].c];
    const a = c1.a * p1 + c2.a * p2; // interpolation on premultiplied channels
    const ch = (k) => (a === 0 ? 0 : (c1[k] * c1.a * p1 + c2[k] * c2.a * p2) / a);
    return { r: ch('r'), g: ch('g'), b: ch('b'), a };
  }
  assert.fail(`colour not understood: ${expr}`);
}

const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
});

function luminance({ r, g, b }) {
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast of `fg` on `bg`, both composited over `base` first when they are translucent. */
function ratio(fg, bg, base) {
  const b = base ? over(bg, base) : bg;
  assert.equal(b.a, 1, 'the background must be opaque');
  const [hi, lo] = [luminance(over(fg, b)), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// A colour token is a text colour unless it is listed here. A new token is checked by default.
const NOT_TEXT = new Set([
  '--color-paper', '--color-surface',          // the two page backgrounds
  '--color-line', '--color-plate',             // hairline, image plate
  '--color-leaf-tint', '--color-accent-tint',  // chip fills
  '--color-accent-ink', '--color-on-leaf-tint', '--color-on-accent-tint', // checked on their own fills below
  '--color-on-media',                          // text over the hero video: checked with the scrim
]);

const PALETTE = ['paper', 'surface', 'ink', 'muted', 'link', 'accent', 'leaf'].map((n) => `--color-${n}`);

test('both themes define the whole palette', () => {
  for (const name of PALETTE) {
    assert.ok(name in DARK, `the dark set (@theme static) lacks ${name}`);
    assert.ok(name in LIGHT_OVERRIDES, `the light set lacks ${name}`);
  }
});

for (const [theme, env] of Object.entries(THEMES)) {
  const c = (name) => colour(`var(${name})`, env);
  const check = (label, fg, bg, base) => {
    const r = ratio(fg, bg, base);
    assert.ok(r >= MIN, `${theme}: ${label} is ${r.toFixed(2)}:1, under ${MIN}:1`);
    return r;
  };

  test(`${theme}: every text colour reads on paper and on surface`, (t) => {
    let low = Infinity, lowLabel = '';
    for (const name of Object.keys(env).filter((n) => !NOT_TEXT.has(n))) {
      for (const bg of ['--color-paper', '--color-surface']) {
        const r = check(`${name} on ${bg}`, c(name), c(bg));
        if (r < low) [low, lowLabel] = [r, `${name} on ${bg}`];
      }
    }
    t.diagnostic(`${theme}: lowest text contrast ${low.toFixed(2)}:1 (${lowLabel})`);
  });

  test(`${theme}: text on an accent fill`, () => {
    check('--color-accent-ink on --color-accent', c('--color-accent-ink'), c('--color-accent'));
  });

  test(`${theme}: chip text on its tint`, (t) => {
    let low = Infinity;
    for (const hue of ['leaf', 'accent']) {
      for (const base of ['--color-paper', '--color-surface']) {
        low = Math.min(low, check(`--color-on-${hue}-tint on --color-${hue}-tint over ${base}`,
          c(`--color-on-${hue}-tint`), c(`--color-${hue}-tint`), c(base)));
      }
    }
    t.diagnostic(`${theme}: lowest chip contrast ${low.toFixed(2)}:1`);
  });
}

test('light: the derived tokens written out by hand still follow the formulas', () => {
  // In the light set the derived tokens are literals (a browser without color-mix() would take
  // their fallback from the dark values). Each must equal the dark formula on the light palette.
  const lightPalette = { ...DARK, ...Object.fromEntries(PALETTE.map((n) => [n, LIGHT_OVERRIDES[n]])) };
  for (const name of ['--color-line', '--color-leaf-tint', '--color-accent-tint']) {
    assert.ok(name in LIGHT_OVERRIDES, `the light set lacks ${name}`);
    const want = colour(DARK[name], lightPalette);
    const got = colour(LIGHT_OVERRIDES[name], lightPalette);
    for (const k of ['r', 'g', 'b']) {
      assert.ok(Math.abs(want[k] - got[k]) <= 1, `light ${name}: ${k} is ${got[k]}, the formula gives ${want[k].toFixed(1)}`);
    }
    assert.ok(Math.abs(want.a - got.a) <= 0.004, `light ${name}: alpha is ${got.a.toFixed(3)}, the formula gives ${want.a.toFixed(3)}`);
  }
});

test('the colours of the browser bars in site.config.ts are the paper colours', () => {
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  assert.ok(same(site.themeColor.dark, DARK['--color-paper']), `themeColor.dark is ${site.themeColor.dark}, --color-paper is ${DARK['--color-paper']}`);
  assert.ok(same(site.themeColor.light, LIGHT_OVERRIDES['--color-paper']), `themeColor.light is ${site.themeColor.light}, the light --color-paper is ${LIGHT_OVERRIDES['--color-paper']}`);
});

// ---------------------------------------------------------------- the text over the hero video
// The hero text stands on a scrim of its own (src/components/Hero.astro, `.foot::before`). The
// video behind it can show anything, so the scrim is held to the worst case: with its least
// opacity under the text, the text must read 4.5:1 over pure white. The rest is what makes that
// opacity hold for every line: the scrim does not get lighter below the first line, no line is
// wider than the column the scrim covers whole, and no text is dimmed.

const HERO = readFileSync(fileURLToPath(new URL('../../src/components/Hero.astro', import.meta.url)), 'utf8');
const HERO_CSS = (/<style>([\s\S]*?)<\/style>/.exec(HERO)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
const heroRule = (selector) => {
  const at = HERO_CSS.indexOf(`${selector} {`);
  assert.ok(at >= 0, `Hero.astro has no rule "${selector}"`);
  let depth = 0;
  for (let i = HERO_CSS.indexOf('{', at); i < HERO_CSS.length; i++) {
    if (HERO_CSS[i] === '{') depth++;
    else if (HERO_CSS[i] === '}' && --depth === 0) return HERO_CSS.slice(HERO_CSS.indexOf('{', at) + 1, i);
  }
  assert.fail(`unbalanced braces after "${selector}"`);
};
const heroVar = (name) => {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(HERO_CSS);
  assert.ok(m, `Hero.astro does not set ${name}`);
  return m[1].trim();
};

test('hero: the text reads 4.5:1 on its scrim even over a white frame of the video', (t) => {
  const [r, g, b] = heroVar('--scrim').split(/\s+/).map(Number);
  const least = Number(heroVar('--scrim-under-text'));
  assert.ok([r, g, b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255), '--scrim must be "r g b"');
  assert.ok(least > 0 && least <= 1, '--scrim-under-text must be an opacity');
  const text = colour(DARK['--color-on-media'], DARK);
  const white = { r: 255, g: 255, b: 255, a: 1 };
  const got = ratio(text, { r, g, b, a: least }, white);
  assert.ok(got >= MIN, `--color-on-media on the scrim at ${least} over white is ${got.toFixed(2)}:1, under ${MIN}:1`);
  t.diagnostic(`hero: text on the scrim at ${least} over white ${got.toFixed(2)}:1`);

  // the scrim reaches that opacity at the first line and is not lighter at the bottom
  const scrim = heroRule('.foot::before');
  const stops = /background:\s*linear-gradient\(\s*180deg,([\s\S]*?)\);/.exec(scrim)?.[1];
  assert.ok(stops, 'the scrim of the text is no longer a top-to-bottom gradient');
  const parts = splitTop(stops);
  assert.equal(parts.length, 3, 'the scrim of the text has three stops: nothing, the first line, the bottom');
  assert.match(parts[1], /^rgb\(var\(--scrim\) \/ var\(--scrim-under-text\)\) var\(--fade\)$/, 'the stop at the first line');
  const bottom = Number(/^rgb\(var\(--scrim\) \/ ([\d.]+)\) 100%$/.exec(parts[2])?.[1]);
  assert.ok(bottom >= least, `the scrim is ${bottom} at the bottom, lighter than ${least} at the first line`);
  assert.match(scrim, /top:\s*calc\(-1 \* var\(--fade\)\)/, 'the scrim must start --fade above the text, where the gradient reaches the opacity');
});

test('hero: no line of the text leaves the column that the scrim covers whole, and no text is dimmed', () => {
  assert.match(heroRule('.foot > *'), /max-width:\s*min\(100%, var\(--text-col\)\)/, 'every line of the text is held to --text-col');
  const mask = /--mask:\s*linear-gradient\(([\s\S]*?)\);/.exec(heroRule('.foot::before'))?.[1];
  assert.ok(mask, 'the scrim has no --mask');
  const whole = splitTop(mask).filter((p) => p.startsWith('#000 '));
  assert.deepEqual(whole, ['#000 calc(100vw - 2rem)', '#000 calc(100vw + var(--text-col) + 2rem)'],
    'the mask must be whole from just before the text column to just after it');
  assert.match(heroRule('.foot::before'), /left:\s*-100vw/, 'the left edge of the text is 100vw into the scrim: the mask counts from there');
  for (const selector of ['.foot', '.eyebrow', '.foot > .title', '.foot > .tag', '.actions']) {
    assert.ok(!/\bopacity\s*:/.test(heroRule(selector)), `${selector} is dimmed with opacity: its contrast is no longer what the test above holds`);
  }
});
