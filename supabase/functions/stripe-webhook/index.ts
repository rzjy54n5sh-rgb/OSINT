/**
 * Stripe webhook: subscription and payment events.
 * Payment confirmation email on invoice.payment_succeeded; past-due on invoice.payment_failed.
 * All operations idempotent (ON CONFLICT DO UPDATE). Returns 200 to avoid Stripe retries.
 */
import Stripe from "https://esm.sh/stripe@14?target=deno";
import { handleCors, jsonResponse, serviceClient } from "../_shared/middleware.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-11-20.acacia" }) : null;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@example.com";
const RESEND_FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "MENA Intel Desk";
const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://mena-intel-desk.pages.dev";

function paymentConfirmationHtml(displayName: string, plan: string, amount: number, currency: string): string {
  const name = displayName || "there";
  const amountStr = currency.toUpperCase() === "USD" ? `$${amount}` : `${amount} ${currency.toUpperCase()}`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#070A0F;font-family:Arial,sans-serif;color:#E2E8F0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Your payment has been confirmed. Your <strong style="color:#E8C547;">${plan}</strong> plan is now active and all features are available.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Amount: <strong style="color:#E8C547;">${amountStr}</strong></p>
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;"><a href="${SITE_URL}/account" style="color:#E8C547;text-decoration:underline;">Manage subscription</a></p>
    <p style="margin:0;font-size:12px;color:#8A9BB5;">Stripe receipt sent separately.</p>
  </div>
</body></html>`;
}

function pastDueHtml(displayName: string, retryDate: string): string {
  const name = displayName || "there";
  const retryLine = retryDate ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;">We will retry on <strong style="color:#E8C547;">${retryDate}</strong>.</p>` : "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#070A0F;font-family:Arial,sans-serif;color:#E2E8F0;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Your last payment for your MENA Intel Desk subscription could not be processed.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Your access is temporarily limited to the free tier until payment is updated.</p>
    ${retryLine}
    <p style="margin:0 0 24px;font-size:16px;line-height:1.5;"><a href="${SITE_URL}/account" style="color:#E8C547;text-decoration:underline;">Update payment method</a></p>
    <p style="margin:0;font-size:12px;color:#8A9BB5;">You can also update your card in the Stripe billing portal from your account page.</p>
  </div>
</body></html>`;
}

async function sendResend(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${RESEND_FROM_NAME} <${RESEND_FROM}>`,
        to,
        subject,
        html,
      }),
    });
  } catch (_) {}
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";
  if (!webhookSecret || !stripe) {
    return jsonResponse({ received: true });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (_e) {
    return jsonResponse({ error: "Invalid signature" }, 400, origin);
  }

  const supabase = serviceClient();

  try {
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = sub.customer as string;
      const { data: userRow } = await supabase.from("users").select("id").eq("stripe_customer_id", customerId).maybeSingle();
      const userId = userRow?.id;
      const item = sub.items.data[0];
      const priceId = item?.price?.id;
      const status = sub.status;
      const periodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null;
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const plan = (sub.metadata?.plan as string) || "informed";
      const currency = (sub.metadata?.currency as string) || "usd";
      if (userId) {
        await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_subscription_id: sub.id,
            stripe_customer_id: customerId,
            stripe_price_id: priceId,
            plan: plan === "professional" ? "professional" : "informed",
            status: status === "active" || status === "trialing" ? status : "incomplete",
            currency,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_subscription_id" }
        );
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await supabase.from("subscriptions").update({ status: "canceled", canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("stripe_subscription_id", sub.id);
    } else if (event.type === "invoice.payment_succeeded") {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = inv.customer as string;
      const { data: userRow } = await supabase.from("users").select("id, display_name").eq("stripe_customer_id", customerId).maybeSingle();
      const userId = userRow?.id;
      const subId = inv.subscription as string | null;
      let subscriptionId: string | null = null;
      if (subId) {
        const { data: subRow } = await supabase.from("subscriptions").select("id").eq("stripe_subscription_id", subId).maybeSingle();
        subscriptionId = subRow?.id ?? null;
      }
      const plan = (inv.metadata?.plan as string) || "informed";
      const paymentIntentId = (inv as unknown as { payment_intent?: string }).payment_intent ?? inv.id;
      await supabase.from("payments").upsert(
        {
          user_id: userId,
          subscription_id: subscriptionId,
          stripe_invoice_id: inv.id,
          stripe_payment_intent_id: paymentIntentId,
          type: "subscription",
          amount: inv.amount_paid ?? 0,
          currency: (inv.currency ?? "usd").toLowerCase(),
          status: "succeeded",
          description: inv.description ?? null,
          stripe_event_id: event.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "stripe_payment_intent_id", ignoreDuplicates: false }
      );
      if (userId && userRow?.display_name && RESEND_API_KEY) {
        const email = (inv as unknown as { customer_email?: string }).customer_email;
        if (email) {
          await sendResend(
            email,
            `Payment confirmed — MENA Intel Desk [${plan}]`,
            paymentConfirmationHtml(userRow.display_name as string, plan, Math.round((inv.amount_paid ?? 0) / 100), inv.currency ?? "usd")
          );
        }
      }
    } else if (event.type === "invoice.payment_failed") {
      const inv = event.data.object as Stripe.Invoice;
      const customerId = inv.customer as string;
      const { data: userRow } = await supabase.from("users").select("id, display_name").eq("stripe_customer_id", customerId).maybeSingle();
      const subId = inv.subscription as string | null;
      let subscriptionId: string | null = null;
      if (subId) {
        const { data: subRow } = await supabase.from("subscriptions").select("id").eq("stripe_subscription_id", subId).maybeSingle();
        subscriptionId = subRow?.id ?? null;
      }
      const failPaymentIntentId = (inv as unknown as { payment_intent?: string }).payment_intent ?? `inv_${inv.id}`;
      await supabase.from("payments").upsert(
        {
          user_id: userRow?.id,
          subscription_id: subscriptionId,
          stripe_invoice_id: inv.id,
          stripe_payment_intent_id: failPaymentIntentId,
          type: "subscription",
          amount: inv.amount_due ?? 0,
          currency: (inv.currency ?? "usd").toLowerCase(),
          status: "failed",
          stripe_event_id: event.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "stripe_payment_intent_id", ignoreDuplicates: false }
      );
      const email = (inv as unknown as { customer_email?: string }).customer_email;
      if (email && userRow?.display_name) {
        const nextAttempt = (inv as unknown as { next_payment_attempt?: number }).next_payment_attempt;
        const retryDate = nextAttempt ? new Date(nextAttempt * 1000).toISOString().slice(0, 10) : "";
        await sendResend(email, "Payment failed — MENA Intel Desk subscription", pastDueHtml(userRow.display_name as string, retryDate));
      }
    } else if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata || {};
      if (meta.type === "one_time_report") {
        const userId = meta.supabase_user_id as string;
        const paymentIntentId = (session.payment_intent as string) ?? `session_${session.id}`;
        await supabase.from("payments").upsert(
          {
            user_id: userId,
            stripe_payment_intent_id: paymentIntentId,
            type: "one_time_report",
            amount: (session.amount_total ?? 0),
            currency: (session.currency ?? "usd").toLowerCase(),
            status: "succeeded",
            report_type: (meta.reportType as string) ?? null,
            report_day: meta.conflictDay ? parseInt(String(meta.conflictDay), 10) : null,
            stripe_event_id: event.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_payment_intent_id" }
        );
      }
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = charge.payment_intent as string;
      if (paymentIntentId) {
        const { data: pay } = await supabase.from("payments").select("id, amount").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
        if (pay) {
          const refundAmount = (charge as unknown as { amount_refunded?: number }).amount_refunded ?? 0;
          await supabase.from("payments").update({
            status: "refunded",
            refunded_amount: refundAmount,
            refunded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", pay.id);
        }
      }
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
  }

  return jsonResponse({ received: true }, 200, origin);
});
