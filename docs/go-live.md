# Go-Live Checklist

Pre-launch checklist for MENA Intel Desk. Complete in order before switching to production.

---

## Pre-Launch Checklist

### Security (do first)

- [ ] Next.js version >= 15.2.3 confirmed (CVE patch)
- [ ] Cloudflare: x-middleware-subrequest header strip rule ACTIVE
- [ ] Cloudflare: rate limiting rules configured for /functions/v1/api-*, /admin-*, /login
- [ ] No secret keys in client-side code (Phase 13 audit passed)
- [ ] Supabase Auth URL configured with production domain

### Database

- [ ] All 8 migrations run in production Supabase
- [ ] SELECT get_current_conflict_day() returns correct day
- [ ] SELECT COUNT(*) FROM tier_features = 18
- [ ] SELECT COUNT(*) FROM article_sources = 26
- [ ] SELECT COUNT(*) FROM platform_alerts = 6
- [ ] Omar exists in admin_users with role='SUPER_ADMIN'
- [ ] All 6 platform_alerts have is_active=FALSE (none firing prematurely)

### Supabase Edge Functions

- [ ] All 16 functions deployed to production
- [ ] supabase secrets set for all 5 secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, API_KEY_SECRET, RESEND_API_KEY, ADMIN_EMAIL
- [ ] stripe-webhook endpoint registered in Stripe Dashboard (production)
- [ ] auth-profile-sync webhook configured in Supabase Auth settings

### Email

- [ ] Resend domain verified (DKIM, SPF, DMARC in Cloudflare DNS)
- [ ] RESEND_FROM_EMAIL matches verified domain
- [ ] Test email received from resend.com test endpoint

### Stripe

- [ ] 9 prices created in Stripe (test mode)
- [ ] All 9 Stripe Price IDs entered in /admin/pricing
- [ ] Stripe Customer Portal enabled with cancel + update payment methods
- [ ] Webhook registered with all 7 events
- [ ] Test payment completed end-to-end (tier updates correctly)
- [ ] stripe_mode changed to 'live' in /admin/config when ready
- [ ] Live Stripe keys set in production

### Cloudflare Workers

- [ ] wrangler.jsonc compatibility_date >= 2025-05-05 with nodejs_compat
- [ ] npm run build:cf succeeds
- [ ] wrangler deploy succeeds
- [ ] Custom domain configured (when acquired)
- [ ] NEXT_PUBLIC_SITE_URL updated to production domain

### GitHub Actions

- [ ] All 6 secrets added to repo: SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, RESEND_API_KEY, ADMIN_EMAIL
- [ ] Pipeline triggered manually once → runs successfully end to end
- [ ] Scenario detection stage runs without false positives

### Final verification

- [ ] All integration tests in docs/integration-tests.md pass
- [ ] Plausible analytics domain set and events firing
- [ ] All PaywallOverlay links point to correct production /pricing URL
- [ ] Arabic reports display RTL correctly
- [ ] Existing features still work: methodology page, dispute form, contact page, email capture
