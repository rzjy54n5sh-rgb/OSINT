import Stripe from "https://esm.sh/stripe@14?target=deno";
import { handleCors, jsonResponse, authenticate, serviceClient } from "../_shared/middleware.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-11-20.acacia" }) : null;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const auth = await authenticate(req);
  if (!auth.isAuthenticated || !auth.userId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  if (!stripe) {
    return jsonResponse({ error: "Stripe not configured" }, 503, origin);
  }

  let body: { type?: string; plan?: string; currency?: string; reportType?: string; conflictDay?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const type = body.type === "one_time" ? "one_time" : "subscription";
  const plan = type === "subscription" ? (body.plan === "professional" ? "professional" : "informed") : undefined;

  const supabase = serviceClient();
  const { data: user } = await supabase.from("users").select("stripe_customer_id, preferred_currency").eq("id", auth.userId).single();
  const currency = (body.currency as "usd" | "aed" | "egp") || (user?.preferred_currency as string) || "usd";

  let customerId = user?.stripe_customer_id as string | null;
  if (!customerId) {
    const { data: profile } = await supabase.from("users").select("email, display_name").eq("id", auth.userId).single();
    const cust = await stripe.customers.create({
      email: (profile?.email as string) || undefined,
      name: (profile?.display_name as string) || undefined,
      metadata: { supabase_user_id: auth.userId },
    });
    customerId = cust.id;
    await supabase.from("users").update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq("id", auth.userId);
  }

  const { data: configRows } = await supabase.from("platform_config").select("key, value").in("key", [
    "stripe_price_id_informed_" + currency,
    "stripe_price_id_pro_" + currency,
    "stripe_price_id_report_" + currency,
    "trial_days",
  ]);
  const config: Record<string, unknown> = {};
  for (const r of configRows ?? []) config[r.key] = r.value;

  const trialDays = (config.trial_days as number) ?? 7;
  const successUrl = `${origin.startsWith("http") ? origin : "https://mena-intel-desk.pages.dev"}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin.startsWith("http") ? origin : "https://mena-intel-desk.pages.dev"}/pricing?checkout=canceled`;

  if (type === "one_time") {
    const priceId = (config[`stripe_price_id_report_${currency}`] as string) || "";
    if (!priceId) return jsonResponse({ error: "Price not configured" }, 400, origin);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { supabase_user_id: auth.userId, type: "one_time_report", currency, reportType: body.reportType || "", conflictDay: String(body.conflictDay || "") },
    });
    return jsonResponse({ url: session.url, sessionId: session.id }, 200, origin);
  }

  const priceIdKey = plan === "professional" ? `stripe_price_id_pro_${currency}` : `stripe_price_id_informed_${currency}`;
  const priceId = (config[priceIdKey] as string) || "";
  if (!priceId) return jsonResponse({ error: "Price not configured" }, 400, origin);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { trial_period_days: trialDays },
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { supabase_user_id: auth.userId, type: "subscription", plan: plan!, currency },
  });
  return jsonResponse({ url: session.url, sessionId: session.id }, 200, origin);
});
