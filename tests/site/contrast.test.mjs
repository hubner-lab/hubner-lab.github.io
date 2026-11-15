// node --test tests/site/contrast.test.mjs
// Reads the colour tokens of both themes from src/styles/global.css and holds every text colour
// to 4.5:1 (WCAG AA for body text) on the two backgrounds a page can have, paper and surface.
// Also: the text on an accent fill, and the chip text on its tint.
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
