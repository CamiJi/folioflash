import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_THEMES, MOTIFS, isReadableTheme, styleForCraft } from '../lib/generate.mjs';

test('craft fallback maps trades to a fresh visual identity', () => {
  assert.deepEqual(styleForCraft('Boucher charcutier'), { theme: FALLBACK_THEMES.boucher, motif: 'grille' });
  assert.deepEqual(styleForCraft('Sound designer'), { theme: FALLBACK_THEMES.studio, motif: 'onde' });
  assert.deepEqual(styleForCraft('Géologue'), { theme: FALLBACK_THEMES.forest, motif: 'topo' });
  assert.deepEqual(styleForCraft('Céramiste'), { theme: FALLBACK_THEMES.atelier, motif: 'botanique' });
  assert.deepEqual(styleForCraft('Illustratrice jeunesse'), null);
  assert.equal(styleForCraft('Comptable'), null);
});

test('fallback themes are complete and readable', () => {
  for (const theme of Object.values(FALLBACK_THEMES)) {
    assert.equal(isReadableTheme(theme), true);
  }
  assert.equal(isReadableTheme({ ...FALLBACK_THEMES.paper, ink: '#f5f3eb' }), false, 'ink on same-tone paper is rejected');
  assert.equal(isReadableTheme({ ...FALLBACK_THEMES.paper, brand: 'parsley' }), false, 'non-hex colors are rejected');
});

test('motifs match the template allowlist', () => {
  assert.deepEqual(MOTIFS, ['cercles', 'topo', 'onde', 'grille', 'botanique', 'chevrons']);
});
