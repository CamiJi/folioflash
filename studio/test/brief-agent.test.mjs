import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { advanceBrief, BRIEF_AGENT_LIMITS, requiredBriefFields, validateBriefEvaluation } from '../lib/brief-agent.mjs';

const completeProfile = {
  displayName: 'Zoé Martin',
  craft: 'Photographe de spectacle',
  audience: 'Salles de concert',
  goal: 'Obtenir des commandes photo',
  experiences: [],
  projects: [{ title: 'Festival Lumière', role: 'Photographe', years: '2025', summary: 'Reportage de scène', assetIds: ['photo-valide'] }],
  articles: [],
  articlesReviewed: true,
  noProjectsYet: false,
  visual: { preference: '', references: [], allowCreativeDirection: true },
  layout: { preference: '', cardsJustified: false },
  contact: {},
  imagesApproved: true,
};

test('the completeness evaluator requires an explicit image-publishing choice and a layout direction', () => {
  const complete = validateBriefEvaluation({ profile: completeProfile, ready: true }, ['photo-valide']);
  assert.equal(complete.ready, true);
  assert.deepEqual(complete.missing, []);
  assert.deepEqual(complete.profile.projects[0].assetIds, ['photo-valide']);

  const unapprovedImage = validateBriefEvaluation({ profile: { ...completeProfile, imagesApproved: false }, ready: true }, ['photo-valide']);
  assert.equal(unapprovedImage.ready, false);
  assert.ok(unapprovedImage.missing.includes('images'));
  assert.ok(requiredBriefFields({ ...complete.profile, articlesReviewed: false }, 0).includes('publications'));
});

test('the evaluator drops unknown image IDs and unsafe links before storing a brief', () => {
  const result = validateBriefEvaluation({
    profile: {
      ...completeProfile,
      projects: [{ ...completeProfile.projects[0], url: 'javascript:alert(1)', assetIds: ['not-uploaded'] }],
      contact: { website: 'javascript:alert(1)', linkedin: 'https://www.linkedin.com/in/zoe' },
    },
    ready: true,
  }, ['photo-valide']);
  assert.deepEqual(result.profile.projects[0].assetIds, []);
  assert.equal(result.profile.projects[0].url, '');
  assert.equal(result.profile.contact.website, '');
  assert.equal(result.profile.contact.linkedin, 'https://www.linkedin.com/in/zoe');
});

test('the local development interviewer stays offline and the turn ceiling is explicit', async () => {
  const previousProvider = process.env.LLM_PROVIDER;
  const previousKey = process.env.LLM_API_KEY;
  process.env.LLM_PROVIDER = '';
  delete process.env.LLM_API_KEY;
  try {
    const result = await advanceBrief({
      messages: [{ role: 'user', content: 'Je m’appelle Zoé Martin et je suis photographe de spectacle.' }],
      turnNumber: 1,
    });
    assert.equal(result.usage.model, 'local-fallback');
    assert.equal(result.costEur, 0);
    assert.equal(result.profile.displayName, 'Zoé Martin');
    assert.equal(BRIEF_AGENT_LIMITS.maxTurns, 6);
    assert.equal(BRIEF_AGENT_LIMITS.maxCostEur, 0.02);
  } finally {
    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
    if (previousKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previousKey;
  }
});

test('OpenRouter runs a distinct completeness evaluation and interviewer inside one budget', async (t) => {
  const previous = {
    provider: process.env.LLM_PROVIDER,
    key: process.env.LLM_API_KEY,
    url: process.env.OPENROUTER_BASE_URL,
    usdEur: process.env.USD_EUR_RATE,
    model: process.env.BRIEF_MODEL,
  };
  const requests = [];
  const mock = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    requests.push(payload);
    const interviewer = payload.messages[0].content.includes('interviewer Folioflash');
    const content = interviewer
      ? { reply: 'Tu veux surtout parler à des lieux culturels ou à des particuliers ?' }
      : {
        profile: {
          ...completeProfile,
          audience: '',
          goal: '',
          articlesReviewed: true,
        },
        missing: ['purpose'],
        focus: 'purpose',
        ready: false,
        summary: '',
      };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 120, completion_tokens: 40, cost: 0.00001 },
    }));
  });
  mock.listen(0, '127.0.0.1');
  await once(mock, 'listening');
  t.after(() => new Promise((resolve) => mock.close(resolve)));
  process.env.LLM_PROVIDER = 'openrouter';
  process.env.LLM_API_KEY = 'test-key';
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${mock.address().port}`;
  process.env.USD_EUR_RATE = '1';
  process.env.BRIEF_MODEL = 'google/test-model';
  try {
    const result = await advanceBrief({
      messages: [{ role: 'user', content: 'Je suis photographe.' }],
      previousProfile: {},
      turnNumber: 1,
    });
    assert.equal(requests.length, 2);
    assert.equal(result.ready, false);
    assert.equal(result.missing[0], 'purpose');
    assert.equal(result.reply, 'Tu veux surtout parler à des lieux culturels ou à des particuliers ?');
    assert.equal(result.costEur, 0.00002);
    assert.equal(result.budgetEur, 0.003, 'the account budget uses a conservative per-call reserve');
    assert.equal(result.usage.tokensIn, 240);
    assert.equal(requests[0].max_tokens, 420);
    assert.equal(requests[1].max_tokens, 160);
  } finally {
    if (previous.provider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previous.provider;
    if (previous.key === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = previous.key;
    if (previous.url === undefined) delete process.env.OPENROUTER_BASE_URL;
    else process.env.OPENROUTER_BASE_URL = previous.url;
    if (previous.usdEur === undefined) delete process.env.USD_EUR_RATE;
    else process.env.USD_EUR_RATE = previous.usdEur;
    if (previous.model === undefined) delete process.env.BRIEF_MODEL;
    else process.env.BRIEF_MODEL = previous.model;
  }
});
