// node --test tests/site/tokens.test.mjs
// The redesign keeps three leftovers alive while pages are rebuilt one by one: the old colour
// token names, the `.section-enter` reveal class and the `.container` wrapper. This test counts
// their uses in src/ against tests/site/tokens.baseline.json. A count may only fall:
//   higher than the baseline  -> an old name came back; use the new one
//   lower than the baseline   -> good; record it, so it cannot rise again:
//                                node tests/site/tokens.test.mjs --record
// When every count is 0 the leftovers are gone and the aliases in global.css with them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SRC = here('../../src/');
const BASELINE = here('./tokens.baseline.json');

const COUNTERS = {
  // soil, data and wheat are aliases of muted, link and accent; the other four are gone already.
  oldTokens: /--color-(?:soil|data|wheat|glow|stem|barley|sunflower)\b|\b(?:text|bg|border|ring|fill|stroke|outline|decoration|from|via|to)-(?:soil|data|wheat|glow|stem|barley|sunflower)\b/g,
  sectionEnter: /\bsection-enter\b/g,
  // the class in markup or in a script string, and the selector in a stylesheet
  container: /\bclass(?::list)?=["'{][^"'}]*(?<![\w-])container(?![\w-])|\.container(?![\w-])/g,
};

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

function count() {
  const totals = Object.fromEntries(Object.keys(COUNTERS).map((k) => [k, 0]));
  const where = Object.fromEntries(Object.keys(COUNTERS).map((k) => [k, []]));
  for (const f of walk(SRC).filter((f) => /\.(astro|ts|mjs|js|css|md|mdx)$/.test(f)).sort()) {
    const text = readFileSync(f, 'utf8');
    for (const [k, re] of Object.entries(COUNTERS)) {
      const n = (text.match(re) ?? []).length;
      if (n) { totals[k] += n; where[k].push(`${path.relative(SRC, f)} ${n}`); }
    }
  }
  return { totals, where };
}

const { totals, where } = count();

if (process.argv.includes('--record')) {
  const old = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  for (const [k, n] of Object.entries(totals)) {
    if (old && n > old[k]) {
      console.error(`not recorded: ${k} rose from ${old[k]} to ${n} (${where[k].join(', ')})`);
      process.exit(1);
    }
  }
  writeFileSync(BASELINE, JSON.stringify(totals, null, 2) + '\n');
  console.log('recorded', totals);
} else {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  for (const k of Object.keys(COUNTERS)) {
    test(`${k}: ${totals[k]} use(s), the baseline is ${baseline[k]}`, () => {
      assert.ok(totals[k] <= baseline[k],
        `${k} rose from ${baseline[k]} to ${totals[k]}: an old name came back. Uses: ${where[k].join(', ')}`);
      assert.ok(totals[k] >= baseline[k],
        `${k} fell from ${baseline[k]} to ${totals[k]}. Record it: node tests/site/tokens.test.mjs --record`);
    });
  }
}
