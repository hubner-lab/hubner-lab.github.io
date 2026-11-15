// Run after `pnpm build`: node tests/team/roster.test.mjs
// Compares the built /team page against tests/team/roster.expected.json, which was taken from
// the page as it was before the team model was changed (Phase 2 of the portal lane).
// `node tests/team/roster.test.mjs --record <html>` rewrites the expectation from a built page.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const EXPECTED = here('./roster.expected.json');

export function extract(html) {
  const sec = html.match(/<section\b[\s\S]*?<\/section>/);
  assert.ok(sec, 'no <section> in the team page');
  const text = (h) =>
    h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const body = sec[0];
  // names in page order: feature card h2, member cards h3, alumni spans
  const names = [...body.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>|<li\b[^>]*>\s*<span\b[^>]*>([\s\S]*?)<\/span>/g)]
    .map((m) => text(m[1] ?? m[2]));
  return { names, text: text(body) };
}

if (process.argv[2] === '--record') {
  writeFileSync(EXPECTED, JSON.stringify(extract(readFileSync(process.argv[3], 'utf8')), null, 2) + '\n');
  console.log('recorded', EXPECTED);
} else {
  const got = extract(readFileSync(here('../../dist/team/index.html'), 'utf8'));
  const want = JSON.parse(readFileSync(EXPECTED, 'utf8'));
  assert.deepEqual(got.names, want.names, 'people differ in name or order');
  assert.equal(got.text, want.text, 'visible text (roles, bios, notes, links) differs');
  console.log(`roster ok: ${got.names.length} people`);
}
