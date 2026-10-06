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

test('an explicit no-projects answer produces no invented project cards', async () => {
  const oldProvider = process.env.LLM_PROVIDER;
  const oldKey = process.env.LLM_API_KEY;
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
  try {
    const generated = await generateSite({
      name: 'Zoé Martin',
      craft: 'Photographe',
      prompt: 'Aucune réalisation à présenter pour le moment.',
      briefProfile: { noProjectsYet: true, layout: { cardsJustified: false } },
    });
    assert.deepEqual(generated.projects, []);
    assert.equal(generated.site.projectPresentation, 'editorial');
  } finally {
    if (oldProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = oldKey;
  }
});

test('only approved image IDs are attached and text-only portfolios stay editorial', async () => {
  const oldProvider = process.env.LLM_PROVIDER;
  const oldKey = process.env.LLM_API_KEY;
  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
  const assets = [
    { id: 'photo-one', name: 'photo-one.webp', data: Buffer.from('one') },
    { id: 'photo-two', name: 'photo-two.webp', data: Buffer.from('two') },
  ];
  try {
    const gallery = await generateSite({
      name: 'Zoé Martin', craft: 'Photographe', prompt: 'Deux séries de photos.', assets,
      briefProfile: {
        projects: [
          { title: 'Concert', role: 'Photographe', years: '2025', summary: 'Une scène.', assetIds: ['photo-one'] },
          { title: 'Portraits', role: 'Photographe', years: '2025', summary: 'Des artistes.', assetIds: ['photo-two'] },
        ],
        noProjectsYet: false,
        layout: { cardsJustified: true },
      },
    });
    assert.equal(gallery.projects[0].assetId, 'photo-one');
    assert.equal(gallery.projects[1].assetId, 'photo-two');
    assert.equal(gallery.site.projectPresentation, 'gallery');

    const editorial = await generateSite({
      name: 'Zoé Martin', craft: 'Photographe', prompt: 'Deux séries de photos.', assets: [],
      briefProfile: { projects: [], noProjectsYet: true, layout: { cardsJustified: false } },
    });
    assert.equal(editorial.site.projectPresentation, 'editorial');
  } finally {
    if (oldProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = oldKey;
  }
});
