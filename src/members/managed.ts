// People without an account: records an admin keeps for them (alumni first).
//
// A managed record is a normal card under the id `rec-<slug>` whose `provider` is 'admin'. The
// security rules already let an admin, and only an admin, write a card under any id, and a member
// can never forge the marker: for a member's write the rules compare `provider` with the sign-in
// token. The uids Firebase generates at sign-in are alphanumeric, so `rec-...` cannot collide.
//
// Pure: no Firebase and no value import, so plain Node can test it (tests/portal/managed.test.mjs).
import type { CardValues } from './limits';

export const MANAGED_PROVIDER = 'admin';
export const MANAGED_PREFIX = 'rec-';

export const managedId = (slug: string) => `${MANAGED_PREFIX}${slug}`;
export const isManagedId = (id: string) => id.startsWith(MANAGED_PREFIX) && id.length > MANAGED_PREFIX.length;
export const isManagedCard = (card: Record<string, unknown> | null | undefined) =>
  card?.provider === MANAGED_PROVIDER;

/** One team entry still written by hand, as /members/handwritten.json lists it. */
export interface Handwritten {
  /** The file name without `.md`: a record adopted under this slug replaces the file. */
  slug: string;
  name: string;
  role: string;
  group: string;
  alumni: boolean;
  bio?: string;
  interests?: string[];
  email?: string;
  orcid?: string;
  scholar?: string;
  github?: string;
  website?: string;
  linkedin?: string;
  yearJoined?: number;
  yearLeft?: number;
  currentPosition?: string;
  order?: number;
  hasPhoto?: boolean;
}

// The same rule as isSlug() in limits.ts, repeated here to keep this module free of value imports.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugOk = (s: unknown): s is string => typeof s === 'string' && s.length <= 48 && SLUG_RE.test(s);

/** Groups the portal offers. `grad` exists only in the repo schema, for an entry whose level is not stated. */
const PORTAL_GROUPS = ['pi', 'postdoc', 'phd', 'msc', 'undergrad', 'staff', 'visitor'];

/**
 * Form values for adopting a hand-written entry. A group the portal does not offer becomes empty,
 * so the form asks the admin to choose one instead of guessing.
 */
export function valuesFromHandwritten(h: Handwritten): CardValues {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const y = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? String(v) : '');
  return {
    name: s(h.name),
    role: s(h.role),
    group: PORTAL_GROUPS.includes(h.group) ? h.group : '',
    alumni: h.alumni === true,
    bio: s(h.bio),
    interests: Array.isArray(h.interests) ? h.interests.filter((x) => typeof x === 'string' && x.trim()).join(', ') : '',
    email: s(h.email),
    orcid: s(h.orcid),
    scholar: s(h.scholar),
    github: s(h.github),
    linkedin: s(h.linkedin),
    website: s(h.website),
    yearJoined: y(h.yearJoined),
    yearLeft: y(h.yearLeft),
    currentPosition: s(h.currentPosition),
  };
}

/** What the admin tab holds per card; `Row` of adminCards.ts has this shape. */
export interface RowLike {
  uid: string;
  card: Record<string, unknown>;
  published: Record<string, unknown> | null;
}

const text = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Every file name a card or a record holds or is about to hold: the slug fixed on the card, the
 * slug it is published under, and the slug in the id of a kept record.
 */
export function fileNamesInUse(rows: ReadonlyArray<RowLike>): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    for (const s of [text(r.card.slug), text(r.published?.slug)]) if (s) out.add(s);
    if (isManagedId(r.uid)) out.add(r.uid.slice(MANAGED_PREFIX.length));
  }
  return out;
}

/**
 * The hand-written entries no card and no record has taken over. The fetched list changes only
 * when the site is rebuilt, so an entry adopted a minute ago is still in it: it is left out here.
 */
export function stillHandwritten(list: ReadonlyArray<Handwritten>, rows: ReadonlyArray<RowLike>): Handwritten[] {
  const used = fileNamesInUse(rows);
  return list.filter((h) => !used.has(h.slug));
}

/**
 * The kept record that stands in the way of a member's card: the one under the slug this card is
 * about to be published with, which is its own fixed slug or else `slugOfName`. Approving must
 * replace that record, or the person is listed twice. Null for a card that is published already
 * (its slug is its own), for a kept record itself, and when no record is kept under that slug.
 */
export function recordInTheWay<R extends RowLike>(row: RowLike, slugOfName: string, rows: ReadonlyArray<R>): R | null {
  if (isManagedCard(row.card) || row.published) return null;
  const slug = text(row.card.slug) || slugOfName;
  if (!slug) return null;
  const id = managedId(slug);
  return rows.find((r) => r.uid === id && isManagedCard(r.card)) ?? null;
}

/** The well-formed items of a fetched list. The file is static and ours, but its shape is still checked. */
export function parseHandwritten(json: unknown): Handwritten[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (x): x is Handwritten =>
      !!x && typeof x === 'object' && slugOk((x as Handwritten).slug) &&
      typeof (x as Handwritten).name === 'string' && (x as Handwritten).name.trim() !== '' &&
      typeof (x as Handwritten).role === 'string',
  );
}
