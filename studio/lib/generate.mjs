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

const MOTIFS = ['cercles', 'topo', 'onde', 'grille', 'botanique', 'chevrons'];
const THEME_KEYS = ['paper', 'surface', 'ink', 'muted', 'rule', 'brand', 'brandStrong', 'artOne', 'artTwo', 'artThree'];

const FALLBACK_THEMES = {
  boucher: {
    paper: '#faf9f5', surface: '#ffffff', ink: '#1d201c', muted: '#68705f', rule: '#e2e0d4',
    brand: '#2f7d3a', brandStrong: '#1f5c28', artOne: '#f1efe4', artTwo: '#dde8d2', artThree: '#bcd8b4',
  },
  studio: {
    paper: '#141114', surface: '#1f1a1c', ink: '#f6efe4', muted: '#c2b3a6', rule: '#443a35',
    brand: '#d9a441', brandStrong: '#f0c264', artOne: '#5c4a2e', artTwo: '#8a6a35', artThree: '#3d4a52',
  },
  atelier: {
    paper: '#f6efe3', surface: '#fffdf6', ink: '#2b2118', muted: '#7a6a58', rule: '#e3d5bd',
    brand: '#b4552d', brandStrong: '#8c3f20', artOne: '#e8b48f', artTwo: '#d98e5f', artThree: '#a9b39a',
  },
  forest: {
    paper: '#edf1e8', surface: '#fbfcf8', ink: '#1c2a22', muted: '#59685e', rule: '#d1d9cc',
    brand: '#276b50', brandStrong: '#174d38', artOne: '#dda1aa', artTwo: '#e7c45a', artThree: '#75a99a',
  },
  paper: {
    paper: '#f5f3eb', surface: '#fffefa', ink: '#192126', muted: '#62696a', rule: '#d8d7cc',
    brand: '#5144d6', brandStrong: '#382bb5', artOne: '#e6a4b7', artTwo: '#f0cb60', artThree: '#82b8aa',
  },
};

/** Deterministic craft fallback when the model returns an invalid style. */
function styleForCraft(craft = '') {
  const c = craft.toLowerCase();
  if (/boucher|charcut|traiteur|boulanger|pâtissier|fromager|poissonnier|cuisine|chef|restaurant/.test(c)) {
    return { theme: FALLBACK_THEMES.boucher, motif: 'grille' };
  }
  if (/sound|audio|musique|music|studio|dj|podcast|voix/.test(c)) {
    return { theme: FALLBACK_THEMES.studio, motif: 'onde' };
  }
  if (/géolog|geolog|mine|mines|carrière|topograph|cartograph|architect|urbaniste|paysagiste/.test(c)) {
    return { theme: FALLBACK_THEMES.forest, motif: 'topo' };
  }
  if (/céramique|céramiste|céram|potier|poterie|sculpt|peintre|peinture|artisan/.test(c)) {
    return { theme: FALLBACK_THEMES.atelier, motif: 'botanique' };
  }
  return { theme: FALLBACK_THEMES.paper, motif: 'cercles' };
}

const isHex = (value) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** A theme is usable only if text stays readable on its background. */
function isReadableTheme(theme) {
  if (!theme || !THEME_KEYS.every((key) => isHex(theme[key]))) return false;
  return contrastRatio(theme.ink, theme.paper) >= 4.5 && contrastRatio(theme.brand, theme.paper) >= 3;
}

export { MOTIFS, THEME_KEYS, FALLBACK_THEMES, styleForCraft, isReadableTheme };

const SYSTEM = `You generate portfolio content as STRICT JSON, no markdown, no commentary.
Shape: {"tagline":str,"bio":str,"theme":{"paper":hex,"surface":hex,"ink":hex,"muted":hex,"rule":hex,"brand":hex,"brandStrong":hex,"artOne":hex,"artTwo":hex,"artThree":hex},"motif":"cercles|topo|onde|grille|botanique|chevrons","designDirection":str(max 160),"fr":{"tagline":str,"bio":str},
"projects":[{"title":str,"role":str,"years":str,"summary":str(max 200 chars),
"fr":{"title":str,"role":str,"summary":str(max 200 chars)}}]}
Rules: 3 projects max, primary project copy in English, accurate French translation in fr,
summaries ≤ 200 chars per language, no lorem ipsum, tone direct and concrete. If no style preference
is supplied, propose a specific visual direction based on craft and projects, not generic adjectives.
CRITICAL — create a FRESH color theme for THIS craft on the spot (never reuse a default):
every hex must be a 6-digit color like "#2f7d3a". Text must stay readable: ink on paper and
brand on paper need strong contrast. Examples of fitting directions (adapt, don't copy):
butcher → near-white background + parsley green accent, minimal color; sound designer →
warm dark background + amber accent; geologist → deep green tones + topographic motif;
ceramist → warm terracotta tones. Pick the motif that fits the craft.`;

function estimateCost(provider, tokensIn, tokensOut) {
  const p = DEFAULT_PRICES[provider] ?? DEFAULT_PRICES.local;
  const priceIn = Number(process.env.LLM_PRICE_IN ?? p.in);
  const priceOut = Number(process.env.LLM_PRICE_OUT ?? p.out);
  return (tokensIn / 1e6) * priceIn + (tokensOut / 1e6) * priceOut;
}

const userBrief = (profile, prompt, stylePreference = '') =>
  `Name: ${profile.name}\nCraft: ${profile.craft}\nStyle preference: ${stylePreference || 'none provided; create a fresh theme fitted to the craft and projects'}\nBrief: ${prompt}`;

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

export async function generateSite({ name, craft, prompt, theme, motif, stylePreference = '', kind = 'v1' }) {
  const provider = (process.env.LLM_PROVIDER ?? '').toLowerCase();
  const hasKey = Boolean(process.env.LLM_API_KEY);

  if (['anthropic', 'openai', 'openrouter'].includes(provider) && hasKey) {
      const result = provider === 'anthropic'
        ? await callAnthropic(prompt, { name, craft }, stylePreference)
        : provider === 'openrouter'
          ? await callOpenRouter(prompt, { name, craft }, stylePreference)
          : await callOpenAI(prompt, { name, craft }, stylePreference);
      const { text, in: tokensIn, out: tokensOut } = result;
      const parsed = JSON.parse(text);
      if (!parsed.tagline || !parsed.bio || !Array.isArray(parsed.projects)) {
        throw new Error('bad shape');
      }
      const explicitlyChangesStyle = /\b(?:palette|theme|th[eè]me|motif|dark|sombre|light|clair|color|colour|couleur|bright|style|couleurs?)\b/i.test(`${prompt} ${stylePreference}`);
      const fallback = styleForCraft(craft);
      // V1 always takes the freshly created style; edits keep the current one unless asked.
      const chooseStyle = kind === 'v1' || explicitlyChangesStyle;
      const chosenTheme = chooseStyle
        ? (isReadableTheme(parsed.theme) ? parsed.theme : fallback.theme)
        : (isReadableTheme(theme) ? theme : fallback.theme);
      const chosenMotif = chooseStyle
        ? (MOTIFS.includes(parsed.motif) ? parsed.motif : fallback.motif)
        : (motif ?? fallback.motif);
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
          theme: chosenTheme,
          motif: chosenMotif,
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
  const fbFallback = styleForCraft(craft);
  return { site: { theme: theme ?? fbFallback.theme, motif: motif ?? fbFallback.motif, ...fb.site }, projects: fb.projects, usage: fb.usage };
}
