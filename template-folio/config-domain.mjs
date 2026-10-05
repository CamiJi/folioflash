/**
 * Public client builds use the domain root. The nano demo is mounted under
 * /demo/, so its generated CSS, images, and internal links must use that base.
 */
const isStudioPreview = process.env.FOLIOFLASH_PREVIEW === 'true';

export const SITE_URL = process.env.SITE_URL ?? (
  isStudioPreview ? 'https://folioflash.camilleaubert.com' : 'https://you.folioflash.site'
);
export const BASE_PATH = isStudioPreview ? '/demo/' : '/';
