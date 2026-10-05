import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Generic « Project » collection — M1 simplification: ONE shared collection
 * for both languages (per-lang collections like earlyreflect come in M2).
 * Files: src/content/projects/<slug>.md (0–6 in free V1).
 * The AI generator only ever writes these .md files + site.json + images.
 */
const projects = defineCollection({
  loader: glob({ pattern: ['**/*.md'], base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    role: z.string(),
    /** Free text, e.g. "2024" or "2022–2025" */
    years: z.string(),
    /** ≤ 200 chars — shown in grid + meta description */
    summary: z.string().max(200),
    /** Key art 16:9, WebP — optional so text-only portfolios build */
    keyArt: z.string().optional(),
    keyArtAlt: z.string().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    /** Shown on the home page (max 6 in V1) */
    featured: z.boolean().default(false),
    /** Manual sort; otherwise years descending */
    order: z.number().optional(),
  }),
});

export const collections = { projects };
