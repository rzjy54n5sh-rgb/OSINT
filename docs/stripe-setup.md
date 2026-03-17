# Stripe Setup Guide

Step-by-step instructions to configure Stripe for MENA Intel Desk subscriptions and one-time reports.

---

## Step 1: Stripe Account Setup

1. Sign up at [stripe.com](https://stripe.com).
2. Ensure you are in **TEST MODE** (toggle top-right) during all setup.
3. Go to **Developers → API Keys**.
4. Copy **Publishable key** → set as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local`.
5. Copy **Secret key** → set as `STRIPE_SECRET_KEY` in `.env.local`.

---

## Step 2: Create 3 Products

**Stripe Dashboard → Products → Add Product**

Create these three products:

| Product name |
|--------------|
| MENA Intel Desk — Informed |
| MENA Intel Desk — Professional |
| MENA Intel Desk — Single Report |

---

## Step 3: Create 9 Prices (3 products × 3 currencies)

**For "MENA Intel Desk — Informed":**

| Price | Amount | Type |
|-------|--------|------|
| USD  | $9.00/month   | Recurring monthly |
| AED  | 35.00/month   | Recurring monthly |
| EGP  | 450.00/month  | Recurring monthly |

**For "MENA Intel Desk — Professional":**

| Price | Amount   | Type              |
|-------|----------|-------------------|
| USD   | $29.00/month   | Recurring monthly |
| AED   | 109.00/month   | Recurring monthly |
| EGP   | 1,450.00/month | Recurring monthly |

**For "MENA Intel Desk — Single Report":**

| Price | Amount  | Type     |
|-------|---------|----------|
| USD   | $4.99   | One-time |
| AED   | 19.00   | One-time |
| EGP   | 249.00  | One-time |

In Stripe: create one Price per row; attach each to the correct product. For recurring prices, set billing **per unit** and interval **monthly**. For one-time prices, do not set recurrence.

---

## Step 4: Copy Price IDs to Admin Panel

Each price has an ID like `price_1Abc...`.

1. Go to **/admin/pricing** (as SUPER_ADMIN or FINANCE_MANAGER).
2. Paste each Price ID into the correct **Stripe Price ID** field (Informed USD, Informed AED, Professional USD, …).
3. Click **Save** for each section.

---

## Step 5: Set Up Customer Portal

**Stripe Dashboard → Settings → Customer Portal**

- Enable: **Allow customers to cancel subscriptions**
- Enable: **Allow customers to update payment methods**
- Enable: **Invoice history**

Save changes.

---

## Step 6: Register Webhook

**Stripe Dashboard → Developers → Webhooks → Add endpoint**

- **Endpoint URL:**  
  `https://qmaszkkyukgiludcakjg.supabase.co/functions/v1/stripe-webhook`  
  *(Replace with your Supabase project URL if different.)*

- **Events to select:**
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `checkout.session.completed`
  - `charge.refunded`

After creating the endpoint, copy the **Signing secret** → set as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

**Also set in Supabase Edge Functions:**

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

---

## Step 7: Test the Integration

Use Stripe test card: **4242 4242 4242 4242** | any future expiry | any CVV.

**Test flow:**

1. Go to **/pricing** as a logged-in free user.
2. Click **Subscribe** on the Informed plan (USD).
3. Complete checkout with the test card.
4. **Verify:** Webhook fires (Stripe Dashboard → Webhooks → recent events).
5. **Verify:** User tier updates to `informed` in Supabase `public.users`.
6. **Verify:** A subscription row is created in `public.subscriptions`.
7. **Verify:** A payment row is created in `public.payments`.
8. **Verify:** Payment confirmation email is received.

**Test cancellation:**

1. Go to **/account** → **Manage billing** → opens Stripe Customer Portal.
2. Cancel the subscription.
3. **Verify:** `cancel_at_period_end = TRUE` in `public.subscriptions`.
4. At period end, **verify:** user tier reverts to `free`.

---

## Step 8: Go Live

1. In **/admin/config**, change `stripe_mode` from `test` to `live`.
2. In Stripe, toggle off **Test mode** and get your **live** API keys.
3. Set live secret for Edge Functions:  
   `supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx`
4. Set live publishable key in your hosting env (e.g. `wrangler.jsonc` or Cloudflare env vars):  
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx`
5. In Stripe (live mode), create a **new** webhook endpoint pointing to the same Supabase URL.
6. Set live webhook secret:  
   `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_live_xxx`

Keep test and live webhook endpoints separate; use the correct signing secret for each mode.
