// Run after `pnpm build`: node --test tests/portal/preview.test.mjs
// The members portal fills a real TeamCard while the member types: updatePreview() in
// src/members/main.ts looks up the card's `data-f` hooks inside #m-preview and stops at the first
// one of these four that is missing. A redesign of the card must keep them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['name', 'role', 'bio', 'photo'];

const html = readFileSync(fileURLToPath(new URL('../../dist/members/index.html', import.meta.url)), 'utf8');

test('the preview card on /members keeps the hooks the portal fills', () => {
  const start = html.indexOf('id="m-preview"');
  assert.ok(start >= 0, '/members has no #m-preview');
  const end = html.indexOf('</aside>', start);
  assert.ok(end > start, '#m-preview is not inside an <aside>');
  const preview = html.slice(start, end);
  for (const hook of REQUIRED) {
    assert.ok(preview.includes(`data-f="${hook}"`), `the preview card has no data-f="${hook}": the live preview would stop there`);
  }
});
