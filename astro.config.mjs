// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://hubnerlab.github.io',
  base: '/HubnerLabWebSite',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
