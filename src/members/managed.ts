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
