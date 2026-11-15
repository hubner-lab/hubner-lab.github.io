// node --test tests/portal/managed.test.mjs  (Node 24 strips the TypeScript types itself)
// Records an admin keeps for people without an account: ids, the marker, adoption of a hand-written entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGED_PROVIDER, managedId, isManagedId, isManagedCard, valuesFromHandwritten, parseHandwritten,
  fileNamesInUse, stillHandwritten, recordInTheWay,
} from '../../src/members/managed.ts';
import { validate, isSlug, slugify } from '../../src/members/limits.ts';

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

// ---------------------------------------------------------------- what the admin tab decides from the rows

const member = (uid, over = {}, published = null) => ({
  uid, published, card: { name: 'Alice Example', provider: 'google.com', status: 'pending', ...over },
});
const record = (slug, over = {}, published = null) => ({
  uid: managedId(slug), published, card: { name: 'Jane Doe', provider: 'admin', status: 'draft', slug, ...over },
});
const live = (slug) => ({ slug, rev: '9f2c4a1b7d3e5f60' });

test('file names in use: fixed slugs, published slugs and the ids of kept records', () => {
  const rows = [
    member('u1'),                                            // no slug yet: holds nothing
    member('u2', { slug: 'typed-by-admin' }),                // fixed in Edit, not published
    member('u3', { slug: 'dana-sisou', status: 'approved' }, live('dana-sisou')),
    record('jane-doe'),                                      // a draft record still holds its file name
    record('noam-pintel', { status: 'approved' }, live('noam-pintel')),
    { uid: 'rec-odd', published: null, card: { provider: 'admin' } }, // a record whose card lost its slug
  ];
  assert.deepEqual([...fileNamesInUse(rows)].sort(), ['dana-sisou', 'jane-doe', 'noam-pintel', 'odd', 'typed-by-admin']);
  assert.deepEqual([...fileNamesInUse([])], []);
});

test('an adopted entry leaves the hand-written list at once, before the site is rebuilt', () => {
  const list = parseHandwritten([
    { slug: 'guy-ben-zvi', name: 'Guy Ben Zvi', role: 'Graduate Student', group: 'grad', alumni: false },
    { slug: 'dana-sisou', name: 'Dana Sisou', role: 'PhD Student', group: 'phd', alumni: false },
    { slug: 'tal-levi', name: 'Tal Levi', role: 'Undergraduate (Alumni)', group: 'undergrad', alumni: true },
  ]);
  const slugs = (rows) => stillHandwritten(list, rows).map((h) => h.slug);
  assert.deepEqual(slugs([]), ['guy-ben-zvi', 'dana-sisou', 'tal-levi']);
  assert.deepEqual(slugs([record('guy-ben-zvi')]), ['dana-sisou', 'tal-levi']); // adopted, still a draft
  // A member's card published under the file name replaces the entry at the next sync.
  assert.deepEqual(slugs([member('u3', { slug: 'dana-sisou' }, live('dana-sisou'))]), ['guy-ben-zvi', 'tal-levi']);
  assert.deepEqual(slugs([member('u1')]), ['guy-ben-zvi', 'dana-sisou', 'tal-levi']); // a card without a slug takes nothing
});

test('a member\'s first card whose name gives the slug of a kept record must replace it', () => {
  const kept = record('guy-ben-zvi', { name: 'Guy Ben Zvi', status: 'approved' }, live('guy-ben-zvi'));
  const card = member('u9', { name: 'Guy Ben-Zvi' });
  const rows = [card, kept, record('jane-doe')];
  assert.equal(slugify('Guy Ben-Zvi'), 'guy-ben-zvi');
  assert.equal(recordInTheWay(card, slugify(card.card.name), rows), kept);
  // A record that was never published is in the way all the same.
  const draft = record('guy-ben-zvi');
  assert.equal(recordInTheWay(card, 'guy-ben-zvi', [card, draft]), draft);
});

test('a slug the admin typed on the card decides, not the name', () => {
  const kept = record('guy-ben-zvi', {}, live('guy-ben-zvi'));
  // Another person with the same name: the admin gave the card a different slug, so nothing is replaced.
  const other = member('u9', { name: 'Guy Ben Zvi', slug: 'guy-ben-zvi-2' });
  assert.equal(recordInTheWay(other, 'guy-ben-zvi', [other, kept]), null);
  // The same person under a different spelling: the admin typed the record's file name.
  const same = member('u9', { name: 'G. Ben Zvi', slug: 'guy-ben-zvi' });
  assert.equal(recordInTheWay(same, slugify(same.card.name), [same, kept]), kept);
});

test('nothing is in the way of a published card, of a record, or of a new name', () => {
  const kept = record('guy-ben-zvi', {}, live('guy-ben-zvi'));
  const published = member('u9', { name: 'Guy Ben Zvi', slug: 'guy-ben-zvi', status: 'approved' }, live('guy-ben-zvi'));
  assert.equal(recordInTheWay(published, 'guy-ben-zvi', [published, kept]), null);
  assert.equal(recordInTheWay(kept, 'guy-ben-zvi', [kept]), null);
  const fresh = member('u1', { name: 'New Person' });
  assert.equal(recordInTheWay(fresh, 'new-person', [fresh, kept]), null);
  assert.equal(recordInTheWay(fresh, '', [fresh, kept]), null); // a name without Latin letters gives no slug
  // A member's card under an id that only looks like a record's is not a kept record.
  const fake = { uid: 'rec-new-person', published: null, card: { provider: 'google.com' } };
  assert.equal(recordInTheWay(fresh, 'new-person', [fresh, fake]), null);
});
