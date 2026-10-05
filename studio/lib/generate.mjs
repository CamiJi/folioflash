/**
 * Content generator — prompt → site.json + project files.
 *
 * Real LLM when env provides a key (no key = local deterministic fallback,
 * clearly marked, so the pipeline stays testable end-to-end):
 *   LLM_PROVIDER=anthropic|openai   LLM_API_KEY=...   LLM_MODEL=...
 *   LLM_PRICE_IN / LLM_PRICE_OUT = € per 1M tokens (defaults per provider below)
 *
 * Returns { site, projects, usage: { provider, tokensIn, tokensOut, costEur } }.
 * `site` matches template-folio/src/data/site.json, `projects` match the
 * content collection schema (title, role, years, summary, links, featured, order).
 */

const DEFAULT_PRICES = {
  anthropic: { in: 1.0, out: 5.0 }, // €/1M — override via env, re-measured in couts.md §5
  openai: { in: 2.0, out: 8.0 },
  openrouter: { in: 0, out: 0 }, // Use provider-reported cost; don't guess model pricing.
  local: { in: 0, out: 0 },
};

const SYSTEM = `You generate portfolio content as STRICT JSON, no markdown, no commentary.
Shape: {"tagline":str,"bio":str,"palette":"paper|iris|forest","designDirection":str(max 160),"fr":{"tagline":str,"bio":str},
"projects":[{"title":str,"role":str,"years":str,"summary":str(max 200 chars),
"fr":{"title":str,"role":str,"summary":str(max 200 chars)}}]}
Rules: 3 projects max, primary project copy in English, accurate French translation in fr,
summaries ≤ 200 chars per language, no lorem ipsum, tone direct and concrete. If no style preference
is supplied, propose a specific visual direction based on craft and projects, not generic adjectives.`;

function estimateCost(provider, tokensIn, tokensOut) {
  const p = DEFAULT_PRICES[provider] ?? DEFAULT_PRICES.local;
  const priceIn = Number(process.env.LLM_PRICE_IN ?? p.in);
  const priceOut = Number(process.env.LLM_PRICE_OUT ?? p.out);
  return (tokensIn / 1e6) * priceIn + (tokensOut / 1e6) * priceOut;
}

const userBrief = (profile, prompt, stylePreference = '') =>
  `Name: ${profile.name}\nCraft: ${profile.craft}\nCurrent palette: ${profile.palette ?? 'none selected; choose paper, iris, or forest to fit the craft and projects'} (keep an existing palette unless a change is requested)\nStyle preference: ${stylePreference || 'none provided; propose a direction that fits the craft, projects, and brief'}\nBrief: ${prompt}`;

async function callAnthropic(prompt, profile, stylePreference) {
  const model = process.env.LLM_MODEL ?? 'claude-haiku-4-5-20251001';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.LLM_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: 'user', content: userBrief(profile, prompt, stylePreference) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const json = await res.json();
  const text = json.content?.map((b) => b.text ?? '').join('') ?? '';
  return { text, in: json.usage?.input_tokens ?? 0, out: json.usage?.output_tokens ?? 0 };
}

async function callOpenAI(prompt, profile, stylePreference) {
  const model = process.env.LLM_MODEL ?? 'gpt-5-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userBrief(profile, prompt, stylePreference) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    in: json.usage?.prompt_tokens ?? 0,
    out: json.usage?.completion_tokens ?? 0,
  };
}

async function callOpenRouter(prompt, profile, stylePreference) {
  const model = process.env.LLM_MODEL ?? 'google/gemini-3.7-flash';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.LLM_API_KEY}`,
      'HTTP-Referer': 'https://folioflash.camilleaubert.com',
      'X-Title': 'Folioflash',
    },
    body: JSON.stringify({
      model,
      usage: { include: true },
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userBrief(profile, prompt, stylePreference) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}`);
  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    in: json.usage?.prompt_tokens ?? 0,
    out: json.usage?.completion_tokens ?? 0,
    providerCostEur: Number(json.usage?.cost ?? 0) * Number(process.env.USD_EUR_RATE ?? 0.92),
  };
}

/** Deterministic fallback — no key, no network. Marked as such in usage. */
function localFallback(prompt, profile, stylePreference) {
  const firstSentence = prompt.split(/[.!?\n]/).map((s) => s.trim()).filter(Boolean)[0] ?? profile.craft;
  const clean = (s) => s.slice(0, 200);
  const projects = [1, 2, 3].map((n) => ({
    title: `${profile.craft} — project ${n}`,
    role: profile.craft,
    years: '2025',
    summary: clean(`${firstSentence} (v${n})`),
    links: [],
    featured: true,
    order: n,
  }));
  return {
    site: {
      tagline: clean(`${profile.craft} — ${firstSentence}`),
      bio: clean(prompt),
      designDirection: stylePreference || `An editorial, image-led direction for ${profile.craft}, with project-specific color.`,
      fr: { tagline: clean(`${profile.craft} — ${firstSentence}`), bio: clean(prompt) },
    },
    projects,
    usage: {
      provider: 'local-fallback',
      tokensIn: Math.ceil(prompt.length / 4),
      tokensOut: 300,
      costEur: 0,
    },
  };
}

export async function generateSite({ name, craft, prompt, palette, stylePreference = '' }) {
  const provider = (process.env.LLM_PROVIDER ?? '').toLowerCase();
  const hasKey = Boolean(process.env.LLM_API_KEY);

  if (['anthropic', 'openai', 'openrouter'].includes(provider) && hasKey) {
      const result = provider === 'anthropic'
        ? await callAnthropic(prompt, { name, craft, palette }, stylePreference)
        : provider === 'openrouter'
          ? await callOpenRouter(prompt, { name, craft, palette }, stylePreference)
          : await callOpenAI(prompt, { name, craft, palette }, stylePreference);
      const { text, in: tokensIn, out: tokensOut } = result;
      const parsed = JSON.parse(text);
      if (!parsed.tagline || !parsed.bio || !Array.isArray(parsed.projects)) {
        throw new Error('bad shape');
      }
      const explicitlyChangesPalette = /\b(?:palette|theme|th[eè]me|iris|forest|paper|dark|sombre|light|clair|color|colour|couleur|bright)\b/i.test(`${prompt} ${stylePreference}`);
      const chosenPalette = palette && !explicitlyChangesPalette
        ? palette
        : ['paper', 'iris', 'forest'].includes(parsed.palette)
          ? parsed.palette
          : palette ?? 'paper';
      const projects = parsed.projects.slice(0, 6).map((p, i) => ({
        title: String(p.title ?? `Project ${i + 1}`),
        role: String(p.role ?? craft),
        years: String(p.years ?? '2025'),
        summary: String(p.summary ?? '').slice(0, 200),
        frTitle: String(p.fr?.title ?? p.title ?? `Projet ${i + 1}`),
        frRole: String(p.fr?.role ?? p.role ?? craft),
        frSummary: String(p.fr?.summary ?? p.summary ?? '').slice(0, 200),
        links: [],
        featured: true,
        order: i + 1,
      }));
      const costEur = provider === 'openrouter' && result.providerCostEur > 0
        ? result.providerCostEur
        : estimateCost(provider, tokensIn, tokensOut);
      return {
        site: {
          tagline: String(parsed.tagline).slice(0, 200),
          bio: String(parsed.bio).slice(0, 200),
          palette: chosenPalette,
          designDirection: String(parsed.designDirection ?? stylePreference ?? 'A tailored editorial direction based on the creator’s craft and projects.').slice(0, 160),
          fr: {
            tagline: String(parsed.fr?.tagline ?? parsed.tagline).slice(0, 200),
            bio: String(parsed.fr?.bio ?? parsed.bio).slice(0, 200),
          },
        },
        projects,
        usage: { provider, tokensIn, tokensOut, costEur },
      };
  }

  // A configured LLM must never silently fall back to fake content on an API or
  // parsing error. The caller should surface the failure and not spend a credit.
  if (provider && hasKey) throw new Error(`Unsupported LLM provider: ${provider}`);
  const fb = localFallback(prompt, { name, craft }, stylePreference);
  return { site: { palette, ...fb.site }, projects: fb.projects, usage: fb.usage };
}
