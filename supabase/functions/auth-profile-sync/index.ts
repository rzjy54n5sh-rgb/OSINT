/**
 * Auth profile sync: on auth.users INSERT, upsert public.users and send welcome email.
 * Triggered by Supabase Auth webhook. Welcome email sent via Resend API (inline HTML).
 */
import { handleCors, jsonResponse, serviceClient } from "../_shared/middleware.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@example.com";
const RESEND_FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "MENA Intel Desk";
const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://mena-intel-desk.pages.dev";

function welcomeEmailHtml(displayName: string, tier: string): string {
  const name = displayName || "there";
  const site = SITE_URL;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Welcome to MENA Intel Desk</title></head>
<body style="margin:0;padding:0;background:#070A0F;font-family:Arial,sans-serif;color:#E2E8F0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">◆ Welcome, ${name}.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">You now have access to MENA Intel Desk on the <strong style="color:#E8C547;">${tier}</strong> tier.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">On the free tier you can explore the War Room, NAI map, scenario tracker, and public briefings.</p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;">
      <a href="${site}" style="color:#E8C547;text-decoration:underline;">Go to platform</a> &nbsp;|&nbsp;
      <a href="${site}/pricing" style="color:#E8C547;text-decoration:underline;">View pricing & upgrade</a>
    </p>
    <p style="margin:0;font-size:12px;color:#8A9BB5;">This is an automated message from MENA Intel Desk.</p>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader?.startsWith("Bearer ") || !serviceKey || authHeader.slice(7) !== serviceKey) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const rec = body as { type?: string; record?: Record<string, unknown> };
  if (rec.type !== "INSERT" || !rec.record) {
    return jsonResponse({ success: true });
  }

  const r = rec.record as Record<string, unknown>;
  const id = r.id as string;
  const email = (r.email as string) || "";
  const appMeta = (r.app_metadata as Record<string, unknown>) || {};
  const rawMeta = (r.raw_user_meta_data as Record<string, unknown>) || {};
  const provider = (appMeta.provider as string) || "email";
  const displayName = (rawMeta.display_name as string) || email;

  const cfCountry = req.headers.get("cf-ipcountry") || "";
  let preferred_currency = "usd";
  if (["AE", "BH", "KW", "OM", "QA", "SA"].includes(cfCountry)) preferred_currency = "aed";
  else if (cfCountry === "EG") preferred_currency = "egp";

  const authProvider = ["google", "apple", "samsung", "microsoft", "github", "magic_link"].includes(provider)
    ? provider
    : "email";

  const supabase = serviceClient();
  await supabase.from("users").upsert(
    {
      id: id,
      email,
      display_name: displayName,
      avatar_url: (rawMeta.avatar_url as string) || null,
      tier: "free",
      tier_source: "free",
      country_code: cfCountry || null,
      preferred_currency,
      auth_provider: authProvider,
      is_suspended: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (RESEND_API_KEY && email) {
    const html = welcomeEmailHtml(displayName, "free");
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${RESEND_FROM_NAME} <${RESEND_FROM}>`,
          to: email,
          subject: "Welcome to MENA Intel Desk",
          html,
        }),
      });
    } catch (_e) {
      // do not fail the webhook
    }
  }

  return jsonResponse({ success: true }, 200, origin);
});
