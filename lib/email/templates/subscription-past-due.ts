/**
 * Subscription past due / payment failed. Dark theme, inline styles only.
 */
export function subscriptionPastDueEmail(
  displayName: string,
  retryDate: string
): { subject: string; html: string } {
  const subject = 'Payment failed — MENA Intel Desk subscription';
  const name = displayName || 'there';
  const retryLine = retryDate
    ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;">We will retry on <strong style="color:#E8C547;">${retryDate}</strong>.</p>`
    : '';
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#070A0F;font-family:Arial,sans-serif;color:#E2E8F0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Your last payment for your MENA Intel Desk subscription could not be processed.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Your access is temporarily limited to the free tier until payment is updated.</p>
    ${retryLine}
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
      <a href="{{SITE_URL}}/account" style="color:#E8C547;text-decoration:underline;">Update payment method</a>
    </p>
    <p style="margin:0;font-size:12px;color:#8A9BB5;">You can also update your card in the Stripe billing portal from your account page.</p>
  </div>
</body>
</html>
`.trim();
  return { subject, html };
}
