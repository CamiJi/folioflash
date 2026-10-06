import type { APIRoute } from 'astro';
import { SITE_URL, BASE_PATH } from '../../config-domain.mjs';

const base = `${SITE_URL.replace(/\/$/, '')}${BASE_PATH === '/' ? '' : BASE_PATH.replace(/\/$/, '')}`;

export const GET: APIRoute = async () => {
  const body = [`User-agent: *`, `Allow: /`, '', `Sitemap: ${base}/sitemap-index.xml`].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
