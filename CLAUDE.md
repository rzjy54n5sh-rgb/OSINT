# MENA Intel Desk — Claude Standing Brief
# Omar Seif | Egypt + UAE | github.com/rzjy54n5sh-rgb/OSINT
# UPDATE THIS FILE whenever Claude does something wrong — it compounds over time.
# Operating model in force since 2026-10-05 (see "Operating Model"). Last reviewed: 2026-10-06.

## Project Identity
- **Platform:** MENA Intel Desk — live OSINT geopolitical intelligence tracker
- **Conflict:** US-Iran War 2026 (Operation Epic Fury / True Promise IV / Roaring Lion)
- **Operator:** Omar Seif — sole operator, companies in Egypt and UAE
- **Repo:** github.com/rzjy54n5sh-rgb/OSINT
- **Live URL:** mena-intel-desk.mores-cohorts9x.workers.dev
- **Supabase project:** qmaszkkyukgiludcakjg

## Operating Model (effective 2026-10-05)
- **Ownership:** Claude owns the repo, workflows, deploy, schema and content. Cursor is no longer used — nothing is delegated to it and no Cursor prompts are written. Omar is the operator and makes the rulings listed under "Open Operator Rulings".
- **No metered AI API in automation.** Agent-based analysis runs only as the Claude scheduled task "MENA Intel Desk — daily build" (06:51 Cairo) on subscription. Never add a workflow or script that calls the Anthropic, Perplexity or any other paid model API.
- **Free tiers only** (GitHub, Vercel, Supabase, Cloudflare, AI). Flag limit or cost risk before building, not after.
- **Retired:** five Anthropic-API workflows (`daily-analysis`, `daily_pipeline`, `disinfo-analysis`, `social-analysis`, `strategic-analysis`) live in `.github/workflows-retired/` — never move them back. Its `README.md` has the run history: ~$100 burned, 247 of ~320 runs failed, `daily_analysis.py` scheduled twice daily with no short-circuit.

## Stack
- **Frontend:** Next.js 15.2.9 + React 19.2.4 + TypeScript + Tailwind CSS
- **Hosting:** Cloudflare Workers via @opennextjs/cloudflare 1.17.1 + wrangler 3.99.0
- **DB:** Supabase PostgreSQL (PostgREST via direct HTTP)
- **Payments:** Stripe | **Email:** Resend | **Analytics:** Plausible
- **Collectors (no AI, GitHub Actions, free — public repo):** Collect Feeds (hourly), Collect Market Data (every 30 min), Collect Social Trends (every 12 h), Collect Disinfo Claims (daily 06:00 UTC), Deploy (on push to `main`). Manual-only / disabled: Production E2E, Run DB Migration.
- **Agent analysis:** Claude scheduled task "MENA Intel Desk — daily build" (06:51 Cairo, subscription). There is NO model in the GitHub pipeline.
- **Reports:** Node.js `docx` npm package — never PDF/ReportLab

## Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Type check | `npm run type-check` |
| Lint | `npm run lint` |
| Build (Next.js) | `npm run build` |
| Build (Cloudflare) | `npm run build:cf` |
| Local preview | `npm run preview` |
| Deploy | `npm run deploy` |
| Validate docx | `python3 /mnt/skills/public/docx/scripts/office/validate.py [file]` |
| E2E smoke tests | `npm run test:e2e:smoke` |

## Architecture
- `app/` — Next.js App Router. Public pages are top-level routes (`app/nai/`, `app/scenarios/`, `app/disinfo/`, `app/countries/`, `app/markets/`, `app/briefings/`, `app/warroom/` …); route groups: `app/(public)/` (api-docs, sources, timeline), `app/(auth)/`, `app/(platform)/` (account, pricing)
- `app/(admin)/` — Admin panel (17 pages under `app/(admin)/admin/`, 5 RBAC roles: SUPER_ADMIN, INTEL_ANALYST, USER_MANAGER, FINANCE_MANAGER, CONTENT_REVIEWER)
- `supabase/functions/` — 17 Edge Functions + `_shared` (6 `admin-*`, 11 other)
- `lib/api/` — Public API layer (nai.ts, scenarios.ts, country.ts, disinfo.ts, dispute.ts)
- `lib/api/admin/` — Admin API layer (pipeline.ts, users.ts, config.ts, sources.ts, audit.ts, agent.ts)
- `lib/conflict-calendar.ts` — the one implementation of DAY LOCK (`currentConflictDay()`)
- `utils/supabase/` — 4 files ONLY: client.ts, server.ts, admin.ts, middleware.ts
- `lib/email/` — Resend templates (welcome, payment-confirmation, subscription-past-due, pipeline-alert, daily-digest)
- `.github/workflows/` — active: `collect-articles.yml`, `collect-markets.yml`, `collect-social.yml`, `collect-disinfo.yml`, `deploy.yml`; manual-only/disabled: `prod-e2e.yml`, `run-migration.yml`
- `.github/workflows-retired/` — the five retired AI workflows + `README.md` (run history)
- `.github/workflows/scripts/` — collectors in use (not exhaustive): `collect_feeds.py`, `collect_markets.py`, `collect_social.py`, `collect_disinfo.py`, `warm_kv_cache.py`, `sources_registry.py`. `daily_analysis.py`, `stage1_fetch.py`, `stage2_analysis.py`, `stage3_db_write.py`, `stage4_reports.py`, `detect_scenarios.py`, `collect_social_analysis.py`, `collect_strategic.py`, `collect_disinfo_escha.py` belong to the retired pipeline — reference only (stage 1-3 were stubs)
- `collaboration/` — analysis/strategy notes (METHODOLOGY, STRATEGY, SCENARIOS, SOURCES, IDEAS, DEBATES, DECISIONS, CLAUDE_INSTRUCTIONS, PLATFORM_BUILD). Holds DECISION-001/002. Not code; do not edit unless Omar asks
- `docs/` — setup/ops docs (supabase-auth-setup.md, email-setup.md, stripe-setup.md, cloudflare-security.md, integration-tests.md, go-live.md …) + `docs/8_supabase_cron_cleanup.sql` (**DO NOT RUN** — see Gotchas)

## Supabase Schema (do not recreate existing tables)
Source of truth = `supabase/migrations/` + live DB. `nai_scores`, `country_reports`, `scenario_probabilities`, `articles`, `market_data`, `disinfo_claims`, `daily_briefings` have NO `CREATE TABLE` in migrations (created live) → anything marked "verify live" has not been proven from the repo.

**Core intelligence tables (EXISTING — never recreate):**
- `nai_scores`: country_code, conflict_day, expressed_score, latent_score, gap_size, category (`types/supabase.ts` also lists `id`)
  - **FROZEN at Day 35** — see Hard Bans. Do not write.
  - No velocity / notes column in `types/supabase.ts` (verify live)
  - Valid categories ONLY: ALIGNED | STABLE | TENSION | FRACTURE | INVERSION
  - Unique (country_code, conflict_day) — verify live
- `country_reports`: country_code, country_name (NOT NULL), nai_score, nai_category, content_json, conflict_day, updated_at
  - Unique on country_code ALONE (one snapshot per country, not a time series) → PATCH by country_code=eq.{cc} — verify live
- `daily_briefings`: **where reports live** (read by `app/page.tsx`, `app/briefings/page.tsx`, `app/briefings/[day]/[type]/page.tsx`). Columns used in code: conflict_day, report_type (general, country, …), country_code (country type), title, lead, sections, cover_stats, source_ids, source, quality, generated_at. Full column list + constraints: verify live
- `detected_scenarios`: candidate scenarios needing admin approval (migration 006) — conflict_day, label, title, description_en/_ar, new_actor, new_instrument, trigger_sources, source_count, initial_probability, acting/affected_party_framing, status (candidate|approved|rejected|superseded), detected_by, …; UNIQUE (conflict_day, label). Never auto-approve
- `scenario_probabilities`: conflict_day, scenario_a..scenario_e, updated_at
  - ONE ROW PER DAY. Not one row per scenario code. Frozen at Day 35 like nai_scores (live) — AI agent never writes it
- `disinfo_claims` (NOT disinformation_tracker — that table does NOT exist): claim_text, verdict, source_url, debunk_url, spread_estimate, published_at, created_at
  - verdict values: FALSE | MISLEADING | TRUE | UNVERIFIED
- `articles`: id, title, summary, url, source_name, source_type, published_at, fetched_at, conflict_day, region, country, lat, lng, sentiment, confidence_score, tags, content_json
  - `country` holds a REGION label, not an ISO country code
- `market_data`: indicator, value, change_pct, unit, source, conflict_day, created_at (+ id)
- `social_trends`, `disputes`, `subscribers`, `contact_inquiries`

**Platform tables (in `supabase/migrations/` — DO NOT recreate):**
- users, subscriptions, payments, api_keys, admin_users, admin_audit_log
- platform_config, tier_features, platform_alerts, article_sources, pipeline_runs
- digest_sends, user_events, user_notes
- `article_sources` row count (previously documented as 26): verify live

## Hard Bans for the AI Agent (the Claude daily-build task and any automation)
- NEVER write `scenario_probabilities` or any disinformation tracker (`disinfo_claims` belongs to the `collect-disinfo.yml` collector only) — structural neutrality
- NEVER write `nai_scores`: FROZEN at Day 35 pending an operator ruling on what "expressed" and "latent" mean. A decision memo recommends a NEW `nai_scores_v2` table rather than relabelling old rows. No writes, no backfills, no relabelling until Omar rules
- NEVER write `country_reports.country_name` from automation. A retired writer (`daily_analysis.py`) overwrote all 20 names with ISO codes; corrected 2026-10-06. Automation PATCHes by country_code and omits country_name from the payload
- No paid model API calls from automation (see Operating Model)

## Critical Rules — NEVER Violate
1. **DAY LOCK:** `DAY = (datetime.date.today() - datetime.date(2026, 2, 28)).days + 1` (UTC; 2026-10-05 = Day 220, 2026-10-06 = Day 221). NEVER derive the current day from DB max/max+1. This rule WON over the old PROJECT.md "max(nai_scores)" rule. Each section reads its OWN table's latest day and shows a `DataAsOf` label (see PROJECT.md §3)
2. **No fabrication:** Real sources only, never invented or seeded data. Every `content_json` field must cite a real DB article. If none: "No sourced data for Day X."
3. **Validate before write:** schema violations must `sys.exit(1)` before any DB write — and before any paid call whose output the validation could discard
4. **No global Supabase clients** — Cloudflare Workers throws "Cannot perform I/O on behalf of a different request"; create new client per request
5. **CVE-2025-29927:** Every admin Server Component must independently verify auth (4-line block: getUser → redirect if not found → check admin_users → redirect if not active)
6. **docx rules:** NEVER ShadingType.SOLID (use CLEAR). NEVER PageNumber constructor. NEVER • in Paragraph indent (use '* '). sentBar() MUST return [labelParagraph, tableElement] array.
7. **country_name is NOT NULL** — any NEW country_reports row needs a real display name supplied by a human; automation never writes it (Hard Bans)
8. **scenario_probabilities:** ONE ROW per conflict_day. A+B+C+D must sum to 100. E is independent sub-branch. Human-authorised writes only
9. **docx only** for reports — never PDF/ReportLab
10. **country_reports upsert:** PATCH by country_code=eq.{cc} — INSERT with Prefer:resolution=merge-duplicates silently fails
11. **No metered AI API in automation.** The old "claude-sonnet-4-6 adaptive thinking pipeline" rule is void: the pipeline workflows are retired and agent analysis runs as the Claude scheduled task

## Gotchas (learned the hard way — each one cost real data or money)
- **PostgREST bulk insert:** a mixed-key array fails with PGRST102 "All object keys must match". Group rows by key signature and insert each group; NEVER pad missing keys with null (null overrides column defaults)
- **Silent collectors:** a collector that prints an error and exits 0 hides failure for months (articles sat at 0). Exit non-zero whenever it collected rows but wrote none
- **feedparser:** `feedparser.parse(url)` has no network timeout. Fetch with `requests.get(url, timeout=…)` and parse the bytes
- **market_data writers must never share an indicator name.** Collector owns Brent, WTI, Gold, NatGas, S&P, Dow, XLE, USO, VIX, EUR-USD, USD-SAR, USD-AED, USD-IQD. Claude task owns USD/EGP, open-market USD/IRR, Hormuz/Bab al-Mandeb traffic. A nightly pg_cron dedup keeps one row per indicator + conflict_day; it previously kept a RANDOM row (compared UUIDs) and is being fixed to keep the newest by `created_at` for closed days — until that lands, do not rely on which duplicate survives
- **Paid before validated:** a paid model call must never precede validation that can discard its output. The idempotency check ("is today already done?") comes BEFORE any paid call. (This is how ~$100 vanished.)
- **PostgREST 1000-row cap:** the Supabase default caps responses at 1000 rows. "All rows ascending" queries silently drop the NEWEST data. Order descending, filter by day, or paginate
- **`articles.country` is a region label**, not a country code — never join it to country_code
- **Timestamps → UTC first:** convert feed timestamps to UTC before computing `conflict_day`. Non-UTC outlets were stamped a day ahead
- **RLS policy names prove nothing:** policies named `service_role_*` granted ALL to PUBLIC on `user_events` / `user_notes`. Check the `roles` column in `pg_policies`, never the name
- **Never run `docs/8_supabase_cron_cleanup.sql`.** Its `cleanup-old-articles` job deleted 24,757 articles between June and September 2026 while collection was off; free tier has no backups, so the Mar–Aug article history is unrecoverable. Retention policy: never delete rows — when the DB passes ~350 MB, strip `summary`/`tags` on OLD rows only

## Structural Neutrality Rules (Architectural — Non-Negotiable)
- Always include Iranian official framing alongside US/Western sources (DECISION-001)
- Civilian harm in Iran mandatory in every General Intelligence Brief
- sentBar Egypt: "Anti-US-Intervention | Neutral | Pro-US" — NOT "Pro-Iran | Neutral | Anti-Iran"
- All party codenames presented: Epic Fury (US) / Roaring Lion (Israel) / True Promise IV (Iran/IRGC/Hezbollah)
- CENTCOM/IRGC/IDF = party sources → require independent corroboration before marking DEBUNKED
- Casualties ordered by count, highest first; Iran listed first
- Table `disinfo_claims` (not `disinformation_tracker`)

## Source Hierarchy (DECISION-002, March 15, 2026)
- Tier 1: AFP, Reuters, AP, PolitiFact, NetBlocks, HRW (independent)
- Tier 2 conditional: FT (economic/energy), AJE (Qatar/Egypt/UAE conflict of interest), The National, Arab News
- Tier 3: Al-Ahram, IRNA, Fars News, Al Mayadeen, PressTV (party/state — mark as such)
- MANDATORY: Every report needs ≥1 Arabic + ≥1 regional + ≥1 non-Western source before publish

## Security Rules (enforce in all code)
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` — NEVER NEXT_PUBLIC_ prefix, NEVER client-side
- `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `API_KEY_SECRET` — same
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the anon key) are safe for browser
- Immutable audit log: admin_audit_log has NO UPDATE, NO DELETE policy — writeAuditLog() before every admin action
- AI Agent bans: see "Hard Bans for the AI Agent"

## Secrets Location
- Local: `.env.local` (NEVER commit — in .gitignore)
- GitHub Actions secrets that active workflows reference (grep of `.github/workflows/*.yml`, 2026-10-06): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CF_KV_NAMESPACE_ID`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `YOUTUBE_API_KEY` (deploy, optional); `prod-e2e.yml` (manual) also reads `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` and `PERPLEXITY_API_KEY` are NOT needed by automation — no active workflow references either (grep-verified); only `.github/workflows-retired/*.yml` do. `RESEND_API_KEY` / `ADMIN_EMAIL` likewise appear only in the retired `daily_pipeline.yml`
- **Recommendation to the operator (NOT done — Claude cannot delete secrets):** delete the `ANTHROPIC_API_KEY` and `PERPLEXITY_API_KEY` repo secrets, and revoke the Anthropic API key in the Anthropic console. Caveat: the `admin-agent` Edge Function reads its own `ANTHROPIC_API_KEY` Supabase function secret (admin chat only; returns 503 "AI not configured" without it) — revoking the key disables that feature unless it is repointed or removed. `/briefings/generate` uses the visitor's own key, not ours
- wrangler.jsonc: `services` binding `WORKER_SELF_REFERENCE` → `"service": "mena-intel-desk"` (NOT a vars string, NOT a pages.dev URL)

## Current Status (2026-10-06)
- **Platform recovered and live at Day 220–221** (PR #4 merged 2026-10-05; deploys working again after being broken since April). Home, Briefings, Markets show "AS OF DAY 220 · CURRENT"
- **NAI / Scenarios / Countries show Day 35** — frozen, honestly labelled by `DataAsOf`. Unfreezing waits on the NAI ruling
- **0 subscribers** (users: 2 at last count — verify live)
- **NAI ruling pending** (Open Operator Rulings)
- **articles history Mar–Aug is lost** — the 90-day cleanup job deleted 24,757 rows Jun–Sep 2026 while collection was off; no backups on the free tier. Collection is running again; do not describe the pre-recovery history as complete
- Stack: Next.js 15.2.9 (DO NOT upgrade to 16 — opennextjs-cloudflare prefetch-hints bug); wrangler pinned to 3.99.0 via overrides in package.json
- Current conflict day: calculated fresh each time — do NOT hardcode

## Open Operator Rulings (Claude does not decide these)
- **NAI semantics:** what do `expressed` / `latent` mean (aligned with what? what evidence measures latent? exhaustive non-overlapping category rules computed in code?). Memo recommends `nai_scores_v2` over relabelling. Until ruled, `nai_scores` stays frozen

## DO NOT Touch (unless Omar explicitly asks)
- `/collaboration/` folder — notes, not code
- `wrangler.jsonc` WORKER_SELF_REFERENCE binding
- Completed admin pages without explicit instruction
- Edge Functions in `supabase/functions/` unless the task requires it
- Existing files in `supabase/migrations/` — treat as applied in production; add new files, never edit old ones
- `.github/workflows-retired/` — stays retired
