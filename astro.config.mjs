// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // The same address as `url` in src/site.config.ts (a test compares them).
  site: 'https://hubner-lab.github.io',
  trailingSlash: 'ignore',
  integrations: [
    // Writes sitemap-index.xml and sitemap-0.xml with every page a search engine may list:
    // the members area is left out (it is marked noindex), and the integration itself leaves
    // out the "page not found" page. public/robots.txt names the index.
    sitemap({
      filter: (page) => !page.includes('/members'),
      namespaces: { news: false, xhtml: false, image: false, video: false },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
