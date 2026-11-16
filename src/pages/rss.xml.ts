// /rss.xml: the news of the lab for a feed reader. The same list as the News page: the posts,
// and the papers with the day the Scholar bot first listed them (src/lib/feed.ts).
import rss, { type RSSFeedItem } from '@astrojs/rss';
import type { APIContext } from 'astro';
import { dayDate, type DatedItem } from '../lib/feed';
import { authorsText, foldLine } from '../lib/publications';
import { loadFeed } from '../lib/sources';
import { site } from '../site.config';

// The name of a paper in the feed. A reader knows an item by this, so it is made from the key
// of the paper's title, not from its link, which Scholar changes now and then. It must stay
// as it is, even if the site moves: with another prefix every paper would be listed as new.
const PAPER_ID = 'tag:hubner-lab.github.io,2026:paper:';

function entry(item: DatedItem): RSSFeedItem {
  if (item.kind === 'news') {
    return { title: item.title, link: item.href, pubDate: dayDate(item.day), description: item.summary || undefined };
  }
  const { paper } = item;
  const authors = authorsText(foldLine(paper.authors.all, 2));
  return {
    title: `New paper: ${item.title}`,
    // A paper without a link leads to its year on the Publications page.
    link: paper.link?.href ?? `/publications/#y${paper.year}`,
    pubDate: dayDate(item.day),
    description: [authors, paper.venue].filter(Boolean).map((part) => `${part}.`).join(' ') || undefined,
    // The key holds only a-z and 0-9, so it needs no escaping. This replaces the id that the
    // feed would make from the link.
    customData: `<guid isPermaLink="false">${PAPER_ID}${item.key}</guid>`,
  };
}

export async function GET(context: APIContext) {
  const home = context.site ?? new URL(site.url);
  const items = await loadFeed();
  return rss({
    title: site.name,
    description: `News and new papers from the ${site.name}.`,
    site: home,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData:
      '<language>en</language>' +
      `<atom:link href="${new URL('/rss.xml', home).href}" rel="self" type="application/rss+xml"/>`,
    items: items.map(entry),
  });
}
