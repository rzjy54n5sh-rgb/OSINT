# MENA Intel Desk

## Docs

- **[PROJECT.md](PROJECT.md)** — stack, structure, **canonical env vars** (§2)
- **[CURSOR.md](CURSOR.md)** — same env names + rules for AI/tools (keep in sync with PROJECT.md)
- [Stripe Setup Guide](docs/stripe-setup.md)
- [Email Setup Guide](docs/email-setup.md)
- [Supabase Auth Setup](docs/supabase-auth-setup.md)
- [Cloudflare Security Config](docs/cloudflare-security.md)
- [Go-Live Checklist](docs/go-live.md)
- [Integration Tests](docs/integration-tests.md)

## Supabase Edge Functions (Phase 5)

Deploy all 10 public edge functions:

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

Set required secrets:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set API_KEY_SECRET=your_32_char_secret
supabase secrets set RESEND_API_KEY=re_your_key
supabase secrets set ADMIN_EMAIL=omar@yourdomain.com
```

Optional (used by auth-profile-sync and stripe-webhook for email):

- `RESEND_FROM_EMAIL` — sender email (default: noreply@example.com)
- `RESEND_FROM_NAME` — sender name (default: MENA Intel Desk)
- `NEXT_PUBLIC_SITE_URL` — site base URL for links (default: https://mena-intel-desk.pages.dev)

### Phase 6 — Admin Edge Functions

Deploy all 6 admin functions:

```bash
supabase functions deploy admin-pipeline
supabase functions deploy admin-users
supabase functions deploy admin-config
supabase functions deploy admin-sources
supabase functions deploy admin-audit
supabase functions deploy admin-agent
```

Additional secret for the AI agent:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxx
```

## Pipeline Setup

### Required GitHub Actions Secrets

Go to: **repo Settings → Secrets and variables → Actions → New repository secret**

| Secret name              | Where to get it |
|--------------------------|-----------------|
| `SUPABASE_URL`           | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY`   | Supabase Dashboard → Settings → API → service_role key |
| `ANTHROPIC_API_KEY`      | console.anthropic.com → API Keys |
| `PERPLEXITY_API_KEY`     | perplexity.ai → API → Keys |
| `RESEND_API_KEY`         | resend.com → API Keys (Phase 4 setup) |
| `ADMIN_EMAIL`            | Email address for pipeline failure alerts |

### Manual Pipeline Trigger (Admin Panel)

Go to **/admin/pipeline** → select stage → click **▶ Run Now**.

### Manual Pipeline Trigger (GitHub)

**Actions** tab → **Daily Intelligence Pipeline** → **Run workflow** → select stage (and optional conflict day / run ID).
