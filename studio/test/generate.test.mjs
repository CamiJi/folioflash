import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSite } from '../lib/generate.mjs';

test('style preference is reflected in the local fallback direction', async () => {
  const oldProvider = process.env.LLM_PROVIDER;
  const oldKey = process.env.LLM_API_KEY;
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
  try {
    const generated = await generateSite({
      name: 'Léa',
      craft: 'Illustratrice',
      prompt: 'Albums jeunesse et fresques.',
      palette: undefined,
      stylePreference: 'Gouache colorée, composition joyeuse',
    });
    assert.equal(generated.site.designDirection, 'Gouache colorée, composition joyeuse');
    assert.equal(generated.usage.provider, 'local-fallback');
  } finally {
    if (oldProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = oldKey;
  }
});
