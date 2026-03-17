/**
 * Pipeline failure alert. Caller must send to ADMIN_EMAIL only (env var).
 * Dark theme, inline styles only.
 */
export function pipelineAlertEmail(
  conflictDay: number,
  stageFailed: string,
  errorMessage: string
): { subject: string; html: string } {
  const subject = `⚠ Pipeline failure — Day ${conflictDay} — MENA Intel Desk`;
  const githubRunUrl = process.env.GITHUB_RUN_URL || '#';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '';
  const adminPanelUrl = `${siteUrl}/admin/pipeline`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#070A0F;font-family:Arial,sans-serif;color:#E2E8F0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;"><strong style="color:#E8C547;">Pipeline failure</strong></p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Day: <strong>${conflictDay}</strong> — Stage: <strong style="color:#E05252;">${stageFailed}</strong></p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#8A9BB5;">${errorMessage.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
      <a href="${githubRunUrl}" style="color:#E8C547;text-decoration:underline;">GitHub Actions run</a> &nbsp;|&nbsp;
      <a href="${adminPanelUrl}" style="color:#E8C547;text-decoration:underline;">Admin panel</a>
    </p>
    <p style="margin:0;font-size:12px;color:#8A9BB5;">MENA Intel Desk — pipeline alert</p>
  </div>
</body>
</html>
`.trim();
  return { subject, html };
}
