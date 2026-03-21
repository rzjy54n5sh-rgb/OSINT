# Stress & E2E testing

## Production target

The app is deployed to **Cloudflare Workers** (not Vercel). Repair / redeploy with Wrangler:

```bash
# List recent deployments
npx wrangler deployments list

# Roll back to a specific version (optional)
npx wrangler rollback <version-id> -y

# Redeploy current branch (fixes a bad deploy by shipping fresh build)
npm run deploy
```

Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (e.g. in `.env.local`).

## One-shot stress run

Runs **lint**, **`tsc --noEmit`**, and Playwright against **live** `PW_BASE_URL` (default: worker URL in `playwright.config.ts`).

```bash
npm run test:stress
```

`npm run test:stress:quick` skips TypeScript (lint + Playwright only).

## Admin tests

Admin sign-in and all `/admin/*` routes run **only** if you set in `.env.local`:

- `E2E_ADMIN_EMAIL` — must be an **active** `admin_users` row linked to that auth user  
- `E2E_ADMIN_PASSWORD` — that user’s password  

See `docs/supabase-auth-create-user-error.md` if admin login fails.

Without these vars, the admin block is **skipped**; other stress tests still run.

## What `test:stress` covers

| Suite | What it checks |
|--------|----------------|
| `stress-comprehensive.spec.ts` | Public GETs &lt; 500, auth redirects, optional full admin crawl |
| `prod-smoke.spec.ts` | Nav, created test user login, tier gating, CSP headers |
| `edge-functions-smoke.spec.ts` | Key Supabase Edge Functions &lt; 500, CSP on app |

## CI note

Set `PW_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `E2E_ADMIN_*` as secrets.

## GitHub Actions **Deploy** workflow failed (e.g. deploy #104)

The [Deploy workflow](.github/workflows/deploy.yml) runs `npm run build:cf` → **`next build`** with type-checking. Common failures:

1. **TypeScript on `await res.json()`** — Next treats the result as `{}`; add explicit casts (see recent fixes in `AccountClient`, `PricingClient`, `app/api/*`).
2. **Duplicate App Router paths** — e.g. `app/timeline/page.tsx` and `app/(public)/timeline/page.tsx` both map to `/timeline` → build error. Keep a single page file per URL.
3. **Verify Supabase URL in client bundle** — fails if the generated `lib/supabase/env.client.generated.ts` step did not run or secrets are wrong.

Re-run the workflow from the **Actions** tab after pushing a fix.
