// The news of the lab as one list: the posts in src/content/news, and the papers that the
// Scholar bot saw arrive (src/data/publications-seen.json holds the day it first listed each
// one). The home page shows the top of the list, the News page all of it, and /rss.xml is the
// same list for a feed reader.
// Pure functions. The only import is a type, which is gone before the code runs, so the tests
// load this file in plain Node (tests/site/feed.test.mjs).
import type { Paper } from './publications';

// ---------------------------------------------------------------------------------- the dates file

/**
 * The key of a paper in the dates file: its title in lower case with everything but a-z and
 * 0-9 dropped. It must give what `_key` in scripts/scholar.py gives, because that script writes
 * the file; both are held to one list of examples (tests/scholar/fixtures/keys.json).
 */
export function seenKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The dates file: a day for a paper that arrived as news, null for one that was always there. */
export type SeenDates = Readonly<Record<string, string | null>>;

/** A day as the dates file writes it, "2026-10-25", and a real day of the calendar. */
export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * The day a paper became news: the day the bot first listed it. Null when the paper never was
 * news: its entry is null, it has no entry, or the entry is not a day.
 */
export function seenDay(seen: SeenDates, title: string): string | null {
  // A name that every object has ("constructor") is never a day, so it needs no check of its own.
  const day: unknown = seen[seenKey(title)];
  return isDay(day) ? day : null;
}

/** The first moment of a day, for a feed that wants a date and a time. */
export function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

const DAY_FORMAT = {
  short: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  long: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
};

/** A day for a reader: "25 Oct 2026", or "25 October 2026" with `long`. */
export function formatDay(day: string, style: 'short' | 'long' = 'short'): string {
  return DAY_FORMAT[style].format(dayDate(day));
}

// ---------------------------------------------------------------------------------- the items

/** A news post, as the list needs it. */
export interface NewsPost {
  /** The id of the post in the collection: its page is /news/<slug>/. */
  slug: string;
  title: string;
  date: Date;
  summary?: string;
}

export interface NewsItem {
  kind: 'news';
  /** The day of the post. */
  day: string;
  /** The year of that day. */
  year: number;
  title: string;
  /** The page of the post on this site. */
  href: string;
  /** Empty when the post has none. */
  summary: string;
}

export interface PaperItem {
  kind: 'paper';
  /** The day the bot first listed the paper. Null for a paper that never was news. */
  day: string | null;
  /** The year of the paper, which can be the year before the one it was first listed in. */
  year: number;
  title: string;
  /** The key of the paper in the dates file: a name for it that outlives a change of its link. */
  key: string;
  paper: Paper;
}

/** A paper that arrived as news: it has a day. */
export type DatedPaper = PaperItem & { day: string };

export type FeedItem = NewsItem | PaperItem;
/** An item of the news: it has a day. */
export type DatedItem = NewsItem | DatedPaper;

function newsItem(post: NewsPost): NewsItem {
  const day = post.date.toISOString().slice(0, 10);
  return {
    kind: 'news',
    day,
    year: Number(day.slice(0, 4)),
    title: post.title,
    href: `/news/${post.slug}/`,
    summary: post.summary?.trim() ?? '',
  };
}

function paperItem(paper: Paper, seen: SeenDates): PaperItem {
  return { kind: 'paper', day: seenDay(seen, paper.title), year: paper.year, title: paper.title, key: seenKey(paper.title), paper };
}

/** Every paper once, with its day: a title that the list holds twice counts the first time. */
function paperItems(papers: Paper[], seen: SeenDates): PaperItem[] {
  const met = new Set<string>();
  return papers.map((paper) => paperItem(paper, seen)).filter(({ key, title }) => {
    const name = key || title;
    if (met.has(name)) return false;
    met.add(name);
    return true;
  });
}

const hasDay = (item: PaperItem): item is DatedPaper => item.day !== null;

// ---------------------------------------------------------------------------------- the lists

/**
 * The news, newest first: every post, and every paper that has a first-seen day. On one day the
 * posts come first, in the order of their file names, then the papers in the order of the list.
 */
export function buildFeed(posts: NewsPost[], papers: Paper[], seen: SeenDates): DatedItem[] {
  const news = [...posts].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)).map(newsItem);
  const arrived = paperItems(papers, seen).filter(hasDay);
  // The sort keeps the order above for items of one day.
  return [...news, ...arrived].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

/**
 * The rows of the "Latest" list on the home page: the `count` newest items of the news. When
 * the news is shorter than that, the papers that never were news fill the list up, the newest
 * year first, in the order of the list.
 *
 * The home page prints a year beside each row, not a day: the year of the post, or the year of
 * the paper. So the rows are put in the order of that year, and inside one year the news comes
 * first, newest first, then the papers that fill. A paper of December that the bot lists in
 * January is in the news of the new year, and stands here at the top of its own year.
 */
export function latest(posts: NewsPost[], papers: Paper[], seen: SeenDates, count = 6): FeedItem[] {
  if (count <= 0) return [];
  const rows: FeedItem[] = buildFeed(posts, papers, seen).slice(0, count);
  if (rows.length < count) {
    const fill = paperItems(papers, seen)
      .filter((item) => !hasDay(item))
      .sort((a, b) => b.year - a.year);
    rows.push(...fill.slice(0, count - rows.length));
  }
  return rows.sort((a, b) => b.year - a.year);
}
