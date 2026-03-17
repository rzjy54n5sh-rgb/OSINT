# Email Setup (Resend)

MENA Intel Desk uses [Resend](https://resend.com) for transactional email (HTTP-based, Cloudflare Workers–compatible). Free tier: 3,000 emails/month.

## Setup

1. Sign up at [resend.com](https://resend.com) (free — 3,000 emails/month).
2. Add your domain → configure DNS records (DKIM, SPF, DMARC) in Cloudflare.
3. Verify domain in the Resend dashboard.
4. Create API key → copy to `RESEND_API_KEY`.
5. Update `RESEND_FROM_EMAIL` to your verified domain email.
6. Update `ADMIN_EMAIL` to Omar's email for pipeline alerts.
7. Test: `npm run test:email` (see script below).

## Environment variables

In `.env.local`:

- `RESEND_API_KEY` — Resend API key (starts with `re_`)
- `RESEND_FROM_EMAIL` — Sender address (must be verified domain)
- `RESEND_FROM_NAME` — Sender display name
- `ADMIN_EMAIL` — Recipient for pipeline alerts

## Testing

After setup, test the Resend API directly:

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"noreply@yourdomain.com","to":"test@test.com","subject":"Test","html":"<p>Test</p>"}'
```

Or use `npm run test:email` to send a test email using your `.env.local` config.

## Trigger points (for Phase 5 / Phase 11)

These are **not** new Edge Functions — they are wired inside existing trigger points:

| Email | Trigger point | Phase |
|-------|----------------|-------|
| **Welcome** | `supabase/functions/auth-profile-sync/index.ts` — after creating the `users` row, call Resend (POST https://api.resend.com/emails) with `welcomeEmail(displayName, tier)`. | Phase 5 |
| **Payment confirmation** | `supabase/functions/stripe-webhook/index.ts` — on `invoice.payment_succeeded`, send `paymentConfirmationEmail` to the user. | Phase 5 |
| **Subscription past due** | `supabase/functions/stripe-webhook/index.ts` — on `invoice.payment_failed`, send `subscriptionPastDueEmail`. | Phase 5 |
| **Pipeline alert** | `.github/workflows/scripts/pipeline_audit.py` — on pipeline failure, POST to Resend with `pipelineAlertEmail(conflictDay, stageFailed, errorMessage)`; send to `ADMIN_EMAIL`. | Phase 11 |

**NOTE FOR PHASE 5:** When building `auth-profile-sync`, include the welcome email send after the users row is created. When building `stripe-webhook`, include payment confirmation on `invoice.payment_succeeded` and past-due on `invoice.payment_failed`.

**NOTE FOR PHASE 11:** In `pipeline_audit.py` alert subcommand, add a Resend API call with the pipeline alert template content, sending to `ADMIN_EMAIL`.

## Supabase Edge Functions

Edge Functions that send email need Resend and admin email as secrets:

```bash
supabase secrets set RESEND_API_KEY=re_your_key
supabase secrets set ADMIN_EMAIL=omar@yourdomain.com
```

Optionally set `RESEND_FROM_EMAIL` and `RESEND_FROM_NAME` if you want overrides in the Edge Function environment.
