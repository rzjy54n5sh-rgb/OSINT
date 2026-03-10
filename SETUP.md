# OSINT Platform — Free Tier Optimization Setup

Complete step-by-step guide. Follow in order. All steps are one-time setup.

---

## OVERVIEW OF WHAT THIS DOES

```
Before:
  User visits site → Worker hits Supabase on every request
  GitHub Actions running every 15-30 min → burning free minutes fast
  No automated analysis → manual Claude sessions required

After:
  User visits site → Worker reads Cloudflare KV (global edge, <10ms)
  GitHub Actions running every 30-60 min → well within free tier forever
  Daily cron at 6am → Claude auto-updates all 20 country reports + NAI scores
  Supabase only hit by pipeline writers, not users
```

---

## STEP 1 — Supabase Cleanup Jobs (5 minutes)

1. Go to: https://supabase.com/dashboard/project/qmaszkkyukgiludcakjg
2. Click **Database → Extensions**
3. Search for `pg_cron` and **enable it**
4. Go to **SQL Editor → New Query**
5. Paste the entire contents of `docs/8_supabase_cron_cleanup.sql`
6. Click **Run**
7. Verify with: `SELECT jobid, jobname, schedule FROM cron.job;`

**What this does:** Deletes articles >90 days old, deduplicates market data rows, cleans old social trends. Keeps you under 500MB free tier indefinitely.

---

## STEP 2 — Create Cloudflare KV Namespace (3 minutes)

In your terminal (inside the OSINT project folder):

```bash
# Login to Cloudflare (if not already)
npx wrangler login

# Create the KV namespace
npx wrangler kv namespace create "OSINT_CACHE"
```

**Copy the ID it outputs** — looks like: `abc123def456...`

---

## STEP 3 — Update wrangler.toml (1 minute)

Open `wrangler.toml` and **replace** `REPLACE_WITH_KV_NAMESPACE_ID` with the KV namespace ID from Step 2.

---

## STEP 4 — Add GitHub Secrets (5 minutes)

Go to: https://github.com/rzjy54n5sh-rgb/OSINT/settings/secrets/actions

**Required for Deploy (build bakes these into the client — if missing, live site shows 0 articles):**

| Secret Name | Value / Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL, e.g. `https://qmaszkkyukgiludcakjg.supabase.co` (Supabase → Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (Project Settings → API → anon public). Safe to expose; RLS protects data. |

You should also have: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

**Add these if you use KV + daily analysis:**

| Secret Name | Value / Where to get it |
|---|---|
| `CF_KV_NAMESPACE_ID` | The KV namespace ID from Step 2, e.g. `5ff576b8a0c44c7fa45618584829df04` (or run `npx wrangler kv namespace list` and copy the `id` for OSINT_CACHE) |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/keys — create a key; needed for **Daily Claude Analysis** workflow only |

---

## STEP 5 — Scripts and workflows (already in repo)

The following are already in place:

- `.github/workflows/scripts/warm_kv_cache.py`
- `.github/workflows/scripts/daily_analysis.py`
- `.github/workflows/daily-analysis.yml`
- `.github/workflows/collect-articles.yml` (with KV warming, every 60 min)
- `.github/workflows/collect-markets.yml` (with KV warming, every 30 min)
- `.github/workflows/collect-social.yml` (with KV warming, every 12 hours)
- `docs/8_supabase_cron_cleanup.sql` (for Step 1)

---

## STEP 6 — Deploy to Cloudflare (2 minutes)

```bash
npm run build
npx wrangler deploy
```

---

## STEP 7 — Test the Daily Analysis (optional but recommended)

After adding the ANTHROPIC_API_KEY secret:

1. Go to: https://github.com/rzjy54n5sh-rgb/OSINT/actions
2. Click **Daily Claude Analysis**
3. Click **Run workflow** → **Run workflow**
4. Watch the logs — should complete in ~3 minutes
5. Check your site — all 20 countries should show today's date

---

## RESULT — Free Tier Budget After Optimization

| Service | Free Limit | Your Usage After |
|---|---|---|
| GitHub Actions minutes | 2,000/month (private) | ~800/month ✅ |
| Supabase DB storage | 500MB | <100MB with cleanup ✅ |
| Supabase bandwidth | 2GB/month | <100MB (KV handles users) ✅ |
| Cloudflare Workers | 100K req/day | ~500/day ✅ |
| Cloudflare KV reads | 100K/day | ~500/day ✅ |
| Cloudflare KV writes | 1K/day | ~50/day ✅ |

**All free. Forever.**

---

## HOW THE DAILY ANALYSIS WORKS (after setup)

```
Every day at 06:00 UTC (automatically):
  1. GitHub Actions starts daily_analysis.py
  2. Script reads: last 24h articles + markets + social from Supabase
  3. Sends to Claude API with yesterday's NAI baseline
  4. Claude returns JSON with 20 NAI scores + 20 country reports + scenarios
  5. Script writes everything back to Supabase
  6. warm_kv_cache.py pushes fresh snapshot to Cloudflare KV
  7. Site shows updated Day N data by 06:05 UTC
```

You only need to manually trigger me for:
- Deep-dive reports / DOCX exports
- Something unusual that needs human judgment
- Adding new countries or changing scoring methodology

---

## TROUBLESHOOTING — Live site shows zero data (articles: 0, conflict day: —)

**Cause:** The deploy build needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at **build time**. If these GitHub Actions secrets are missing, Next.js bakes `undefined` into the client bundle and the site never calls Supabase.

1. **Add the two secrets** (repo → Settings → Secrets and variables → Actions):  
   `NEXT_PUBLIC_SUPABASE_URL` = your project URL (e.g. `https://qmaszkkyukgiludcakjg.supabase.co`)  
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon/public key from Supabase → Project Settings → API.

2. **Confirm** `.github/workflows/deploy.yml` Build step has `env: NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}` and `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}` (no hardcoded values).

3. **Re-run the Deploy workflow:** Actions → Deploy → Run workflow → Run workflow. Wait ~3–5 min.

4. **Verify:** Open the live site; CONFLICT DAY and article counts should show real data. If not, DevTools → Network: requests to `*.supabase.co` should appear; if not, search the built JS for your project ID to confirm the env was inlined.
