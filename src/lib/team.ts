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
