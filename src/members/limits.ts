// Card contract limits, mirrored from firebase/firestore.rules so the form refuses what the
// rules would refuse. Keep the two in step: tests/rules covers the rules side.

export const GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['postdoc', 'Postdoc'],
  ['phd', 'PhD student'],
  ['msc', 'MSc student'],
  ['undergrad', 'Undergraduate'],
  ['staff', 'Staff'],
  ['visitor', 'Visitor'],
];
const PI_GROUP: readonly [string, string] = ['pi', 'Principal investigator'];

/** Groups offered in the editor. `pi` appears only when the card already is one. */
export function groupOptions(current: string): ReadonlyArray<readonly [string, string]> {
  return current === 'pi' ? [PI_GROUP, ...GROUPS] : GROUPS;
}

export interface CardValues {
  name: string;
  role: string;
  group: string;
  alumni: boolean;
  bio: string;
  interests: string;
  email: string;
  orcid: string;
  scholar: string;
  github: string;
  linkedin: string;
  website: string;
  yearJoined: string;
  yearLeft: string;
  currentPosition: string;
}

/** The sixteen content keys of the card contract, in contract order. */
export const CONTENT_KEYS = [
  'name', 'role', 'group', 'alumni', 'bio', 'interests', 'email', 'orcid', 'scholar', 'github',
  'website', 'linkedin', 'yearJoined', 'yearLeft', 'currentPosition', 'photoRev',
] as const;

export const MAX = {
  name: 80,
  role: 80,
  bio: 600,
  interests: 200,
  email: 120,
  orcid: 19,
  scholar: 20,
  github: 39,
  linkedin: 100,
  website: 200,
  currentPosition: 120,
} as const;

const RE = {
  email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$/,
  orcid: /^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$/,
  scholar: /^[A-Za-z0-9_-]{8,20}$/,
  github: /^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
  website: /^https:\/\/[A-Za-z0-9.-]+[.][A-Za-z]{2,}(\/[A-Za-z0-9._~:/?#@!&()*+,;=%-]*)?$/,
  linkedin: /^[A-Za-z0-9_%-]{3,100}$/,
};

/** "a,  b ,,c" -> "a, b, c"; the rules count the stored string, so the form stores this form. */
export function normalizeInterests(text: string): string {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

export function parseYear(text: string): number | null {
  const t = text.trim();
  return t === '' ? null : /^-?\d+$/.test(t) ? Number(t) : Number.NaN;
}

export type Errors = Partial<Record<keyof CardValues, string>>;

export function validate(v: CardValues, opts: { piAllowed: boolean; year?: number }): Errors {
  const e: Errors = {};
  const maxYear = (opts.year ?? new Date().getFullYear()) + 1;

  const req = (k: 'name' | 'role', label: string) => {
    const s = v[k].trim();
    if (s.length < 1) e[k] = `${label} is required.`;
    else if (s.length > MAX[k]) e[k] = `At most ${MAX[k]} characters.`;
  };
  req('name', 'Name');
  req('role', 'Role');

  const allowed = [...GROUPS.map((g) => g[0]), ...(opts.piAllowed ? ['pi'] : [])];
  if (!allowed.includes(v.group)) e.group = 'Choose a group.';

  const opt = (k: 'bio' | 'currentPosition', text = v[k]) => {
    if (text.length > MAX[k]) e[k] = `At most ${MAX[k]} characters.`;
  };
  opt('bio');
  opt('currentPosition');
  if (normalizeInterests(v.interests).length > MAX.interests) {
    e.interests = `At most ${MAX.interests} characters in total.`;
  }

  const pattern = (k: 'email' | 'orcid' | 'scholar' | 'github' | 'linkedin' | 'website', msg: string) => {
    const s = v[k];
    if (s === '') return;
    if (s.length > MAX[k]) e[k] = `At most ${MAX[k]} characters.`;
    else if (!RE[k].test(s)) e[k] = msg;
  };
  pattern('email', 'Enter a valid address, or leave empty to show none.');
  pattern('orcid', 'Use the form 0000-0000-0000-0000, not a link.');
  pattern('scholar', 'Only the id after "user=" in your profile link.');
  pattern('github', 'Only your user name, not a link.');
  pattern('linkedin', 'Only the part after "/in/", not a link.');
  pattern('website', 'Must start with https://.');

  for (const k of ['yearJoined', 'yearLeft'] as const) {
    const y = parseYear(v[k]);
    if (y !== null && (!Number.isInteger(y) || y < 1950 || y > maxYear)) {
      e[k] = `A year from 1950 to ${maxYear}, or empty.`;
    }
  }
  return e;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isSlug = (s: string) => s.length <= 48 && SLUG_RE.test(s);

const FOLD: Record<string, string> = { 'ß': 'ss', 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th' };

/** ASCII-fold, lowercase, hyphens: "Sariel Hübner" -> "sariel-hubner". Empty when nothing Latin is left. */
export function slugify(name: string): string {
  const folded = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ßøæœłđðþ]/g, (c) => FOLD[c]);
  return folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}

/** A slug not in `taken`: base, then base-2, base-3, ... all within 48 characters. */
export function uniqueSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name) || 'member';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const cand = base.slice(0, 48 - suffix.length).replace(/-+$/, '') + suffix;
    if (!taken.has(cand)) return cand;
  }
}
