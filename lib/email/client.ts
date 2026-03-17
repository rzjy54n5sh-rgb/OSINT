import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com';
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME ?? 'MENA Intel Desk';

const defaultFrom = `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;

/**
 * Send an email via Resend. Never throws — returns { success, id? }.
 * Email failure must not crash the app.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  from?: string
): Promise<{ success: boolean; id?: string }> {
  if (!RESEND_API_KEY) {
    console.error('[email] RESEND_API_KEY is not set');
    return { success: false };
  }
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: from ?? defaultFrom,
      to,
      subject,
      html,
    });
    if (error) {
      console.error('[email] Resend error:', error.message);
      return { success: false };
    }
    return { success: true, id: data?.id };
  } catch (e) {
    console.error('[email] sendEmail failed:', e);
    return { success: false };
  }
}
