import { writeFileSync } from 'node:fs';

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  if (String(input) === 'https://api.resend.com/emails') {
    const message = JSON.parse(init.body ?? '{}');
    writeFileSync(process.env.TEST_EMAIL_CAPTURE_FILE, JSON.stringify(message), { mode: 0o600 });
    return new Response(JSON.stringify({ id: 'mock-email-id' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return realFetch(input, init);
};
