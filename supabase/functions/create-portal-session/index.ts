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

  const supabase = serviceClient();
  const { data: user } = await supabase.from("users").select("stripe_customer_id").eq("id", auth.userId).single();
  const stripeCustomerId = user?.stripe_customer_id as string | null;

  if (!stripeCustomerId) {
    return jsonResponse({ error: "No billing account found — subscribe first" }, 400, origin);
  }

  const baseUrl = origin.startsWith("http") ? origin : "https://mena-intel-desk.pages.dev";
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${baseUrl}/account`,
  });

  return jsonResponse({ url: portalSession.url }, 200, origin);
});
