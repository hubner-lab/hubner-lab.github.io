// Run after `pnpm build`: node tests/portal/bundle.test.mjs
// 1. The Firebase SDK is only reachable from the /members page, never from another page.
// 2. /members is noindex and says the portal is not configured (src/data/firebase-config.json is absent).
// 3. The emulator branch is dead code in a normal build.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const astroDir = path.join(dist, '_astro');

// Strings that only the Firebase SDK contains.
const SDK_MARKERS = ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'FirebaseError'];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );

const html = (rel) => readFileSync(path.join(dist, rel), 'utf8');
const jsFiles = existsSync(astroDir) ? walk(astroDir).filter((f) => f.endsWith('.js')) : [];
const text = new Map(jsFiles.map((f) => [f, readFileSync(f, 'utf8')]));

/** Every JS file reachable from a page: its module scripts, then their static and dynamic imports. */
function reachable(page) {
  const seen = new Set();
  const queue = [...html(page).matchAll(/(?:src|href)="(\/_astro\/[^"]+\.js)"/g)].map((m) => path.join(dist, m[1]));
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f) || !text.has(f)) continue;
    seen.add(f);
    for (const m of text.get(f).matchAll(/(?:from|import)\s*\(?\s*["'](\.\/[^"']+\.js)["']/g)) {
      queue.push(path.join(path.dirname(f), m[1]));
    }
  }
  return seen;
}

const pages = walk(dist).filter((f) => f.endsWith('.html')).map((f) => path.relative(dist, f));
const sdkFiles = jsFiles.filter((f) => SDK_MARKERS.some((m) => text.get(f).includes(m)));

test_sdk_only_in_members: {
  assert.ok(sdkFiles.length > 0, 'the Firebase SDK is not in the build at all: /members lost its script');
  const members = reachable('members/index.html');
  for (const f of sdkFiles) {
    assert.ok(members.has(f), `${path.relative(dist, f)} contains the Firebase SDK but /members does not load it`);
  }
  for (const page of pages.filter((p) => p !== 'members/index.html')) {
    const leaked = [...reachable(page)].filter((f) => sdkFiles.includes(f));
    assert.deepEqual(leaked.map((f) => path.relative(dist, f)), [], `${page} loads the Firebase SDK`);
  }
}

test_members_page: {
  const m = html('members/index.html');
  assert.match(m, /<meta name="robots" content="noindex"\s*\/?>/, '/members is missing the noindex tag');
  assert.ok(m.includes('The members portal is not configured yet'), '/members does not say it is not configured');
  assert.ok(!m.includes('data-test-signin'), 'emulator test buttons are in a normal build');
  for (const p of pages.filter((p) => p !== 'members/index.html')) {
    assert.ok(!/name="robots" content="noindex"/.test(html(p)), `${p} is noindex`);
  }
}

test_emulator_dead: {
  for (const f of jsFiles) {
    for (const needle of ['demo-members', 'demo-api-key', 'test-member', '127.0.0.1']) {
      assert.ok(!text.get(f).includes(needle), `${path.relative(dist, f)} contains emulator code (${needle})`);
    }
  }
}

console.log(`portal bundle ok: SDK in ${sdkFiles.length} file(s), all reachable only from /members`);
