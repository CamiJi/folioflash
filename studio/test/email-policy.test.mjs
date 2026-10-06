import test from 'node:test';
import assert from 'node:assert/strict';
import { emailDomain, isAllowedEmail, isDisposableEmail } from '../lib/email-policy.mjs';

test('mainstream and personal domains are accepted', () => {
  for (const email of [
    'lea@gmail.com',
    'lea@googlemail.com',
    'nadia@proton.me',
    'ines@protonmail.com',
    'theo@outlook.fr',
    'marie@yahoo.fr',
    'contact@camilleaubert.com',
    'hello@mon-atelier.fr',
  ]) {
    assert.equal(isAllowedEmail(email), true, email);
  }
});

test('throwaway domains are rejected, including subdomains and case variants', () => {
  for (const email of [
    'junk@mailinator.com',
    'junk@yopmail.com',
    'junk@guerrillamail.com',
    'junk@10minutemail.com',
    'spam@yopmail.com',
    'junk@sub.mailinator.com',
    'JUNK@YOPMAIL.COM',
  ]) {
    assert.equal(isDisposableEmail(email), true, email);
    assert.equal(isAllowedEmail(email), false, email);
  }
});

test('malformed addresses have no usable domain', () => {
  assert.equal(emailDomain('not-an-email'), '');
  assert.equal(isAllowedEmail('not-an-email'), false);
  assert.equal(isAllowedEmail('a@b'), false);
});
