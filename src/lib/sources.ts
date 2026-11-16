// What the pages read, loaded the same way everywhere: the papers with the lab members marked,
// the news posts, and the two lists made of both. This file needs Astro, for the content
// collections; the work itself is in publications.ts and feed.ts, which do not.
import { getCollection } from 'astro:content';
import records from '../data/publications.json';
import seen from '../data/publications-seen.json';
import { site } from '../site.config';
import { buildFeed, latest, type DatedItem, type FeedItem, type NewsPost } from './feed';
import { labMatcher, toPaper, type Paper } from './publications';

/**
 * Every paper of src/data/publications.json, in the order of the file. A lab member is anyone
 * on the Team page, current or former, plus the names the config adds.
 */
export async function loadPapers(): Promise<Paper[]> {
  const team = await getCollection('team');
  const isLab = labMatcher([...team.map((member) => member.data.name), ...site.labAuthors, ...site.pi.spellings]);
  return records.map((record) => toPaper(record, isLab));
}

/** Every news post of src/content/news. */
export async function loadPosts(): Promise<NewsPost[]> {
  const posts = await getCollection('news');
  return posts.map((post) => ({ slug: post.id, title: post.data.title, date: post.data.date, summary: post.data.summary }));
}

/** The news, newest first: the News page and /rss.xml. */
export async function loadFeed(): Promise<DatedItem[]> {
  const [posts, papers] = await Promise.all([loadPosts(), loadPapers()]);
  return buildFeed(posts, papers, seen);
}

/** The rows of the "Latest" list on the home page. */
export async function loadLatest(count = 6): Promise<FeedItem[]> {
  const [posts, papers] = await Promise.all([loadPosts(), loadPapers()]);
  return latest(posts, papers, seen, count);
}
