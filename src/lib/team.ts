import type { CollectionEntry } from 'astro:content';

export type TeamEntry = CollectionEntry<'team'>;
export type Person = TeamEntry['data'] & { id: string; bio?: string };

export interface Team {
  /** Every non-alumni entry with `group === 'pi'`: zero, one or several. */
  pis: Person[];
  /** Everyone else who is not an alumnus, in display order. */
  current: Person[];
  alumni: Person[];
}

const GROUP_RANK: Record<TeamEntry['data']['group'], number> = {
  pi: 0,
  postdoc: 1,
  phd: 2,
  grad: 2,
  msc: 3,
  staff: 4,
  undergrad: 5,
  visitor: 6,
};

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);

// Smaller first; a missing value sorts after every present one.
const asc = (a?: number, b?: number) =>
  a === undefined ? (b === undefined ? 0 : 1) : b === undefined ? -1 : a - b;
const desc = (a?: number, b?: number) =>
  a === undefined ? (b === undefined ? 0 : 1) : b === undefined ? -1 : b - a;

function toPerson(entry: TeamEntry): Person {
  const { bio, ...rest } = entry.data;
  return {
    ...rest,
    id: entry.id,
    bio: bio?.trim() || entry.body?.trim() || undefined,
  };
}

/** The years of a former member: "2019–2022", "2022", "until 2022", "from 2019", or nothing. */
function formerYears({ yearJoined: from, yearLeft: to }: { yearJoined?: number; yearLeft?: number }): string {
  return from !== undefined && to !== undefined ? (from === to ? `${to}` : `${from}–${to}`)
    : to !== undefined ? `until ${to}`
    : from !== undefined ? `from ${from}`
    : '';
}

/**
 * What follows the role in the alumni list, e.g. ", 2019–2022 · now: Postdoc, Example University".
 * Empty when no year and no current position is filled, so an entry without them reads as before.
 */
export function alumniLine(p: Pick<Person, 'yearJoined' | 'yearLeft' | 'currentPosition'>): string {
  const years = formerYears(p);
  const now = p.currentPosition?.trim();
  return (years ? `, ${years}` : '') + (now ? ` · now: ${now}` : '');
}

// ---------------------------------------------------------------------------------- the card
// What a card shows, worked out from a person's fields. Pure functions: the Team page calls them
// at build time, and the members portal calls them in the browser to fill its preview card, so
// a member sees the card as the page will draw it.

/**
 * Two letters for a person without a photo: the first letter of the first word of the name and
 * of the last one. One letter for a name of one word, nothing for an empty name.
 */
export function initials(name: string): string {
  const words = name.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
  const letter = (word: string | undefined) => [...(word ?? '')][0] ?? '';
  return (letter(words[0]) + (words.length > 1 ? letter(words[words.length - 1]) : '')).toUpperCase();
}

/**
 * The role of a former member as the Alumni list writes it: without "(Alumni)", which the
 * heading of the list says already.
 */
export function formerRole(role: string): string {
  return role.replace(/\s*\(alumni\)\s*/gi, ' ').replace(/\s+([,;.])/g, '$1').trim();
}

/**
 * The years line of a card: "Since 2023" for a member of the lab; for a former member the span
 * as the Alumni list writes it, with a capital. Empty when the year is not filled.
 */
export function yearsLabel(p: { alumni?: boolean; yearJoined?: number; yearLeft?: number }): string {
  if (!p.alumni) return p.yearJoined !== undefined ? `Since ${p.yearJoined}` : '';
  const years = formerYears(p);
  return years.charAt(0).toUpperCase() + years.slice(1);
}

/** The links of a card, in the order the card shows them. */
export const LINKS = [
  ['email', 'Email'],
  ['orcid', 'ORCID'],
  ['scholar', 'Scholar'],
  ['github', 'GitHub'],
  ['website', 'Website'],
  ['linkedin', 'LinkedIn'],
] as const;

export type LinkKey = (typeof LINKS)[number][0];

/**
 * What a link of a card is called for a screen reader: every card says "Email" and "Scholar",
 * so the name of the person is added, and for a link that leaves the site, the new tab.
 */
export function linkName(key: LinkKey, label: string, name: string): string {
  return `${label}, ${name}${key === 'email' ? '' : ' (opens in a new tab)'}`;
}

/**
 * Where a link of a card leads, made from what the person filled in: an address for "email",
 * an id for the four profiles, a whole web address for "website". Undefined when the field is
 * empty, and for a website that is not a web address: such a value is never written as a link.
 */
export function linkHref(key: LinkKey, value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  switch (key) {
    case 'email': return `mailto:${v}`;
    case 'orcid': return `https://orcid.org/${v}`;
    case 'scholar': return `https://scholar.google.com/citations?user=${v}`;
    case 'github': return `https://github.com/${v}`;
    case 'linkedin': return `https://www.linkedin.com/in/${v}`;
    case 'website': return /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : undefined;
  }
}

export function buildTeam(entries: TeamEntry[]): Team {
  const people = entries.map(toPerson);

  const pis = people
    .filter((p) => p.group === 'pi' && !p.alumni)
    .sort((a, b) => asc(a.order, b.order) || byName(a, b));

  const current = people
    .filter((p) => p.group !== 'pi' && !p.alumni)
    .sort(
      (a, b) =>
        GROUP_RANK[a.group] - GROUP_RANK[b.group] ||
        asc(a.order, b.order) ||
        asc(a.yearJoined, b.yearJoined) ||
        byName(a, b),
    );

  const alumni = people
    .filter((p) => p.alumni)
    .sort((a, b) => desc(a.yearLeft, b.yearLeft) || asc(a.order, b.order) || byName(a, b));

  return { pis, current, alumni };
}
