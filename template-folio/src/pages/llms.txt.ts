import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import site from '../data/site.json';
import { BASE_PATH, SITE_URL } from '../../config-domain.mjs';

const publicBase = `${SITE_URL.replace(/\/$/, '')}${BASE_PATH === '/' ? '' : BASE_PATH.replace(/\/$/, '')}`;

export const GET: APIRoute = async () => {
  const projects = await getCollection('projects');
  const lines = projects.map(
    (p) => `- ${p.data.title} (${p.data.role}, ${p.data.years}): ${p.data.summary}`,
  );
  const body = [
    `# ${site.name} — ${site.craft}`,
    `Website: ${publicBase}/`,
    `Persona JSON-LD: ${publicBase}/persona.json`,
    `Sitemap: ${publicBase}/sitemap-index.xml`,
    '',
    site.tagline,
    '',
    '## Projects',
    ...lines,
    '',
    `Contact: ${site.email}`,
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
