import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import site from '../data/site.json';

export const GET: APIRoute = async () => {
  const projects = await getCollection('projects');
  const lines = projects.map(
    (p) => `- ${p.data.title} (${p.data.role}, ${p.data.years}): ${p.data.summary}`,
  );
  const body = [
    `# ${site.name} — ${site.craft}`,
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
