// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { SITE_URL, BASE_PATH } from './config-domain.mjs';

const publicBase = new URL(BASE_PATH, `${SITE_URL.replace(/\/$/, '')}/`);
import { SITE_URL, BASE_PATH } from './config-domain.mjs';

export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [sitemap({
    customPages: [new URL('persona.json', publicBase).toString()],
    filter: (page) => !page.endsWith('/robots.txt') && !page.endsWith('/llms.txt'),
  })],
});
