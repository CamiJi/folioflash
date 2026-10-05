import nodemailer from 'nodemailer';
import { writeFileSync } from 'node:fs';

nodemailer.createTransport = () => ({
  async sendMail(message) {
    writeFileSync(process.env.TEST_EMAIL_CAPTURE_FILE, JSON.stringify(message), { mode: 0o600 });
    return { messageId: 'mock-brevo-smtp-id' };
  },
  close() {},
});
