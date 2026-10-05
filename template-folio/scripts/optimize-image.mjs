#!/usr/bin/env node
/**
 * Raw image (PNG/JPG/WebP, any size) → web-ready WebP set:
 * → public/images/<name>.webp (1920px max, quality 82) + srcset variants 300/768/1280
 * Usage: node scripts/optimize-image.mjs <source> [final-name]
 * (Same contract as earlyreflect's script — output lines paste into project .md files.)
 */
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const [input, nameArg] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/optimize-image.mjs <image-source> [final-name-no-ext]');
  process.exit(1);
}

const name = (nameArg || path.parse(input).name)
  .toLowerCase()
  .normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const WIDTHS = [300, 768, 1280, 1920];
const QUALITY = 82;

mkdirSync('public/images', { recursive: true });

const source = sharp(input);
const meta = await source.metadata();
const maxW = Math.min(1920, meta.width);

const main = await source.clone()
  .resize({ width: maxW, withoutEnlargement: true })
  .webp({ quality: QUALITY })
  .toFile(`public/images/${name}.webp`);

for (const w of WIDTHS.filter((w) => w < maxW)) {
  await sharp(input).resize({ width: w, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(`public/images/${name}_${w}.webp`);
}

const kb = (statSync(`public/images/${name}.webp`).size / 1024).toFixed(0);
console.log(`✓ public/images/${name}.webp — ${main.width}×${main.height}, ${kb} KB`);
console.log(`
→ In the project file:
  keyArt: "/images/${name}.webp"
  keyArtAlt: "Key art for ${name}"
`);
