/**
 * Welcome email after sign-up. Dark theme, inline styles only.
 */
export function welcomeEmail(
  displayName: string,
  tier: string
): { subject: string; html: string } {
  const subject = 'Welcome to MENA Intel Desk';
  const name = displayName || 'there';
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#070A0F;font-family:Arial,sans-serif;color:#E2E8F0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">◆ Welcome, ${name}.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">You now have access to MENA Intel Desk on the <strong style="color:#E8C547;">${tier}</strong> tier.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">On the free tier you can explore the War Room, NAI map, scenario tracker, and public briefings.</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
      <a href="{{SITE_URL}}" style="color:#E8C547;text-decoration:underline;">Go to platform</a> &nbsp;|&nbsp;
      <a href="{{SITE_URL}}/pricing" style="color:#E8C547;text-decoration:underline;">View pricing & upgrade</a>
    </p>
    <p style="margin:0;font-size:12px;color:#8A9BB5;">This is an automated message from MENA Intel Desk.</p>
  </div>
</body>
</html>
`.trim();
  return { subject, html };
}
