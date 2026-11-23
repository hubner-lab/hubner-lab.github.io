// node --test tests/site/team.test.mjs   (the last two groups need `pnpm build` first)
// The Team page in three groups:
//   1. what a card shows, worked out by src/lib/team.ts, on small made-up cases;
//   2. the built page: two groups with their counts, a card for every member of the lab with
//      the fields of that person, a line for every former member;
//   3. the built /members page: the preview card has every slot that the portal fills.
// The people come from the build itself: /members/handwritten.json lists every entry that is
// written by hand, with all its fields, in the order of the page. A person whose card comes
// from the members portal is not in that list and is checked for its place only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { alumniLine, formerRole, initials, LINKS, linkHref, linkName, yearsLabel } from '../../src/lib/team.ts';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// ------------------------------------------------------------------------------ 1. the library

test('initials: the first letter of the first word and of the last', () => {
  const cases = [
    ['Sariel Hübner', 'SH'], ['Guy Ben Zvi', 'GZ'], ['Yael Lev-Mirom', 'YL'], ['  dana   sisou ', 'DS'],
    ['Cher', 'C'], ['', ''], ['   ', ''], ['Jane (Janie) Doe', 'JD'], ['Élodie Ødegård', 'ÉØ'],
    ['𝒜lice Smith', '𝒜S'], // a letter outside the basic plane stays whole
    ['Your name', 'YN'],
  ];
  for (const [name, want] of cases) assert.equal(initials(name), want, JSON.stringify(name));
});

test('formerRole: the Alumni list does not repeat "(Alumni)"', () => {
  assert.equal(formerRole('MSc (Alumni)'), 'MSc');
  assert.equal(formerRole('Undergraduate (alumni)'), 'Undergraduate');
  assert.equal(formerRole('(Alumni) MSc'), 'MSc');
  assert.equal(formerRole('MSc (Alumni), part-time'), 'MSc, part-time');
  assert.equal(formerRole('PhD Student'), 'PhD Student');
  assert.equal(formerRole('Alumni coordinator'), 'Alumni coordinator', 'only the bracketed word goes');
  assert.equal(formerRole(''), '');
});

test('yearsLabel: "Since" for a member of the lab, the span for a former member', () => {
  assert.equal(yearsLabel({ yearJoined: 2023 }), 'Since 2023');
  assert.equal(yearsLabel({ alumni: false, yearJoined: 2023, yearLeft: 2025 }), 'Since 2023', 'a leaving year counts only for a former member');
  assert.equal(yearsLabel({}), '');
  assert.equal(yearsLabel({ yearLeft: 2025 }), '');
  assert.equal(yearsLabel({ alumni: true, yearJoined: 2019, yearLeft: 2022 }), '2019–2022');
  assert.equal(yearsLabel({ alumni: true, yearJoined: 2022, yearLeft: 2022 }), '2022');
  assert.equal(yearsLabel({ alumni: true, yearLeft: 2022 }), 'Until 2022');
  assert.equal(yearsLabel({ alumni: true, yearJoined: 2019 }), 'From 2019');
  assert.equal(yearsLabel({ alumni: true }), '');
});

test('linkHref: where each link of a card leads', () => {
  assert.deepEqual(LINKS.map(([key, label]) => `${key}=${label}`), ['email=Email', 'orcid=ORCID', 'scholar=Scholar', 'github=GitHub', 'website=Website', 'linkedin=LinkedIn']);
  assert.equal(linkHref('email', 'jane@example.org'), 'mailto:jane@example.org');
  assert.equal(linkHref('orcid', '0000-0001-2345-678X'), 'https://orcid.org/0000-0001-2345-678X');
  assert.equal(linkHref('scholar', 'yqB4jesAAAAJ'), 'https://scholar.google.com/citations?user=yqB4jesAAAAJ');
  assert.equal(linkHref('github', 'jane-doe'), 'https://github.com/jane-doe');
  assert.equal(linkHref('linkedin', 'jane-doe-%D7%90'), 'https://www.linkedin.com/in/jane-doe-%D7%90', 'an id that is escaped already stays as it is');
  assert.equal(linkHref('website', 'https://example.org/~jane?tab=1#top'), 'https://example.org/~jane?tab=1#top');
  assert.equal(linkHref('website', ' https://example.org '), 'https://example.org');
  for (const key of LINKS.map(([k]) => k)) {
    assert.equal(linkHref(key, ''), undefined, `${key}: empty`);
    assert.equal(linkHref(key, '   '), undefined, `${key}: spaces`);
    assert.equal(linkHref(key, undefined), undefined, `${key}: not filled`);
  }
});

test('linkHref: a website that is not a web address is never a link', () => {
  for (const value of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'example.org', '//example.org', 'ftp://example.org', 'https://exa mple.org', 'https://example.org/"onmouseover="x']) {
    assert.equal(linkHref('website', value), undefined, value);
  }
});

test('linkName: a screen reader hears whose link it is, and that it opens a new tab', () => {
  assert.equal(linkName('email', 'Email', 'Jane Doe'), 'Email, Jane Doe');
  assert.equal(linkName('scholar', 'Scholar', 'Jane Doe'), 'Scholar, Jane Doe (opens in a new tab)');
  for (const [key, label] of LINKS) assert.ok(linkName(key, label, 'Jane Doe').startsWith(label), `${key}: the name starts with the word that is shown`);
});

// ------------------------------------------------------------------------------ 2. the built page

const dist = here('../../dist/');
const built = (file) => {
  const full = path.join(dist, file);
  assert.ok(existsSync(full), `dist/${file} is missing: run \`pnpm build\` first`);
  return readFileSync(full, 'utf8');
};
const unescape = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescape(m[1]) : undefined; };
const has = (tag, name) => new RegExp(`\\s${name}(?=[\\s=>])`).test(tag);
const hasClass = (tag, name) => (attr(tag, 'class') ?? '').split(/\s+/).includes(name);
const openTags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))];
/** The whole element that starts with the opening tag `m` (a match of openTags), nested elements of the same name included. */
function element(html, m) {
  assert.ok(m, 'an element the test looks for is not in the page');
  const name = /^<([a-z0-9]+)/i.exec(m[0])[1];
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'g');
  re.lastIndex = m.index;
  let depth = 0, t;
  while ((t = re.exec(html))) {
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(m.index, t.index + t[0].length);
  }
  assert.fail(`<${name}> is not closed`);
}
const text = (html) => unescape(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
/** The first element of `html` that carries `data-f="<hook>"`, as { tag, html }, or null. */
function hook(html, name) {
  const m = openTags(html, '[a-z0-9]+').find((t) => attr(t[0], 'data-f') === name);
  return m ? { tag: m[0], html: element(html, m) } : null;
}
const HOOKS = ['name', 'role', 'bio', 'photo', 'initial', 'interests', 'now', 'links', 'email', 'orcid', 'scholar', 'github', 'website', 'linkedin', 'years'];

/** The page as { head, groups: [{ key, title, count, people: [{ tag, html, name }] }] }. */
function teamPage() {
  const html = built('team/index.html');
  const main = element(html, openTags(html, 'main')[0]);
  const groups = openTags(main, 'section').filter((m) => has(m[0], 'data-group')).map((m) => {
    const section = element(main, m);
    const title = element(section, openTags(section, 'h2')[0]);
    const count = /<span\b[^>]*class="count"[^>]*>([\s\S]*?)<\/span>/.exec(title)?.[1];
    const people = openTags(section, '(?:article|li)').filter((p) => has(p[0], 'data-person')).map((p) => {
      const body = element(section, p);
      const name = openTags(body, '[a-z0-9]+').find((t) => hasClass(t[0], 'name'));
      assert.ok(name, 'a person has no element of class "name"');
      return { tag: p[0], html: body, name: text(element(body, name)) };
    });
    return { key: attr(m[0], 'data-group'), title: text(title.replace(/<span\b[^>]*class="count"[\s\S]*?<\/span>/, '')), count: Number(text(count ?? '')), people };
  });
  return { main, groups };
}

/** The entries written by hand, by name: every field of the person, as the page had it. */
const handwritten = () => JSON.parse(built('members/handwritten.json'));

test('page: two groups, the members of the lab and the former members, each with the count of its people', () => {
  const { main, groups } = teamPage();
  assert.deepEqual(groups.map((g) => [g.key, g.title]), [['current', 'Current members'], ['alumni', 'Alumni']]);
  for (const g of groups) {
    assert.ok(g.people.length > 0, `the group "${g.title}" is empty and should not be on the page`);
    assert.equal(g.count, g.people.length, `"${g.title}" says ${g.count} and lists ${g.people.length}`);
  }
  const all = openTags(main, '[a-z0-9]+').filter((m) => has(m[0], 'data-person')).length;
  assert.equal(groups.reduce((n, g) => n + g.people.length, 0), all, 'a person stands outside the two groups');
  assert.equal([...main.matchAll(/<h1\b/g)].length, 1, 'one h1');
  const [current, alumni] = groups;
  assert.ok(current.people.every((p) => p.tag.startsWith('<article')), 'a member of the lab is a card');
  assert.ok(alumni.people.every((p) => p.tag.startsWith('<li')), 'a former member is a line of the list');
});

test('page: the entries written by hand stand in the order of the list, the principal investigator first', () => {
  const { groups } = teamPage();
  const list = handwritten();
  const [current, alumni] = groups;
  const order = (people, entries) => {
    const names = people.map((p) => p.name).filter((n) => entries.some((e) => e.name === n));
    assert.deepEqual(names, entries.map((e) => e.name));
  };
  order(current.people, list.filter((e) => !e.alumni));
  order(alumni.people, list.filter((e) => e.alumni));
  const pi = list.find((e) => e.group === 'pi' && !e.alumni);
  if (pi) assert.equal(current.people[0].name, pi.name, 'the first card is the principal investigator');
});

test('page: a card shows the fields of its person, and only the ones that are filled', (t) => {
  const { groups } = teamPage();
  const byName = new Map(handwritten().map((e) => [e.name, e]));
  let checked = 0;
  for (const card of groups[0].people) {
    const slot = (name) => hook(card.html, name);
    assert.ok(!/\shidden(?=[\s=>])/.test(card.html), `${card.name}: a slot is hidden on the Team page; an empty slot is left out there`);
    for (const name of ['name', 'role', 'photo']) assert.ok(slot(name), `${card.name}: no data-f="${name}"`);
    const person = byName.get(card.name);
    if (!person) continue; // a card from the members portal: its fields are not in the build as data
    checked++;
    const where = (what) => `${card.name}: ${what}`;
    assert.equal(text(slot('role').html), person.role, where('role'));
    assert.equal(slot('bio') ? text(slot('bio').html) : undefined, person.bio?.replace(/\s+/g, ' '), where('bio'));
    const chips = slot('interests');
    assert.deepEqual(chips ? openTags(chips.html, 'li').map((m) => text(element(chips.html, m))) : [], person.interests ?? [], where('interests'));
    assert.equal(slot('now'), null, where('a member of the lab has no "Now" line'));
    assert.equal(slot('years') ? text(slot('years').html) : '', yearsLabel(person), where('years'));

    // the picture: the photo, or two initials
    const picture = slot('photo').html;
    if (person.hasPhoto) {
      const img = openTags(picture, 'img')[0];
      assert.ok(img, where('has a photo and shows none'));
      // an empty alt is written as the bare attribute
      assert.ok(has(img[0], 'alt') && (attr(img[0], 'alt') ?? '') === '', where('the photo stands beside the name: its alt must be there and empty'));
      assert.equal(slot('initial'), null, where('shows initials over a photo'));
    } else {
      assert.equal(openTags(picture, 'img').length, 0, where('shows a picture it does not have'));
      assert.equal(text(slot('initial')?.html ?? ''), initials(person.name), where('initials'));
    }

    // the links: the filled ones, in order, each named after the person
    const want = LINKS.map(([key, label]) => ({ key, label, href: linkHref(key, person[key]) })).filter((l) => l.href);
    const row = slot('links');
    const got = row ? openTags(row.html, 'a') : [];
    assert.deepEqual(got.map((m) => attr(m[0], 'data-f')), want.map((l) => l.key), where('links'));
    got.forEach((m, i) => {
      const { key, label, href } = want[i];
      assert.equal(attr(m[0], 'href'), href, where(`${key} link`));
      assert.equal(text(element(row.html, m)), label, where(`${key} link text`));
      assert.equal(attr(m[0], 'aria-label'), linkName(key, label, person.name), where(`${key} link name`));
      if (key === 'email') assert.equal(attr(m[0], 'target'), undefined, where('an email link opens no tab'));
      else {
        assert.equal(attr(m[0], 'target'), '_blank', where(`${key} link opens a new tab`));
        assert.match(attr(m[0], 'rel') ?? '', /\bnoopener\b/, where(`${key} link rel`));
      }
    });
  }
  t.diagnostic(`team: ${groups[0].people.length} cards, ${checked} checked field by field against the entries written by hand`);
});

test('page: a former member is a line with the name, the role without "(Alumni)", the years and the current position', () => {
  const { groups } = teamPage();
  const byName = new Map(handwritten().map((e) => [e.name, e]));
  for (const row of groups[1].people) {
    const person = byName.get(row.name);
    if (!person) continue;
    assert.equal(text(row.html), `${person.name} ${formerRole(person.role)}${alumniLine(person)}`.trim(), `${row.name}: the line`);
  }
});

test('page: no script in the markup of the page body, and no string written as markup', () => {
  const { main } = teamPage();
  assert.ok(!/\son[a-z]+\s*=/.test(main.replace(/<script\b[\s\S]*?<\/script>/g, '')), 'an inline event handler (on...=) is in the Team page');
  for (const f of ['src/pages/team.astro', 'src/components/TeamCard.astro', 'src/components/ui/Avatar.astro']) {
    assert.ok(!/set:html/.test(readFileSync(here(`../../${f}`), 'utf8')), `${f} writes a string as markup (set:html)`);
  }
});

// ------------------------------------------------------------------------------ 3. the preview on /members

test('members: the preview card has every slot the portal fills, empty ones hidden, and the line for a former member', () => {
  const html = built('members/index.html');
  const start = html.indexOf('id="m-preview"');
  assert.ok(start >= 0, '/members has no #m-preview');
  const preview = html.slice(start, html.indexOf('</aside>', start));
  const card = element(preview, openTags(preview, 'article').find((m) => has(m[0], 'data-person')));
  for (const name of HOOKS) assert.ok(hook(card, name), `the preview card has no data-f="${name}"`);
  // what is empty at the start is in the markup and hidden; the name, the role and the picture show
  for (const name of ['bio', 'interests', 'now', 'links', 'email', 'orcid', 'scholar', 'github', 'website', 'linkedin', 'years']) {
    assert.ok(has(hook(card, name).tag, 'hidden'), `data-f="${name}" of the preview card must start hidden`);
  }
  for (const name of ['name', 'role', 'photo', 'initial']) assert.ok(!has(hook(card, name).tag, 'hidden'), `data-f="${name}" of the preview card is hidden`);
  assert.equal(text(hook(card, 'initial').html), initials(text(hook(card, 'name').html)), 'the initials of the placeholder name');
  // a link of the preview has no address until the member types one
  for (const [key] of LINKS) assert.equal(attr(hook(card, key).tag, 'href'), undefined, `the preview's ${key} link has an address before anything is typed`);
  const line = openTags(preview, 'p').find((m) => attr(m[0], 'id') === 'm-preview-alumni');
  assert.ok(line && has(line[0], 'hidden'), 'the line for a former member is missing or shows from the start');
  for (const part of ['name', 'line']) assert.ok(new RegExp(`data-alumni="${part}"`).test(element(preview, line)), `the line for a former member has no data-alumni="${part}"`);
});
