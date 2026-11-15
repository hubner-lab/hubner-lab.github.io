// What the Publications page shows about a paper, worked out from the records that the Scholar
// bot writes to src/data/publications.json. Pure functions with no imports: the page calls them
// at build time, the page script calls the search ones in the browser, and the tests call them
// in plain Node (tests/site/publications.test.mjs).

/** One record of src/data/publications.json, as scripts/scholar.py writes it. */
export interface PublicationRecord {
  year: number;
  title: string;
  /** "First Author and Second Author and Third Author". */
  authors: string;
  /** Empty when Scholar gave none. */
  venue: string;
  /** Empty when Scholar gave none. */
  url: string;
  citations: number;
}

// ---------------------------------------------------------------------------------- names

/** Lower case with the accents off, for comparing: "Hübner" and "Hubner" are one word. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/**
 * What identifies a person in an author list: the name with accents off, in lower case, with
 * hyphens and dots read as spaces and middle initials left out. "Loren H. Rieseberg" and
 * "Loren Rieseberg" give the same key; "L Rieseberg" does not, because an initial alone
 * could be somebody else.
 */
export function nameKey(name: string): string {
  const words = foldText(name)
    .replace(/['’ʼ`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return words.filter((w, i) => w.length > 1 || i === 0 || i === words.length - 1).join(' ');
}

/** The author string of a record as a list of names, in the paper's order. */
export function splitAuthors(authors: string): string[] {
  return authors
    .split(/\s+and\s+/)
    .map((name) => name.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** A test for "this author is a lab member", made from every spelling that counts as one. */
export function labMatcher(names: Iterable<string>): (author: string) => boolean {
  const keys = new Set<string>();
  for (const name of names) {
    const key = nameKey(name);
    if (key) keys.add(key);
  }
  return (author) => keys.has(nameKey(author));
}

export interface Author {
  name: string;
  /** A current or former lab member: shown in bold. */
  lab: boolean;
}

export interface ShownAuthor extends Author {
  /** Names of the paper's list are left out just before this one. */
  gap: boolean;
}

export interface AuthorLine {
  /** Every author, in the paper's order. */
  all: Author[];
  /** The short line: the first names, then every lab member further down the list. */
  shown: ShownAuthor[];
  /** How many authors the short line leaves out. 0 when the short line is the whole list. */
  more: number;
}

/**
 * Fold a long author list: keep the first `head` names and every lab member after them, in
 * the paper's order, and count the rest. A list is folded only when that hides two names or
 * more: "+1 more" takes as much room as the name it would hide.
 */
export function foldAuthors(names: string[], isLab: (name: string) => boolean, head = 3): AuthorLine {
  const all = names.map((name) => ({ name, lab: isLab(name) }));
  const kept = all.map((author, i) => i < head || author.lab);
  const more = kept.filter((k) => !k).length;
  if (more < 2) return { all, shown: all.map((author) => ({ ...author, gap: false })), more: 0 };

  const shown: ShownAuthor[] = [];
  let last = -1;
  all.forEach((author, i) => {
    if (!kept[i]) return;
    shown.push({ ...author, gap: i !== last + 1 });
    last = i;
  });
  return { all, shown, more };
}

// ---------------------------------------------------------------------------------- the link

// A DOI is read out of a link only when the link has a shape this module knows, and the result
// must look like one of these. Anything else gives no DOI, and the page then uses the stored
// link, which always works; a wrong DOI would be a dead link.
/** The common shape: one part after the registrant, such as "mec.16380". */
const PLAIN_SUFFIX = /^[a-z0-9](?:[a-z0-9._;()\-:]*[a-z0-9)])?$/i;
/** Oxford University Press: the journal, then the article, such as "molbev/msag051". */
const OUP_SUFFIX = /^[a-z][a-z0-9]*\/[a-z][a-z0-9._-]*$/i;

/** The DOI that a publisher's link holds, or null. */
export function doiFromUrl(url: string): string | null {
  let link: URL;
  try {
    link = new URL(url.trim());
  } catch {
    return null;
  }
  if (link.protocol !== 'https:' && link.protocol !== 'http:') return null;
  const host = link.hostname.toLowerCase();
  let path = link.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // A stray "%" in the path: read it as it is.
  }

  // The DOI is in the path (most publishers) or in a parameter (PLOS: /article?id=10.1371/...).
  for (const text of [path, link.searchParams.get('id') ?? '', link.searchParams.get('doi') ?? '']) {
    const found = /(?:^|\/)(10\.\d{4,9})\/(.+)$/.exec(text);
    if (!found) continue;
    const [, registrant = '', rest = ''] = found;
    let suffix = rest.replace(/\/+$/, '');

    // What publishers put after the DOI.
    if (host === 'academic.oup.com') {
      suffix = suffix.replace(/\/[^/]+\.pdf$/i, '').replace(/\/\d+$/, ''); // /<article id>/<file>.pdf
    }
    suffix = suffix
      .replace(/\+html$/i, '')
      .replace(/\.pdf$/i, '')
      .replace(/\.(?:abstract|full|short|long|full-text|supplementary-material)$/i, '')
      .replace(/(?:\/(?:full|abstract|pdf|epdf|html|xml|epub))+$/i, '');
    if (/(?:^|\.)(?:biorxiv|medrxiv)\.org$/.test(host)) suffix = suffix.replace(/v\d+$/, ''); // the version

    const known = registrant === '10.1093' ? OUP_SUFFIX.test(suffix) : PLAIN_SUFFIX.test(suffix);
    if (known) return `${registrant}/${suffix}`;
  }
  return null;
}

export interface PaperLink {
  href: string;
  /** The DOI the address was made from; null when the address is the stored link. */
  doi: string | null;
}

/**
 * Where "Read paper" leads: the DOI's own address when the stored link holds a DOI, else the
 * stored link. Null when the record has no link, or one that is not a web address.
 */
export function paperLink(url: string): PaperLink | null {
  const stored = url.trim();
  if (!stored) return null;
  const doi = doiFromUrl(stored);
  if (doi) return { href: `https://doi.org/${doi}`, doi };
  try {
    const link = new URL(stored);
    return link.protocol === 'https:' || link.protocol === 'http:' ? { href: link.href, doi: null } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------- the kind

const PREPRINT_VENUE = /rxiv\b|\bpreprints?\b|research\s*square|\bssrn\b|\bauthorea\b/i;
const PREPRINT_HOST =
  /(?:^|\.)(?:biorxiv\.org|medrxiv\.org|arxiv\.org|ecoevorxiv\.org|chemrxiv\.org|researchsquare\.com|preprints\.org|ssrn\.com|authorea\.com)$/i;

/**
 * A preprint is told by its venue ("bioRxiv"). A record with no venue is one when its link
 * goes to a preprint server. A record that names a journal is an article wherever its link goes.
 */
export function isPreprint(record: Pick<PublicationRecord, 'venue' | 'url'>): boolean {
  const venue = record.venue.trim();
  if (venue) return PREPRINT_VENUE.test(venue);
  try {
    const link = new URL(record.url.trim());
    return (
      PREPRINT_HOST.test(link.hostname) ||
      (/(?:^|\.)europepmc\.org$/i.test(link.hostname) && link.pathname.startsWith('/article/ppr/'))
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------- the page

export type PaperType = 'article' | 'preprint';

/** A record as the page shows it. */
export interface Paper {
  year: number;
  title: string;
  authors: AuthorLine;
  /** Empty when the record has none. */
  venue: string;
  citations: number;
  link: PaperLink | null;
  type: PaperType;
}

export function toPaper(record: PublicationRecord, isLab: (name: string) => boolean): Paper {
  return {
    year: record.year,
    title: record.title.replace(/\s+/g, ' ').trim(),
    authors: foldAuthors(splitAuthors(record.authors), isLab),
    venue: record.venue.replace(/\s+/g, ' ').trim(),
    citations: Math.max(0, Math.trunc(record.citations) || 0),
    link: paperLink(record.url),
    type: isPreprint(record) ? 'preprint' : 'article',
  };
}

/** "1 citation", "12 citations", and nothing for a paper that has none. */
export function citationsLabel(citations: number): string {
  if (citations <= 0) return '';
  return `${citations.toLocaleString('en-US')} ${citations === 1 ? 'citation' : 'citations'}`;
}

export interface YearGroup<T> {
  year: number;
  items: T[];
}

/** The papers by year, the newest year first; inside a year the order of the data is kept. */
export function groupByYear<T extends { year: number }>(items: T[]): YearGroup<T>[] {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const group = groups.get(item.year);
    if (group) group.push(item);
    else groups.set(item.year, [item]);
  }
  return [...groups].sort(([a], [b]) => b - a).map(([year, list]) => ({ year, items: list }));
}

export interface YearCount {
  year: number;
  count: number;
}

/** Papers per year for every year from the first to the last, a year with none included. */
export function yearCounts(items: { year: number }[]): YearCount[] {
  if (items.length === 0) return [];
  const counts = new Map<number, number>();
  for (const { year } of items) counts.set(year, (counts.get(year) ?? 0) + 1);
  const first = Math.min(...counts.keys());
  const last = Math.max(...counts.keys());
  const out: YearCount[] = [];
  for (let year = first; year <= last; year++) out.push({ year, count: counts.get(year) ?? 0 });
  return out;
}

export interface Totals {
  count: number;
  articles: number;
  preprints: number;
  citations: number;
  /** Null when there is no paper at all. */
  firstYear: number | null;
  lastYear: number | null;
}

export function totals(papers: Pick<Paper, 'year' | 'citations' | 'type'>[]): Totals {
  const years = papers.map((p) => p.year);
  const preprints = papers.filter((p) => p.type === 'preprint').length;
  return {
    count: papers.length,
    articles: papers.length - preprints,
    preprints,
    citations: papers.reduce((sum, p) => sum + p.citations, 0),
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
  };
}

// ---------------------------------------------------------------------------------- search

/**
 * Text as the search compares it: accents off, lower case, every kind of dash as "-", every
 * kind of apostrophe as "'", runs of spaces as one space.
 */
export function searchFold(text: string): string {
  return foldText(text)
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words of a query. */
export function searchTerms(query: string): string[] {
  return searchFold(query).split(' ').filter(Boolean);
}

/** A paper matches when its text, folded with `searchFold`, holds every word of the query. */
export function matchesTerms(foldedText: string, terms: string[]): boolean {
  return terms.every((term) => foldedText.includes(term));
}
