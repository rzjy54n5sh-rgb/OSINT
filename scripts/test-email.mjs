#!/usr/bin/env node
/**
 * Send a test email via Resend. Loads .env.local.
 * Usage: npm run test:email
 * Set RESEND_API_KEY, RESEND_FROM_EMAIL, and optionally TEST_EMAIL in .env.local.
 */
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
config({ path: join(root, '.env.local') });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com';
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME ?? 'MENA Intel Desk';
const to = process.env.TEST_EMAIL || process.env.ADMIN_EMAIL || 'test@example.com';

async function main() {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set in .env.local');
    process.exit(1);
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
      to,
      subject: 'MENA Intel Desk — test email',
      html: '<p style="font-family:Arial;color:#E2E8F0;">This is a test from MENA Intel Desk email setup.</p>',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Resend API error:', res.status, err);
    process.exit(1);
  }
  const data = await res.json();
  console.log('Test email sent to', to, data.id ? `(id: ${data.id})` : '');
}

main();
