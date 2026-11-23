// node --test tests/site/tokens.test.mjs
// The redesign replaced three names, and none of them may come back into src/:
//   the old colour tokens (soil, data, wheat, glow, stem, barley, sunflower), as custom
//     properties or inside a utility class: the colours are now paper, surface, ink, muted,
//     link, accent and leaf;
//   the reveal class `section-enter`: it is now `reveal`;
//   the page wrapper class `container`: it is now `wrap`, and the old name would switch on
//     Tailwind's own container utility.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));

const RETIRED = {
  'an old colour token': /--color-(?:soil|data|wheat|glow|stem|barley|sunflower)\b|\b(?:text|bg|border|ring|fill|stroke|outline|decoration|from|via|to)-(?:soil|data|wheat|glow|stem|barley|sunflower)\b/g,
  'the class section-enter': /\bsection-enter\b/g,
  // the class in markup or in a script string, and the selector in a stylesheet
  'the class container': /\bclass(?::list)?=["'{][^"'}]*(?<![\w-])container(?![\w-])|\.container(?![\w-])/g,
};

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
const sources = walk(SRC)
  .filter((f) => /\.(astro|ts|mjs|js|css|md|mdx)$/.test(f))
  .sort()
  .map((f) => [path.relative(SRC, f), readFileSync(f, 'utf8')]);

test('the sources are read', () => {
  assert.ok(sources.length > 40, `only ${sources.length} source files found under src/`);
});

for (const [what, pattern] of Object.entries(RETIRED)) {
  test(`${what} is used nowhere in src/`, () => {
    const uses = sources.flatMap(([file, text]) => {
      const n = (text.match(pattern) ?? []).length;
      return n ? [`${file} (${n})`] : [];
    });
    assert.deepEqual(uses, [], `${what} is back: ${uses.join(', ')}`);
  });
}
