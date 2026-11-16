// Run after `pnpm build`: node tests/team/roster.test.mjs
// The people on the built /team page, in page order, against tests/team/roster.expected.json:
// nobody is lost, added or moved by a change of the page or of the team model.
// A person is an element with `data-person`, a card or a line of the Alumni list; the name is
// the text of its first element of class "name". What a card shows about a person is checked
// by tests/site/team.test.mjs.
// `node tests/team/roster.test.mjs --record <html>` rewrites the expectation from a built page.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const EXPECTED = here('./roster.expected.json');

export function extract(html) {
  const text = (h) =>
    h.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const names = [];
  for (const m of html.matchAll(/<(article|li)\b[^>]*\sdata-person(?=[\s=>])[^>]*>/g)) {
    const end = html.indexOf(`</${m[1]}>`, m.index);
    assert.ok(end > m.index, `a <${m[1]} data-person> is not closed`);
    const name = /<([a-z0-9]+)\b[^>]*\sclass="(?:[^"]*\s)?name(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/\1>/.exec(html.slice(m.index, end));
    assert.ok(name, 'a person on the Team page has no element of class "name"');
    names.push(text(name[2]));
  }
  assert.ok(names.length > 0, 'no person (data-person) on the Team page');
  return { names };
}

if (process.argv[2] === '--record') {
  writeFileSync(EXPECTED, JSON.stringify(extract(readFileSync(process.argv[3], 'utf8')), null, 2) + '\n');
  console.log('recorded', EXPECTED);
} else {
  const got = extract(readFileSync(here('../../dist/team/index.html'), 'utf8'));
  const want = JSON.parse(readFileSync(EXPECTED, 'utf8'));
  assert.deepEqual(got.names, want.names, 'people differ in name or order');
  console.log(`roster ok: ${got.names.length} people`);
}
