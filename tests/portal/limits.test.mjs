// node --test tests/portal/limits.test.mjs  (Node 24 strips the TypeScript types itself)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueSlug, isSlug, validate, normalizeInterests, groupOptions } from '../../src/members/limits.ts';

const ok = {
  name: 'Jane Doe', role: 'PhD Student', group: 'phd', alumni: false, bio: '', interests: '', email: '',
  orcid: '', scholar: '', github: '', linkedin: '', website: '', yearJoined: '', yearLeft: '', currentPosition: '',
};

test('slugify folds accents and symbols to ASCII', () => {
  assert.equal(slugify('Sariel Hübner'), 'sariel-hubner');
  assert.equal(slugify('Zoë Åberg'), 'zoe-aberg');
  assert.equal(slugify('  Łukasz  Strauß-Øster '), 'lukasz-strauss-oster');
  assert.equal(slugify('שרה'), '');
  assert.equal(slugify('a'.repeat(60)).length, 48);
});

test('uniqueSlug avoids taken slugs and stays a valid slug', () => {
  assert.equal(uniqueSlug('Jane Doe', new Set()), 'jane-doe');
  assert.equal(uniqueSlug('Jane Doe', new Set(['jane-doe'])), 'jane-doe-2');
  assert.equal(uniqueSlug('Jane Doe', new Set(['jane-doe', 'jane-doe-2'])), 'jane-doe-3');
  assert.equal(uniqueSlug('שרה', new Set()), 'member');
  const long = uniqueSlug('x'.repeat(60), new Set(['x'.repeat(48)]));
  assert.ok(isSlug(long) && long.endsWith('-2') && long.length <= 48);
});

test('validate mirrors the rules', () => {
  assert.deepEqual(validate(ok, { piAllowed: false }), {});
  const bad = validate({ ...ok, name: '', group: 'pi', website: 'http://x.org', orcid: '1234', yearJoined: '1900', yearLeft: 'abc' }, { piAllowed: false });
  assert.deepEqual(Object.keys(bad).sort(), ['group', 'name', 'orcid', 'website', 'yearJoined', 'yearLeft']);
  assert.deepEqual(validate({ ...ok, group: 'pi' }, { piAllowed: true }), {});
  assert.ok(validate({ ...ok, bio: 'x'.repeat(601) }, { piAllowed: false }).bio);
  assert.ok(validate({ ...ok, interests: 'a, '.repeat(100) }, { piAllowed: false }).interests);
  assert.deepEqual(validate({ ...ok, yearJoined: '2027' }, { piAllowed: false, year: 2026 }), {});
  assert.ok(validate({ ...ok, yearJoined: '2028' }, { piAllowed: false, year: 2026 }).yearJoined);
});

test('interests are normalised before the limit is counted', () => {
  assert.equal(normalizeInterests('a,  b ,,c'), 'a, b, c');
});

test('pi is offered only to a card that already is one', () => {
  assert.ok(!groupOptions('phd').some(([v]) => v === 'pi'));
  assert.ok(groupOptions('pi').some(([v]) => v === 'pi'));
  assert.ok(!groupOptions('pi').some(([v]) => v === 'grad'));
});
