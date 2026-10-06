import { createRequire } from 'node:module';
import { isValidEmail, normalizeEmail } from './auth.mjs';

const require = createRequire(import.meta.url);
const disposableDomains = require('disposable-email-domains');
const BLOCKED = new Set(disposableDomains);

export function emailDomain(email) {
  const at = String(email).lastIndexOf('@');
  return at > 0 ? String(email).slice(at + 1).toLowerCase() : '';
}

/** Temporary-mail services, including their subdomains (e.g. x.yopmail.com). */
export function isDisposableEmail(email) {
  const parts = emailDomain(email).split('.').filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (BLOCKED.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

/** Real, durable address required: valid format and no throwaway domain. */
export function isAllowedEmail(email) {
  const normalized = normalizeEmail(email);
  return isValidEmail(normalized) && !isDisposableEmail(normalized);
}
