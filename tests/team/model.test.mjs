// node tests/team/model.test.mjs  (Node 24 strips the TypeScript types itself)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeam } from '../../src/lib/team.ts';

const e = (id, data, body = '') => ({
  id, body, collection: 'team',
  data: { name: id, role: 'r', group: 'phd', alumni: false, interests: [], ...data },
});
const ids = (list) => list.map((p) => p.id);

test('no PI: no crash, empty pis', () => {
  const t = buildTeam([e('a', {}), e('b', { group: 'msc' })]);
  assert.deepEqual(t.pis, []);
  assert.deepEqual(ids(t.current), ['a', 'b']);
});

test('several PIs; an alumnus PI is an alumnus, not a PI', () => {
  const t = buildTeam([
    e('p2', { group: 'pi', order: 2 }), e('p1', { group: 'pi', order: 1 }),
    e('old', { group: 'pi', alumni: true, yearLeft: 2020 }),
  ]);
  assert.deepEqual(ids(t.pis), ['p1', 'p2']);
  assert.deepEqual(ids(t.alumni), ['old']);
  assert.deepEqual(t.current, []);
});

test('current: group rank, grad ties with phd, pinned order before unpinned, yearJoined, name', () => {
  const t = buildTeam([
    e('visitor', { group: 'visitor', order: 1 }),
    e('undergrad', { group: 'undergrad' }),
    e('staff', { group: 'staff' }),
    e('msc', { group: 'msc' }),
    e('phd-unpinned-late', { group: 'phd', yearJoined: 2024 }),
    e('phd-unpinned-early', { group: 'phd', yearJoined: 2021 }),
    e('grad-pinned', { group: 'grad', order: 9 }),
    e('phd-pinned', { group: 'phd', order: 2 }),
    e('phd-b', { group: 'phd' }),
    e('phd-a', { group: 'phd' }),
    e('postdoc', { group: 'postdoc' }),
  ]);
  assert.deepEqual(ids(t.current), [
    'postdoc', 'phd-pinned', 'grad-pinned', 'phd-unpinned-early', 'phd-unpinned-late', 'phd-a', 'phd-b',
    'msc', 'staff', 'undergrad', 'visitor',
  ]);
});

test('alumni: yearLeft descending (missing last), then order, then name', () => {
  const t = buildTeam([
    e('x', { alumni: true, order: 5 }), e('y', { alumni: true, order: 4 }),
    e('old', { alumni: true, yearLeft: 2019 }), e('new', { alumni: true, yearLeft: 2024 }),
    e('n2', { alumni: true, yearLeft: 2024, order: 1 }),
  ]);
  assert.deepEqual(ids(t.alumni), ['n2', 'new', 'old', 'y', 'x']);
});

test('bio is data.bio when present, else the Markdown body', () => {
  const t = buildTeam([
    e('a', { bio: 'from frontmatter' }, 'body text'),
    e('b', {}, '\n  body only \n'), e('c', {}, ''),
  ]);
  const by = Object.fromEntries(t.current.map((p) => [p.id, p.bio]));
  assert.equal(by.a, 'from frontmatter');
  assert.equal(by.b, 'body only');
  assert.equal(by.c, undefined);
});
