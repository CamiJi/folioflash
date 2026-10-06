import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIFS, PALETTES, styleForCraft } from '../lib/generate.mjs';

test('craft fallback maps trades to their visual identity', () => {
  assert.deepEqual(styleForCraft('Boucher charcutier'), { palette: 'boucher', motif: 'grille' });
  assert.deepEqual(styleForCraft('Sound designer'), { palette: 'studio', motif: 'onde' });
  assert.deepEqual(styleForCraft('Géologue'), { palette: 'forest', motif: 'topo' });
  assert.deepEqual(styleForCraft('Céramiste'), { palette: 'atelier', motif: 'botanique' });
  assert.deepEqual(styleForCraft('Illustratrice jeunesse'), { palette: 'paper', motif: 'cercles' });
  assert.deepEqual(styleForCraft('Comptable'), { palette: 'paper', motif: 'cercles' });
});

test('palettes and motifs match the template allowlists', () => {
  assert.deepEqual(PALETTES, ['paper', 'iris', 'forest', 'boucher', 'atelier', 'studio']);
  assert.deepEqual(MOTIFS, ['cercles', 'topo', 'onde', 'grille', 'botanique', 'chevrons']);
});
