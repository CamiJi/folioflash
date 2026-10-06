export interface PersonaSource {
  name: string;
  nameIsPseudonym?: boolean;
  craft: string;
  tagline?: string;
  bio?: string;
  email?: string;
  audience?: string;
  goal?: string;
  socials?: Array<{ label: string; url: string }>;
  experiences?: Array<{ title: string; role: string; years: string; summary: string }>;
  articles?: Array<{ title: string; publisher: string; year: string; summary: string; url: string }>;
  projects?: Array<{ title: string; summary: string; keyArt?: string }>;
}

export function buildPersonSchema(source: PersonaSource, canonicalUrl: string) {
  const sameAs = (source.socials ?? []).map((social) => social.url).filter((url) => /^https?:\/\//i.test(url));
  const knowsAbout = [
    source.craft,
    ...(source.experiences ?? []).map((item) => item.title),
    ...(source.projects ?? []).map((item) => item.title),
  ].filter(Boolean);
  const subjectOf = (source.articles ?? []).map((item) => ({
    '@type': 'Article',
    headline: item.title,
    description: item.summary || undefined,
    url: /^https?:\/\//i.test(item.url) ? item.url : undefined,
    publisher: item.publisher ? { '@type': 'Organization', name: item.publisher } : undefined,
  }));
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${canonicalUrl.replace(/\/$/, '')}/#person`,
    name: source.name,
    alternateName: source.nameIsPseudonym ? source.name : undefined,
    jobTitle: source.craft,
    description: source.bio || source.tagline,
    url: canonicalUrl,
    email: source.email && !source.email.endsWith('example.com') ? source.email : undefined,
    sameAs,
    knowsAbout,
    audience: source.audience ? { '@type': 'Audience', audienceType: source.audience } : undefined,
    subjectOf: subjectOf.length ? subjectOf : undefined,
  };
}

export function buildProfilePageSchema(source: PersonaSource, canonicalUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: canonicalUrl,
    name: `${source.name} — ${source.craft}`,
    description: source.bio || source.tagline,
    mainEntity: buildPersonSchema(source, canonicalUrl),
    hasPart: (source.projects ?? []).map((project) => ({
      '@type': 'CreativeWork',
      name: project.title,
      description: project.summary || undefined,
      ...(project.keyArt ? { image: new URL(project.keyArt, canonicalUrl).toString() } : {}),
    })),
  };
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
