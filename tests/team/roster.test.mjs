// Run after `pnpm build`: node tests/team/roster.test.mjs
// The people on the built /team page are exactly the people of src/content/team/: every file is
// on the page once, and nobody is on the page without a file. The names are compared as two
// sorted lists, so a change of the page, of the team model or of the sync that loses or doubles
// a person fails here.
// No list of names is kept in the repository: the members portal changes who is on the page
// (scripts/members_sync.py writes the files), and a fixed list would be out of date at the next
// approved card. The order on the page is held by tests/site/team.test.mjs (the entries written
// by hand) and tests/team/model.test.mjs (the sort itself).
// A person is an element with `data-person`, a card or a line of the Alumni list; the name is
// the text of its first element of class "name".
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TEAM = here('../../src/content/team/');

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

/**
 * The `name` of a team file. An entry written by hand has a bare YAML scalar, the sync writes a
 * JSON string (scripts/members_sync.py, js()), and a single-quoted scalar doubles its quotes.
 */
export function nameOf(file, source) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  assert.ok(front, `${file}: no front matter`);
  const line = /^name:[ \t]*(\S.*?)[ \t]*$/m.exec(front[1]);
  assert.ok(line, `${file}: no name`);
  const raw = line[1];
  const name = raw.startsWith('"') ? JSON.parse(raw) : raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
  // the page prints a name with its white space folded, as extract() reads it
  return name.replace(/\s+/g, ' ').trim();
}

const sorted = (names) => [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const files = readdirSync(TEAM).filter((f) => f.endsWith('.md')).sort();
assert.ok(files.length > 0, 'src/content/team/ holds no entry');
const want = files.map((f) => nameOf(f, readFileSync(path.join(TEAM, f), 'utf8')));
const got = extract(readFileSync(here('../../dist/team/index.html'), 'utf8')).names;
assert.deepEqual(sorted(got), sorted(want), 'the people on the Team page are not the people of src/content/team/');
console.log(`roster ok: ${got.length} people on the page, ${files.length} files`);
