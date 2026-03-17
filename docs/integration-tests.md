# Integration Tests

Manual integration test checklist for MENA Intel Desk. Run in development or staging before go-live.

---

## Auth Flow Tests

- [ ] Email+password signup → users row created in Supabase with tier='free'
- [ ] Google OAuth → auth_provider='google' in users table
- [ ] Magic link → email received, clicking link creates session
- [ ] Forgot password → email received with reset link
- [ ] Reset password → password updated, redirect to /account
- [ ] /account without login → redirects to /login?redirect=/account
- [ ] After login → redirected back to /account (or original destination)
- [ ] Sign out → session cleared, redirect to /

---

## Tier Gating Tests

- [ ] Free user on NAI page → expressed_score shown, latent_score blurred
- [ ] Free user on disinfo page → 5 entries shown, "X more locked" message visible
- [ ] Free user on Egypt report → summary card only, content_json NOT in page source
- [ ] Free user on scenarios → probability bars visible, detail section blurred
- [ ] Informed user on NAI → all columns visible including latent + gap
- [ ] Informed user on Egypt report → full content visible
- [ ] Informed user on UAE report → full content visible
- [ ] Informed user on Saudi report → still blurred (not in T1 countries)
- [ ] Professional user → all country reports visible, all features unlocked
- [ ] API key (T2) with X-MENA-API-Key header → all content accessible

---

## Payment Flow Tests

- [ ] /pricing loads prices from DB (not hardcoded) — change a price in /admin/pricing, verify it updates
- [ ] Subscribe to Informed (USD) → Stripe Checkout opens with correct price
- [ ] Complete test payment (card: 4242 4242 4242 4242) → session redirected to /account?checkout=success
- [ ] Webhook fires → check Stripe Dashboard → Webhooks → recent events
- [ ] User tier updated to 'informed' in Supabase public.users
- [ ] Subscription row created in public.subscriptions with status='active'
- [ ] Payment row created in public.payments with status='succeeded'
- [ ] Payment confirmation email received at user's email
- [ ] /account "Manage billing" → opens Stripe Customer Portal
- [ ] Cancel in portal → cancel_at_period_end=TRUE in subscriptions table
- [ ] Failed payment → invoice.payment_failed webhook → past-due email sent

---

## Admin Panel Tests

- [ ] /admin without login → redirects to /login
- [ ] /admin with non-admin account → redirects to /
- [ ] /admin with SUPER_ADMIN → all 16 pages accessible
- [ ] /admin/users with INTEL_ANALYST → redirects (wrong role)
- [ ] /admin/pipeline with USER_MANAGER → redirects (wrong role)
- [ ] /admin/config with FINANCE_MANAGER → redirects (SUPER_ADMIN only)
- [ ] Manual pipeline trigger → pipeline_runs row created with status='running'
- [ ] NAI score edit → audit_log entry with action_type='NAI_SCORE_OVERRIDE'
- [ ] User tier override → audit_log entry with action_type='USER_TIER_OVERRIDE'
- [ ] Add RSS source → source appears in table
- [ ] Feed test → shows correct health status before saving
- [ ] User suspend → is_suspended=TRUE + audit entry
- [ ] Pricing change → platform_config updated + audit entry

---

## AI Agent Tests

- [ ] Agent panel opens/closes correctly
- [ ] Agent knows current page (shows correct context in responses)
- [ ] INTEL_ANALYST agent: ask "suspend user X" → agent says it cannot do this, explains USER_MANAGER can
- [ ] USER_MANAGER agent: ask "change NAI score" → agent says it cannot do this, explains INTEL_ANALYST can
- [ ] SUPER_ADMIN agent: "add CNN as RSS source" → agent walks through step by step
- [ ] Agent proposal shows "Confirm?" at end
- [ ] Click Confirm → AI_AGENT_CONFIRMED entry in audit log
- [ ] Click Cancel → no changes made, "Action cancelled." in chat
- [ ] Navigate to different page → agent still open, history preserved

---

## Pipeline Tests

- [ ] Manual trigger from admin panel → pipeline_runs row created
- [ ] Pipeline completion → pipeline_runs row updated with duration_seconds
- [ ] Pipeline failure → platform_alert 'pipeline_failure' is_active=TRUE
- [ ] Pipeline failure → alert email sent to ADMIN_EMAIL (Omar's email)
- [ ] Scenario detection → candidate appears in detected_scenarios with status='candidate'
- [ ] Approving scenario → platform_alert 'new_scenario_alert' activates

---

## Email Tests

- [ ] Welcome email: sign up new account → welcome email received
- [ ] Payment confirmation: complete test payment → confirmation email received
- [ ] Past due email: simulate failed payment → past-due email received
- [ ] Pipeline alert: manually run pipeline_audit.py alert → alert email received by ADMIN_EMAIL
