import type { APIRoute } from 'astro';
import site from '../data/site.json';
import { BASE_PATH, SITE_URL } from '../../config-domain.mjs';
import { buildPersonSchema, safeJsonLd, type PersonaSource } from '../lib/persona';

const persona = site as unknown as PersonaSource;
const canonicalUrl = new URL(BASE_PATH, `${SITE_URL.replace(/\/$/, '')}/`).toString();

export const GET: APIRoute = async () => {
  const body = safeJsonLd({
    ...buildPersonSchema(persona, canonicalUrl),
    portfolio: {
      audience: persona.audience || undefined,
      goal: (site as unknown as { goal?: string }).goal || undefined,
      experiences: persona.experiences ?? [],
      projects: persona.projects ?? [],
      articles: persona.articles ?? [],
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
