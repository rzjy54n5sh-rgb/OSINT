# Testing Strategy (Automation-First)

This document describes the automated testing approach for MENA Intel Desk across **frontend**, **Edge Functions**, **admin panel**, **pipeline**, and **security**.

## Test Suites

### 1) Production Smoke Suite (high-level)

Goal: fast signal that production is healthy and core flows work.

- Runs on demand via GitHub Actions: **Production E2E (Live)** workflow (`.github/workflows/prod-e2e.yml`)
- Time target: < 10 minutes
- Safety: uses a dedicated **dated test user**, cleans up after test run

Coverage (minimum):
- Homepage renders and core navigation is visible
- `/account` redirect works when unauthenticated
- Email/password login works for a fresh test user
- Tier gating sanity: no `content_json` leaks in HTML for a free-tier report page
- Security headers present (CSP, XFO, nosniff)
- Edge Functions basic health checks (`api-scenarios`, `api-nai`, `manage-api-keys`)

### 2) Production Deep Suite (in-depth)

Goal: exhaustive end-to-end confidence (role-based admin, paywalls, audit log writes, pipeline triggers).

- Also runs via `.github/workflows/prod-e2e.yml` with `suite=deep`
- Time target: 30–45 minutes
- Requires additional secrets/accounts (admin accounts for role testing, optionally Stripe test config)

Planned deep coverage (incremental):
- Auth: signup, login redirects, sign-out, forgot/reset password
- Tier gating: validate blurred/locked UI **and** no sensitive data in HTML/JSON payloads
- Admin: role-scoped access for all five roles; verify sidebar filtering; verify key mutations write `admin_audit_log`
- Payments: test-mode end-to-end (optional; requires Stripe test keys and price IDs)
- Pipeline: manual trigger creates `pipeline_runs` and updates status; failure activates `platform_alerts.pipeline_failure`
- AI agent: confirm/cancel creates audit entries; history persists across navigation

## Test Data & Cleanup

Production tests must be isolated:
- Test users are created with email pattern `prod-e2e-YYYY-MM-DD-<rand>@example.com`
- Created rows tied to that user (e.g. `api_keys`, `subscriptions`, `payments`) are deleted in teardown
- **Never** modify real user accounts or non-test rows

## Required Secrets (GitHub Actions)

For production smoke:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (production) — used only to create and delete the test user

Optional for deep suite:
- Admin test account credentials (to be added as secrets if/when needed)

## Local Runs

- Smoke: `npm run test:e2e:smoke`
- Deep: `npm run test:e2e:deep`

To target a different URL locally:

```bash
PW_BASE_URL="https://your-live-or-staging-domain" npm run test:e2e:smoke
```

