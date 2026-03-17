/**
 * Payment confirmation after successful invoice. Dark theme, inline styles only.
 */
export function paymentConfirmationEmail(
  displayName: string,
  plan: string,
  amount: number,
  currency: string
): { subject: string; html: string } {
  const subject = `Payment confirmed — MENA Intel Desk [${plan}]`;
  const name = displayName || 'there';
  const amountStr = currency.toUpperCase() === 'USD' ? `$${amount}` : `${amount} ${currency.toUpperCase()}`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#070A0F;font-family:Arial,sans-serif;color:#E2E8F0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Your payment has been confirmed. Your <strong style="color:#E8C547;">${plan}</strong> plan is now active and all features are available.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Amount: <strong style="color:#E8C547;">${amountStr}</strong></p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
      <a href="{{SITE_URL}}/account" style="color:#E8C547;text-decoration:underline;">Manage subscription</a>
    </p>
    <p style="margin:0;font-size:12px;color:#8A9BB5;">Stripe receipt sent separately.</p>
  </div>
</body>
</html>
`.trim();
  return { subject, html };
}
