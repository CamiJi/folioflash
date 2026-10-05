import { createHash, randomBytes } from 'node:crypto';

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

export const isValidEmail = (value) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const createOpaqueToken = () => randomBytes(32).toString('base64url');

export const digestToken = (token) =>
  createHash('sha256').update(String(token)).digest('hex');

export function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => {
      const index = part.indexOf('=');
      if (index < 0) return ['', ''];
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    }).filter(([name]) => name),
  );
}
