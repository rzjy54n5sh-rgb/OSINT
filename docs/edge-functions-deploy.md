# Supabase Edge Functions — Deployment (Phase 5)

Deploy all 10 functions from the project root:

```bash
supabase functions deploy auth-profile-sync
supabase functions deploy create-checkout
supabase functions deploy create-portal-session
supabase functions deploy stripe-webhook
supabase functions deploy api-nai
supabase functions deploy api-country
supabase functions deploy api-scenarios
supabase functions deploy api-disinfo
supabase functions deploy api-dispute
supabase functions deploy manage-api-keys
```

## Secrets

Set all required secrets (Supabase Dashboard → Edge Functions → Secrets, or CLI):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set API_KEY_SECRET=your_32_char_secret
supabase secrets set RESEND_API_KEY=re_your_key
supabase secrets set ADMIN_EMAIL=omar@yourdomain.com
```

Optional for auth-profile-sync and emails:

- `RESEND_FROM_EMAIL` — verified sender address
- `RESEND_FROM_NAME` — sender name
- `NEXT_PUBLIC_SITE_URL` — site URL for links in emails

## Auth webhook

Configure Supabase Auth to call `auth-profile-sync` on signup (Dashboard → Authentication → Hooks → "Send email" or custom hook pointing to your function URL with `Authorization: Bearer <SERVICE_ROLE_KEY>`).

## Stripe webhook

In Stripe Dashboard → Developers → Webhooks, add endpoint:

- URL: `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`
- Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`, `checkout.session.completed`, `charge.refunded`
- Signing secret → `STRIPE_WEBHOOK_SECRET`

## Verification checklist (Phase 5)

- [ ] All 10 function directories exist with `index.ts`
- [ ] `_shared/` has `cors.ts` and `middleware.ts`
- [ ] No global Supabase clients in any function (new client per call)
- [ ] `auth-profile-sync` sends welcome email via Resend API
- [ ] `stripe-webhook` handles: subscription created/updated/deleted, invoice.payment_succeeded, invoice.payment_failed, checkout.session.completed (one_time_report), charge.refunded
- [ ] `stripe-webhook` sends payment confirmation and past-due emails
- [ ] `create-portal-session` returns Stripe portal URL; 400 if no `stripe_customer_id`
- [ ] `api-nai`: T0 gets `expressed_score` only; velocity only for T1+
- [ ] `api-country`: T1 gets EGY + UAE/ARE only; T2 gets all
- [ ] `api-disinfo`: T0 gets 5 rows; `total` always returned
- [ ] `manage-api-keys`: T2 only; raw key shown once on create; HMAC stored
- [ ] All functions handle OPTIONS preflight
- [ ] `supabase functions deploy` succeeds for all 10

---

## Phase 6 — Admin Edge Functions (6 functions)

Deploy from project root:

```bash
supabase functions deploy admin-pipeline
supabase functions deploy admin-users
supabase functions deploy admin-config
supabase functions deploy admin-sources
supabase functions deploy admin-audit
supabase functions deploy admin-agent
```

Additional secret for admin-agent (Claude):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxx
```

### Verification checklist (Phase 6)

- [ ] All 6 admin functions exist and deploy without errors
- [ ] `_shared/admin-middleware.ts` has PAGE_PERMISSIONS for all 16 pages
- [ ] Every PATCH/POST/DELETE in every admin function calls `writeAuditLog()`
- [ ] admin-agent system prompt lists capabilities per role accurately
- [ ] admin-agent never suggests touching scenarios or disinformation
- [ ] admin-agent confirmedAction path writes AI_AGENT_CONFIRMED
- [ ] admin-config/pricing accessible to FINANCE_MANAGER
- [ ] admin-config/features SUPER_ADMIN only
- [ ] admin-sources/test does NOT write to DB
- [ ] admin-audit returns own entries only for non-SA roles
- [ ] `supabase functions deploy` succeeds for all 6
