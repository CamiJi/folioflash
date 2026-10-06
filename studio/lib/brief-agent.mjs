const BRIEF_TURN_LIMIT = Number(process.env.BRIEF_MAX_TURNS ?? 6);
const BRIEF_COST_LIMIT_EUR = Number(process.env.BRIEF_MAX_COST_EUR ?? 0.02);
const MAX_ESTIMATED_CALL_COST_EUR = Number(process.env.BRIEF_MAX_CALL_RESERVE_EUR ?? 0.0015);
const MAX_CONTEXT_CHARS = 12_000;

const REQUIRED_FIELDS = [
  ['displayName', 'le nom ou le pseudo à afficher'],
  ['craft', 'ce que tu fais concrètement'],
  ['purpose', 'à qui le site doit parler et à quoi il doit servir'],
  ['projects', 'une réalisation à présenter, ou la confirmation qu’il n’y en a pas encore'],
  ['publications', 'la présence ou non d’articles, interviews et publications'],
  ['visual', 'une idée de style, ou le feu vert pour proposer une direction'],
  ['images', 'la confirmation des images à publier'],
];

const EVALUATOR_SYSTEM = `Tu es l'évaluateur factuel d'un brief de portfolio Folioflash. Tu ne rédiges pas le site et tu ne poses pas de question à l'utilisateur.
Extrais uniquement les éléments explicitement donnés ou confirmés par la personne. Ne complète jamais une expérience, un résultat, une date, un client ou un lien par supposition. Conserve les informations déjà confirmées si elles ne sont pas contredites.
Une réponse « passe », « je ne sais pas » ou « je n'en ai pas » est une information explicite, pas une erreur. Demande au moins une fois si la personne a des articles, interviews ou publications à montrer ; « non » est une réponse complète.
Une réalisation peut être remplacée par l'expérience, ou par noProjectsYet=true si la personne confirme qu'elle n'a rien à présenter.
Si des images sont jointes à ce tour, elles sont identifiées par leur ID. N'invente pas leur contenu. N'autorise à publier une image que si la personne l'a clairement confirmé ; renseigne alors son ID dans le projet correspondant et imagesApproved=true.
Les cartes ne sont pertinentes que si le contenu comporte des réalisations distinctes à parcourir/comparer. Préfère une composition éditoriale ou une page de présentation simple quand c'est plus juste. Si l'utilisateur te laisse décider, cardsJustified doit suivre le contenu, pas une préférence par défaut.
Retourne STRICTEMENT un objet JSON de forme:
{"profile":{"displayName":"","nameIsPseudonym":false,"craft":"","audience":"","goal":"","bio":"","experiences":[{"title":"","role":"","years":"","summary":""}],"projects":[{"title":"","role":"","years":"","summary":"","url":"","assetIds":[]}],"articles":[{"title":"","publisher":"","year":"","summary":"","url":""}],"articlesReviewed":false,"noProjectsYet":false,"visual":{"preference":"","references":[],"allowCreativeDirection":false},"layout":{"preference":"","cardsJustified":false},"contact":{"email":"","website":"","linkedin":"","cta":""},"imagesApproved":false},"missing":["displayName"],"focus":"displayName","ready":false,"summary":"Résumé fidèle, 2 à 5 phrases, sans faits ajoutés"}.
missing contient seulement ces IDs : displayName, craft, purpose, projects, publications, visual, images. Ne marque purpose manquant que si audience ET goal sont absents. projects est complet si experiences/projects contient un élément ou noProjectsYet=true. publications est complet si les articles ont été évoqués et ajoutés, ou si la personne confirme qu'il n'y en a pas. visual est complet si preference est renseignée ou allowCreativeDirection=true. images est complet s'il n'y a aucune image ou si imagesApproved=true.
ready=true uniquement quand aucun élément requis ne manque. Le résumé doit rester simple et peut dire explicitement qu'aucune photo ou aucun projet ne sera montré.`;

const INTERVIEWER_SYSTEM = `Tu es l'interviewer Folioflash. Tu parles à une personne qui construit son portfolio, pas à un designer.
Écris en français simple, chaleureux, court (au plus 2 phrases). Reconnais brièvement ce que tu viens d'apprendre. Si un élément manque, pose UNE seule question concrète, sans liste ni jargon. Tu peux réunir deux informations étroitement liées dans une même phrase naturelle, par exemple nom affiché + métier.
Si la personne n'a pas encore collé de profil, propose-lui au moins une fois de coller son résumé LinkedIn/CV pour garder les dates et expériences justes ; c'est facultatif et tu ne consultes jamais l'URL toi-même.
Ne répète pas une question déjà répondue. Respecte les « passe », « je ne sais pas » et « je n'en ai pas ». N'invente jamais de fait.
Si le brief est prêt, ne pose aucune question : dis que tu as assez d'éléments et que la personne peut relire le résumé puis créer le portfolio.
Retourne strictement {"reply":"…"}.`;

const asString = (value, max = 1200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const asStringArray = (value, maxItems = 6, maxLength = 220) => Array.isArray(value)
  ? value.slice(0, maxItems).map((entry) => asString(entry, maxLength)).filter(Boolean)
  : [];

function sanitizeLinks(value) {
  const candidate = asString(value, 500);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString().slice(0, 500) : '';
  } catch {
    return '';
  }
}

function sanitizeRows(value, includeUrl = false) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((row) => ({
    title: asString(row?.title, 120),
    role: asString(row?.role, 120),
    years: asString(row?.years, 50),
    summary: asString(row?.summary, 400),
    ...(includeUrl ? {
      url: sanitizeLinks(row?.url),
      assetIds: asStringArray(row?.assetIds, 8, 80),
    } : {}),
  })).filter((row) => row.title || row.summary);
}

function sanitizeArticles(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((row) => ({
    title: asString(row?.title, 180),
    publisher: asString(row?.publisher, 120),
    year: asString(row?.year, 30),
    summary: asString(row?.summary, 300),
    url: sanitizeLinks(row?.url),
  })).filter((row) => row.title || row.url);
}

export function validateBriefEvaluation(value, attachmentIds = []) {
  const profile = value?.profile ?? {};
  const allowedAssets = new Set(attachmentIds);
  const projects = sanitizeRows(profile.projects, true).map((project) => ({
    ...project,
    assetIds: project.assetIds.filter((id) => allowedAssets.has(id)),
  }));
  const experiences = sanitizeRows(profile.experiences);
  const incomingVisual = profile.visual ?? {};
  const incomingLayout = profile.layout ?? {};
  const contact = profile.contact ?? {};
  const safeProfile = {
    version: 1,
    displayName: asString(profile.displayName, 100),
    nameIsPseudonym: Boolean(profile.nameIsPseudonym),
    craft: asString(profile.craft, 120),
    audience: asString(profile.audience, 300),
    goal: asString(profile.goal, 300),
    bio: asString(profile.bio, 1600),
    experiences,
    projects,
    articles: sanitizeArticles(profile.articles),
    articlesReviewed: Boolean(profile.articlesReviewed),
    noProjectsYet: Boolean(profile.noProjectsYet),
    visual: {
      preference: asString(incomingVisual.preference, 500),
      references: asStringArray(incomingVisual.references, 4, 500).map(sanitizeLinks).filter(Boolean),
      allowCreativeDirection: Boolean(incomingVisual.allowCreativeDirection),
    },
    layout: {
      preference: asString(incomingLayout.preference, 300),
      cardsJustified: Boolean(incomingLayout.cardsJustified),
    },
    contact: {
      email: asString(contact.email, 254),
      website: sanitizeLinks(contact.website),
      linkedin: sanitizeLinks(contact.linkedin),
      cta: asString(contact.cta, 140),
    },
    imagesApproved: Boolean(profile.imagesApproved),
  };
  const missing = requiredBriefFields(safeProfile, attachmentIds.length);
  return {
    profile: safeProfile,
    missing,
    focus: asString(value?.focus, 40) || missing[0] || '',
    ready: value?.ready === true && missing.length === 0,
    summary: asString(value?.summary, 1200),
  };
}

export function requiredBriefFields(profile, attachmentCount = 0) {
  const hasPurpose = Boolean(profile.audience || profile.goal);
  const hasWork = profile.projects.length > 0 || profile.experiences.length > 0 || profile.noProjectsYet;
  const hasVisual = Boolean(profile.visual.preference || profile.visual.allowCreativeDirection);
  const requirements = {
    displayName: Boolean(profile.displayName),
    craft: Boolean(profile.craft),
    purpose: hasPurpose,
    projects: hasWork,
    publications: profile.articlesReviewed,
    visual: hasVisual,
    images: attachmentCount === 0 || profile.imagesApproved,
  };
  return REQUIRED_FIELDS.map(([key]) => key).filter((key) => !requirements[key]);
}

export function getBriefTurnLimit() {
  return Math.max(1, Math.min(6, BRIEF_TURN_LIMIT));
}

export function getBriefCostLimitEur() {
  return Math.max(0, BRIEF_COST_LIMIT_EUR);
}

function extractJson(text) {
  const candidate = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(candidate);
}

function compactHistory(messages) {
  return messages.slice(-12).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [
      asString(message.content, 1800),
      ...(message.attachments ?? []).map((item) => `[Image jointe ID ${asString(item.id, 80)} : ${asString(item.name, 100)}]`),
    ].filter(Boolean).join('\n'),
  }));
}

function localQuestion(focus) {
  const questions = {
    displayName: 'Quel nom ou pseudo veux-tu afficher, et comment décrirais-tu ton métier en une phrase ?',
    craft: 'En quelques mots, qu’est-ce que tu fais ?',
    purpose: 'Qui veux-tu toucher avec ce site, et qu’aimerais-tu qu’on fasse après l’avoir visité ?',
    projects: 'Quelle réalisation ou expérience aimerais-tu montrer ? Tu peux aussi coller ton CV/LinkedIn pour garder dates et expériences justes, ou me dire que tu n’as pas encore de projet.',
    publications: 'As-tu des articles, interviews ou publications que tu aimerais montrer ? Tu peux aussi me dire non.',
    visual: 'Tu as une ambiance, des couleurs ou un site de référence en tête ? Sinon, je peux proposer une direction.',
    images: 'Est-ce que je peux utiliser les images que tu as déposées sur ton futur site ?',
  };
  return questions[focus] ?? 'Qu’aimerais-tu que les visiteurs retiennent de ton travail ?';
}

function localProfileFromHistory(messages, previousProfile) {
  const text = messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
  const profile = { ...previousProfile };
  if (!profile.displayName) {
    const candidate = text.match(/(?:je m'appelle|je m’appelle|mon pseudo est|mon nom est)\s+(.+?)(?=\s+(?:et\s+)?je suis\b|[,\n.]|$)/i)?.[1];
    if (candidate) profile.displayName = candidate.trim().slice(0, 100);
  }
  if (!profile.craft) {
    const candidate = text.match(/(?:je suis|mon métier est|je travaille comme)\s+([^\n,.]+)/i)?.[1];
    if (candidate) profile.craft = candidate.trim().slice(0, 120);
  }
  if (!profile.audience && /pour\s+(?:les|des|la|le|l')/i.test(text)) profile.audience = text.slice(-250);
  if (!profile.goal && /contact|contacter|vendre|réserver|portfolio|travail/i.test(text)) profile.goal = text.slice(-250);
  if (!profile.visual) profile.visual = { preference: '', references: [], allowCreativeDirection: false };
  if (!profile.layout) profile.layout = { preference: '', cardsJustified: false };
  if (!profile.contact) profile.contact = { email: '', website: '', linkedin: '', cta: '' };
  if (!profile.projects) profile.projects = [];
  if (!profile.experiences) profile.experiences = [];
  if (!profile.articles) profile.articles = [];
  if (!profile.articlesReviewed && /article|interview|publication|presse|aucun|pas d'article|rien à publier/i.test(text)) profile.articlesReviewed = true;
  if (!profile.noProjectsYet && /pas encore de projet|aucun projet|je n'ai pas de projet|je n'ai rien à montrer/i.test(text)) profile.noProjectsYet = true;
  return profile;
}

function estimateCostEur(json, inputTokens, outputTokens) {
  const usd = Number(json.usage?.cost ?? 0);
  if (usd > 0) return usd * Number(process.env.USD_EUR_RATE ?? 0.92);
  const input = Number(process.env.BRIEF_PRICE_IN_USD_PER_M ?? 0.5);
  const output = Number(process.env.BRIEF_PRICE_OUT_USD_PER_M ?? 3);
  return ((inputTokens * input + outputTokens * output) / 1_000_000) * Number(process.env.USD_EUR_RATE ?? 0.92);
}

async function callOpenRouter({ system, messages, images = [], maxTokens, spentEur }) {
  if (spentEur + MAX_ESTIMATED_CALL_COST_EUR > BRIEF_COST_LIMIT_EUR) {
    throw new Error('brief_cost_limit');
  }
  const model = process.env.BRIEF_MODEL ?? process.env.LLM_MODEL ?? 'google/gemini-3.7-flash';
  const last = messages.at(-1);
  const content = [{ type: 'text', text: asString(last?.content, MAX_CONTEXT_CHARS) }];
  for (const image of images) {
    content.push({ type: 'text', text: `Image jointe (ID ${image.id}, nom ${image.name}) :` });
    content.push({ type: 'image_url', image_url: { url: `data:image/webp;base64,${image.data.toString('base64')}` } });
  }
  const requestMessages = [
    { role: 'system', content: system },
    ...messages.slice(0, -1),
    { role: last?.role === 'assistant' ? 'assistant' : 'user', content: images.length ? content : asString(last?.content, MAX_CONTEXT_CHARS) },
  ];
  const baseUrl = (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.LLM_API_KEY}`,
        'HTTP-Referer': process.env.PUBLIC_BASE_URL ?? 'https://folioflash.camilleaubert.com',
        'X-Title': 'Folioflash brief agent',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        usage: { include: true },
        response_format: { type: 'json_object' },
        messages: requestMessages,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    const error = new Error('brief_openrouter_network_error', { cause });
    error.briefBudgetEur = MAX_ESTIMATED_CALL_COST_EUR;
    error.briefProviderCostEur = 0;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`brief_openrouter_${response.status}`);
    error.briefBudgetEur = MAX_ESTIMATED_CALL_COST_EUR;
    error.briefProviderCostEur = 0;
    throw error;
  }
  let json;
  try {
    json = await response.json();
  } catch (cause) {
    const error = new Error('brief_openrouter_invalid_response', { cause });
    error.briefBudgetEur = MAX_ESTIMATED_CALL_COST_EUR;
    error.briefProviderCostEur = 0;
    throw error;
  }
  const usage = json.usage ?? {};
  const tokensIn = Number(usage.prompt_tokens ?? 0);
  const tokensOut = Number(usage.completion_tokens ?? 0);
  const providerCostEur = estimateCostEur(json, tokensIn, tokensOut);
  const budgetEur = Math.max(providerCostEur, MAX_ESTIMATED_CALL_COST_EUR);
  let value;
  try {
    value = extractJson(json.choices?.[0]?.message?.content);
  } catch (cause) {
    const error = new Error('brief_openrouter_invalid_json', { cause });
    error.briefBudgetEur = budgetEur;
    error.briefProviderCostEur = providerCostEur;
    throw error;
  }
  return {
    value,
    costEur: providerCostEur,
    budgetEur,
    usage: {
      model,
      tokensIn,
      tokensOut,
      costEur: providerCostEur,
    },
  };
}

function makeContext(messages, profile, turnNumber, missing) {
  const transcript = compactHistory(messages).map((message) => `${message.role === 'user' ? 'CREATOR' : 'FOLIOFLASH'}: ${message.content}`).join('\n');
  return `Échange ${turnNumber}/${getBriefTurnLimit()}.\nÉtat confirmé à conserver : ${JSON.stringify(profile).slice(0, 5000)}\nÀ clarifier : ${JSON.stringify(missing)}\nConversation récente :\n${transcript}`.slice(-MAX_CONTEXT_CHARS);
}

export async function advanceBrief({ messages, previousProfile = {}, attachments = [], turnNumber, spentEur = 0 }) {
  if (turnNumber > getBriefTurnLimit()) throw new Error('brief_turn_limit');
  const attachmentIds = attachments.map((item) => item.id);
  const hasOpenRouter = (process.env.LLM_PROVIDER ?? '').toLowerCase() === 'openrouter' && Boolean(process.env.LLM_API_KEY);

  if (!hasOpenRouter) {
    const profile = localProfileFromHistory(messages, previousProfile);
    const safe = validateBriefEvaluation({ profile, ready: false }, attachmentIds);
    const missing = safe.missing;
    const ready = missing.length === 0 && Boolean(safe.profile.displayName && safe.profile.craft);
    return {
      ...safe,
      ready,
      summary: ready ? 'Le brief est prêt.' : '',
      reply: ready ? 'J’ai assez d’éléments. Relis le résumé, puis tu pourras créer ton portfolio.' : localQuestion(missing[0]),
      usage: { model: 'local-fallback', tokensIn: 0, tokensOut: 0, costEur: 0 },
      costEur: 0,
      budgetEur: 0,
    };
  }

  let evaluationResponse;
  try {
    evaluationResponse = await callOpenRouter({
      system: EVALUATOR_SYSTEM,
      messages: [{ role: 'user', content: makeContext(messages, previousProfile, turnNumber, REQUIRED_FIELDS.map(([key]) => key)) }],
      images: attachments,
      maxTokens: 420,
      spentEur,
    });
  } catch (error) {
    error.partialBudgetEur = error.briefBudgetEur ?? 0;
    error.partialCostEur = error.briefProviderCostEur ?? 0;
    throw error;
  }
  const evaluation = validateBriefEvaluation(evaluationResponse.value, attachmentIds);
  const firstCost = evaluationResponse.costEur;
  const firstBudget = evaluationResponse.budgetEur;
  let interviewerResponse = null;
  let budgetReached = false;
  if (!evaluation.ready && spentEur + firstBudget + MAX_ESTIMATED_CALL_COST_EUR <= BRIEF_COST_LIMIT_EUR) {
    try {
      interviewerResponse = await callOpenRouter({
        system: INTERVIEWER_SYSTEM,
        messages: [{ role: 'user', content: makeContext(messages, evaluation.profile, turnNumber, evaluation.missing) }],
        maxTokens: 160,
        spentEur: spentEur + firstBudget,
      });
    } catch (error) {
      if (error.message !== 'brief_cost_limit') {
        error.partialBudgetEur = firstBudget + (error.briefBudgetEur ?? 0);
        error.partialCostEur = firstCost + (error.briefProviderCostEur ?? 0);
        throw error;
      }
      budgetReached = true;
    }
  } else if (!evaluation.ready) {
    budgetReached = true;
  }
  const interviewerUsage = interviewerResponse?.usage;
  const interviewerCost = interviewerResponse?.costEur ?? 0;
  const interviewerBudget = interviewerResponse?.budgetEur ?? 0;
  const totalCost = firstCost + interviewerCost;
  const totalBudget = firstBudget + interviewerBudget;
  if (spentEur + totalBudget > BRIEF_COST_LIMIT_EUR) budgetReached = true;
  const ready = evaluation.ready && !budgetReached;
  const assistantReply = budgetReached
    ? 'J’ai rassemblé ce que tu m’as dit, mais le budget de préparation est atteint. Je m’arrête ici pour ne pas lancer d’autres appels IA.'
    : ready
      ? `J’ai assez d’éléments pour préparer ton portfolio. ${evaluation.summary || 'Relis le résumé, puis tu pourras le créer.'}`
      : interviewerResponse?.value?.reply;
  return {
    ...evaluation,
    ready,
    budgetReached,
    reply: asString(assistantReply, 700),
    usage: {
      model: evaluationResponse.usage.model,
      tokensIn: evaluationResponse.usage.tokensIn + (interviewerUsage?.tokensIn ?? 0),
      tokensOut: evaluationResponse.usage.tokensOut + (interviewerUsage?.tokensOut ?? 0),
      costEur: totalCost,
    },
    costEur: totalCost,
    budgetEur: totalBudget,
  };
}

export const BRIEF_AGENT_LIMITS = Object.freeze({
  maxTurns: getBriefTurnLimit(),
  maxCostEur: getBriefCostLimitEur(),
});
