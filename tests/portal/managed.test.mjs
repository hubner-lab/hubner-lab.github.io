// node --test tests/portal/managed.test.mjs  (Node 24 strips the TypeScript types itself)
// Records an admin keeps for people without an account: ids, the marker, adoption of a hand-written entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGED_PROVIDER, managedId, isManagedId, isManagedCard, valuesFromHandwritten, parseHandwritten,
} from '../../src/members/managed.ts';
import { validate, isSlug } from '../../src/members/limits.ts';

test('a managed id is rec-<slug> and can never be a sign-in uid', () => {
  assert.equal(managedId('jane-doe'), 'rec-jane-doe');
  assert.ok(isManagedId('rec-jane-doe'));
  assert.ok(!isManagedId('rec-'));
  assert.ok(!isManagedId('Cud2xeJAAgxKnAsd156R5dyJXMTz')); // what Firebase generates: alphanumeric
  assert.ok(managedId('a'.repeat(48)).length <= 128); // the sync accepts ids up to 128 characters
  assert.match(managedId('jane-doe'), /^[A-Za-z0-9_-]{1,128}$/); // UID_RE of scripts/members_sync.py
});

test('the marker is the provider value only an admin can write', () => {
  assert.equal(MANAGED_PROVIDER, 'admin');
  assert.ok(isManagedCard({ provider: 'admin' }));
  assert.ok(!isManagedCard({ provider: 'google.com' }));
  assert.ok(!isManagedCard({ provider: 'password' }));
  assert.ok(!isManagedCard({}));
  assert.ok(!isManagedCard(null));
});

test('adopting a complete hand-written entry gives values the form accepts', () => {
  const v = valuesFromHandwritten({
    slug: 'jane-doe', name: 'Jane Doe', role: 'MSc (Alumni)', group: 'msc', alumni: true,
    bio: 'Studied wild barley.', interests: ['wild barley', ' ', 'local adaptation'], email: 'jane@example.org',
    orcid: '0000-0001-2345-6789', scholar: 'AbCdEfGhIjKl', github: 'janedoe', website: 'https://example.org/jane',
    linkedin: 'jane-doe', yearJoined: 2019, yearLeft: 2022, currentPosition: 'Postdoc, Example University', order: 4,
  });
  assert.deepEqual(v, {
    name: 'Jane Doe', role: 'MSc (Alumni)', group: 'msc', alumni: true, bio: 'Studied wild barley.',
    interests: 'wild barley, local adaptation', email: 'jane@example.org', orcid: '0000-0001-2345-6789',
    scholar: 'AbCdEfGhIjKl', github: 'janedoe', linkedin: 'jane-doe', website: 'https://example.org/jane',
    yearJoined: '2019', yearLeft: '2022', currentPosition: 'Postdoc, Example University',
  });
  assert.deepEqual(validate(v, { piAllowed: true, year: 2026 }), {});
});

test('a minimal entry adopts with empty optional fields', () => {
  const v = valuesFromHandwritten({ slug: 'tal-levi', name: 'Tal Levi', role: 'Undergraduate (Alumni)', group: 'undergrad', alumni: true });
  assert.equal(v.bio, '');
  assert.equal(v.interests, '');
  assert.equal(v.yearLeft, '');
  assert.equal(v.currentPosition, '');
  assert.deepEqual(validate(v, { piAllowed: true, year: 2026 }), {});
});

test('a group the portal does not offer is left for the admin to choose', () => {
  const v = valuesFromHandwritten({ slug: 'guy-ben-zvi', name: 'Guy Ben Zvi', role: 'Graduate Student', group: 'grad', alumni: false });
  assert.equal(v.group, '');
  assert.deepEqual(Object.keys(validate(v, { piAllowed: true, year: 2026 })), ['group']);
});

test('the principal investigator keeps the group pi, which only an admin may set', () => {
  const v = valuesFromHandwritten({ slug: 'sariel-hubner', name: 'Sariel Hübner', role: 'Principal Investigator', group: 'pi', alumni: false });
  assert.equal(v.group, 'pi');
  assert.deepEqual(validate(v, { piAllowed: true, year: 2026 }), {});
  assert.deepEqual(Object.keys(validate(v, { piAllowed: false, year: 2026 })), ['group']);
});

test('wrong types in the fetched list never reach the form', () => {
  const v = valuesFromHandwritten({ slug: 'x', name: 'X', role: 'r', group: 'phd', alumni: 'yes', bio: 5, interests: 'a, b', yearLeft: '2020', order: 'first' });
  assert.equal(v.alumni, false);
  assert.equal(v.bio, '');
  assert.equal(v.interests, '');
  assert.equal(v.yearLeft, '');
});

test('parseHandwritten keeps well-formed items only', () => {
  const ok = { slug: 'noam-pintel', name: 'Noam Pintel', role: 'MSc (Alumni)', group: 'msc', alumni: true };
  const list = parseHandwritten([
    ok,
    { slug: '../etc', name: 'Bad Slug', role: 'r' },
    { slug: 'Upper-Case', name: 'Bad Slug', role: 'r' },
    { slug: 'no-name', name: '  ', role: 'r' },
    { slug: 'no-role', name: 'No Role' },
    null, 'text', 7,
  ]);
  assert.deepEqual(list, [ok]);
  assert.ok(list.every((h) => isSlug(h.slug)));
  assert.deepEqual(parseHandwritten({ not: 'a list' }), []);
  assert.deepEqual(parseHandwritten(null), []);
});
