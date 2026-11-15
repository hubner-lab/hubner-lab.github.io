// Run after `pnpm build`: node --test tests/site/nojs.test.mjs
// A visitor without JavaScript, a visitor who asked for reduced motion and a printed page must
// all get the whole content. Checked on the build:
//   1. a rule that hides a `.reveal` (or the older `.section-enter`) element does so only under
//      `.js-reveal`, which the head script adds, and only on screen with motion allowed;
//   2. no page carries `js` or `js-reveal` in its markup, and every page says `data-theme="dark"`,
//      so the state without a script is the complete dark page;
//   3. a control marked `data-js-only` is hidden until the script has run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
assert.ok(existsSync(dist), 'dist/ is missing: run `pnpm build` first');

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
const files = walk(dist);
const rel = (f) => path.relative(dist, f);
const pages = files.filter((f) => f.endsWith('.html'));

/** Every stylesheet of the build: the .css files, and the <style> blocks inside the pages. */
const sheets = [
  ...files.filter((f) => f.endsWith('.css')).map((f) => ({ name: rel(f), css: readFileSync(f, 'utf8') })),
  ...pages.flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m, i) => ({ name: `${rel(f)} <style> ${i + 1}`, css: m[1] })),
  ),
];

/**
 * The style rules of a stylesheet as { selector, body, at }, `at` being the preludes of the
 * at-rules around the rule. Blocks that hold no style rules (@keyframes, @font-face, ...) are skipped.
 */
function rules(css) {
  const out = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const closing = (from) => {
    let depth = 0;
    for (let i = from; i < src.length; i++) {
      const c = src[i];
      if (c === '"' || c === "'") { i = src.indexOf(c, i + 1); if (i < 0) break; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return i;
    }
    throw new Error('unbalanced braces in a stylesheet');
  };
  const visit = (start, end, at) => {
    let i = start;
    while (i < end) {
      const open = src.indexOf('{', i);
      const semi = src.indexOf(';', i);
      if (open < 0 || open >= end) break;
      if (semi >= 0 && semi < open) { i = semi + 1; continue; } // a statement such as @import ...;
      const prelude = src.slice(i, open).trim();
      const close = closing(open);
      if (/^@(media|supports|layer|container|scope|starting-style)\b/.test(prelude)) visit(open + 1, close, [...at, prelude]);
      else if (!prelude.startsWith('@')) out.push({ selector: prelude, body: src.slice(open + 1, close), at });
      i = close + 1;
    }
  };
  visit(0, src.length, []);
  return out;
}

const all = sheets.flatMap((s) => rules(s.css).map((r) => ({ ...r, sheet: s.name })));
const REVEAL = /\.(reveal|section-enter)(?![\w-])/;
const HIDES = /(?:^|;)\s*(?:opacity\s*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidden|display\s*:\s*none)\s*(?:!important)?\s*(?:;|$)/;
const splitSelectors = (s) => {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim());
};

test('the build has stylesheets and they parse', () => {
  assert.ok(sheets.length > 0, 'no stylesheet in the build');
  assert.ok(all.length > 50, `only ${all.length} style rules were read: the parser lost the stylesheet`);
});

test('a reveal element is hidden only under .js-reveal, on screen, with motion allowed', () => {
  const hiding = all.filter((r) => REVEAL.test(r.selector) && HIDES.test(r.body));
  assert.ok(hiding.length > 0, 'no rule hides a reveal element at all: the reveal is gone, or this test no longer sees it');
  for (const r of hiding) {
    for (const sel of splitSelectors(r.selector).filter((s) => REVEAL.test(s))) {
      assert.ok(/\.js-reveal(?![\w-])/.test(sel), `${r.sheet}: "${sel}" hides a reveal element without .js-reveal: a page without JavaScript stays blank`);
    }
    const media = r.at.filter((a) => a.startsWith('@media')).join(' ');
    assert.match(media, /prefers-reduced-motion\s*:\s*no-preference/, `${r.sheet}: "${r.selector}" hides a reveal element when reduced motion is asked for`);
    assert.match(media, /\bscreen\b|not\s+print/, `${r.sheet}: "${r.selector}" hides a reveal element on a printed page`);
  }
});

test('no page is marked as scripted in its markup, and every page starts dark', () => {
  assert.ok(pages.length > 0, 'no page in the build');
  for (const f of pages) {
    const tag = /<html\b[^>]*>/.exec(readFileSync(f, 'utf8'))?.[0];
    assert.ok(tag, `${rel(f)} has no <html> tag`);
    assert.match(tag, /\bdata-theme="dark"/, `${rel(f)}: <html> does not say data-theme="dark"`);
    const cls = /\bclass="([^"]*)"/.exec(tag)?.[1] ?? '';
    for (const name of ['js', 'js-reveal']) {
      assert.ok(!cls.split(/\s+/).includes(name), `${rel(f)}: <html> carries the class "${name}" in the markup; only the head script may add it`);
    }
  }
});

test('a control that needs a script is hidden until the script has run', () => {
  const rule = all.find((r) => /:not\(\.js\)/.test(r.selector) && /\[data-js-only\]/.test(r.selector) && /display\s*:\s*none/.test(r.body));
  assert.ok(rule, 'no rule hides [data-js-only] under html:not(.js)');
});
