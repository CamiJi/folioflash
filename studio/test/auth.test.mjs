import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpaqueToken, digestToken, isValidEmail, normalizeEmail, parseCookies } from '../lib/auth.mjs';

test('email addresses are normalized and validated', () => {
  assert.equal(normalizeEmail('  CAMILLE@example.com  '), 'camille@example.com');
  assert.equal(isValidEmail('camille@example.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('x'.repeat(250) + '@example.com'), false);
});

test('magic-link and session tokens are opaque and stored as digests', () => {
  const token = createOpaqueToken();
  assert.notEqual(token, digestToken(token));
  assert.equal(digestToken(token), digestToken(token));
  assert.notEqual(digestToken(token), digestToken(createOpaqueToken()));
});

test('cookie parser reads the session cookie', () => {
  assert.deepEqual(parseCookies('theme=dark; ff_session=a%2Bb'), {
    theme: 'dark',
    ff_session: 'a+b',
  });
});
