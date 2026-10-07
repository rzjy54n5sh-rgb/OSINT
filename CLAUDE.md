# MENA Intel Desk — Claude Standing Brief
# Omar Seif | Egypt + UAE | github.com/rzjy54n5sh-rgb/OSINT
# UPDATE THIS FILE whenever Claude does something wrong — it compounds over time.
# Operating model in force since 2026-10-05 (see "Operating Model"). Last reviewed: 2026-10-06.

## Project Identity
- **Platform:** MENA Intel Desk — live OSINT geopolitical intelligence tracker
- **Conflict:** US-Iran War 2026 (Operation Epic Fury / True Promise IV / Roaring Lion)
- **Second theatre (ruling 2026-10-07, Omar): Horn of Africa & Red Sea** — Ethiopia's 2026 offensive (from 2026-09-23) vs the TPLF/Fano/OLA alliance, the Ethiopia–Eritrea rupture (embassies shut, Abiy demanding Red Sea access/Assab) and the Egypt–Eritrea–Somalia–Sudan "Red Sea for coastal states" declaration (New Alamein, 2026-10-04). **25 tracked countries** = the original 20 + ET Ethiopia, ER Eritrea, SD Sudan, SO Somalia, DJ Djibouti. Daily brief `report_type = 'horn'` ("Horn of Africa & Red Sea", ordered after general/general_weekly, before egypt); topic `horn-of-africa`; `articles.region` label `'Horn of Africa'`. Same rules as everywhere: real sources only, party/state sources (Fana, SONNA) flagged `party_source` + Tier 3, structural neutrality (no belligerent is the NAI reference)
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
- **Frontend:** Next.js 15.5.27 + React 19.2.4 + TypeScript + Tailwind CSS
- **Hosting:** Cloudflare Workers via @opennextjs/cloudflare 1.17.1 + wrangler 4.76.0 (pinned via overrides). Public pages are ISR (`export const revalidate`) and served from **Workers Cache** (`wrangler.jsonc` → `cache.enabled`); they must never read cookies — use `createPublicClient()` and resolve anything per-visitor after hydration via `/api/viewer/*` (see PR perf/caching-next155)
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
- `.github/workflows/scripts/` — collectors in use (not exhaustive; the Horn theatre's feeds are the `HORN_OF_AFRICA` group in `sources_registry.py`, `python collect_feeds.py --group horn --dry-run` prints per-feed counts and sample titles and writes nothing): `collect_feeds.py`, `collect_markets.py`, `collect_social.py`, `collect_disinfo.py`, `warm_kv_cache.py`, `sources_registry.py`. `daily_analysis.py`, `stage1_fetch.py`, `stage2_analysis.py`, `stage3_db_write.py`, `stage4_reports.py`, `detect_scenarios.py`, `collect_social_analysis.py`, `collect_strategic.py`, `collect_disinfo_escha.py` belong to the retired pipeline — reference only (stage 1-3 were stubs)
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
- `daily_briefings`: **where reports live** (read by `app/page.tsx`, `app/briefings/page.tsx`, `app/briefings/[day]/[type]/page.tsx`). Columns used in code: conflict_day, report_type (general, general_weekly, eschatology, business, per-country types, …; registered in `report_types`), country_code, title, lead, sections, cover_stats, source_ids, source, quality, generated_at. Full column list + constraints: verify live
- `detected_scenarios`: candidate scenarios needing admin approval (migration 006) — conflict_day, label, title, description_en/_ar, new_actor, new_instrument, trigger_sources, source_count, initial_probability, acting/affected_party_framing, status (candidate|approved|rejected|superseded), detected_by, …; UNIQUE (conflict_day, label). Never auto-approve
- `scenario_probabilities`: conflict_day, scenario_a..scenario_e, updated_at
  - ONE ROW PER DAY. Not one row per scenario code. Frozen at Day 35 in the legacy table (live). Under the 2026-10-06 dynamic-model ruling it is DERIVED from the scenario registry and never written directly — see "Rulings 2026-10-06"
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
- NEVER write `scenario_probabilities` directly: it is derived from the scenario registry (see "Rulings 2026-10-06"). Never write any disinformation tracker either (`disinfo_claims` belongs to the `collect-disinfo.yml` collector only) — structural neutrality
- NEVER write legacy `nai_scores` (Days 1–35): ARCHIVED, read-only, on a different (US-referenced) axis — never relabel, copy or extend it
- `nai_scores_v2` (War Posture, ruled 2026-10-06) MAY be written, but only rows that pass the No-Invented-Claim gate below; the DB rejects any score without a source feeding it (CHECK constraints). Latent is a BAND, NULL when there is no admissible evidence — never a guessed point
- NEVER write `country_reports.country_name` from automation. A retired writer (`daily_analysis.py`) overwrote all 20 names with ISO codes; corrected 2026-10-06. Automation PATCHes by country_code and omits country_name from the payload
- No paid model API calls from automation (see Operating Model)

## Critical Rules — NEVER Violate
1. **DAY LOCK:** `DAY = (datetime.date.today() - datetime.date(2026, 2, 28)).days + 1` (UTC; 2026-10-05 = Day 220, 2026-10-06 = Day 221). NEVER derive the current day from DB max/max+1. This rule WON over the old PROJECT.md "max(nai_scores)" rule. Each section reads its OWN table's latest day and shows a `DataAsOf` label (see PROJECT.md §3)
2. **No invented claim — operator order, 2026-10-06: "dont accept any invented claim".** Every number, date, quote and attribution must trace to a page that was actually opened and states it. Before publishing: open every cited URL and confirm the claim is on the page; check quotes verbatim against the raw page text (a summariser alone is not a safe gate — it misread poll figures on 2026-10-06); fix `published_at` to the page. Anything that cannot be confirmed is REMOVED, or replaced with exactly "No sourced data available for Day N." A score left with no supporting source becomes NULL. Never raise confidence after removing evidence
3. **Validate before write:** schema violations must `sys.exit(1)` before any DB write — and before any paid call whose output the validation could discard
4. **No global Supabase clients** — Cloudflare Workers throws "Cannot perform I/O on behalf of a different request"; create new client per request
5. **CVE-2025-29927:** Every admin Server Component must independently verify auth (4-line block: getUser → redirect if not found → check admin_users → redirect if not active)
6. **docx rules:** NEVER ShadingType.SOLID (use CLEAR). NEVER PageNumber constructor. NEVER • in Paragraph indent (use '* '). sentBar() MUST return [labelParagraph, tableElement] array.
7. **country_name is NOT NULL** — any NEW country_reports row needs a real display name supplied by a human; automation never writes it (Hard Bans)
8. **scenario_probabilities:** ONE ROW per conflict_day. A+B+C+D must sum to 100. E is independent sub-branch. Derived from the registry, never written directly; probabilities are produced only via `market-anchored-v1` (see "Rulings 2026-10-06")
9. **docx only** for reports — never PDF/ReportLab
10. **country_reports upsert:** PATCH by country_code=eq.{cc} — INSERT with Prefer:resolution=merge-duplicates silently fails
11. **No metered AI API in automation.** The old "claude-sonnet-4-6 adaptive thinking pipeline" rule is void: the pipeline workflows are retired and agent analysis runs as the Claude scheduled task

## Gotchas (learned the hard way — each one cost real data or money)
- **PostgREST bulk insert:** a mixed-key array fails with PGRST102 "All object keys must match". Group rows by key signature and insert each group; NEVER pad missing keys with null (null overrides column defaults)
- **Silent collectors:** a collector that prints an error and exits 0 hides failure for months (articles sat at 0). Exit non-zero whenever it collected rows but wrote none
- **feedparser:** `feedparser.parse(url)` has no network timeout. Fetch with `requests.get(url, timeout=…)` and parse the bytes (the Horn feeds are marked `"fetch": "requests"` and do exactly that)
- **Horn feeds — verified 2026-10-07 from the build container, do not re-add blindly:** Addis Standard, Borkena, Sudan Tribune (English) and The East African answer 403 (Cloudflare challenge); Shabait and The Reporter Ethiopia answer a SiteGround captcha (HTTP 202); ENA, Garowe Online have no working RSS URL; eritreahub.org redirects to a spam domain. Per-feed User-Agent matters: Dabanga and Horn Observer reject python-requests (403/406), ReliefWeb rejects feedparser (403) — all work with a browser UA. Ambiguous Horn words (afar, fano, isaias, rsf, burhan, somali, عصب, البرهان) are in `HORN_AMBIGUOUS_KEYWORDS`, not `CONFLICT_KEYWORDS`: they count only inside a Horn feed (collect_feeds) or next to a Horn location (backfill). 'South Sudan' is stripped before matching; GDELT's FIPS code for Sudan is `SU`, not `SD`
- **market_data writers must never share an indicator name.** Collector owns Brent, WTI, Gold, NatGas, S&P, Dow, XLE, USO, VIX, EUR-USD, USD-SAR, USD-AED, USD-IQD. Claude task owns USD/EGP, open-market USD/IRR, Hormuz/Bab al-Mandeb traffic. A nightly pg_cron dedup (`deduplicate-market-data`, 02:30 UTC) keeps one row per indicator + conflict_day — FIXED 2026-10-06 to keep the newest by `created_at`, closed days only (it previously kept a RANDOM row by comparing UUIDs, so pre-Oct-6 market history is random intraday snapshots, not closes)
- **Paid before validated:** a paid model call must never precede validation that can discard its output. The idempotency check ("is today already done?") comes BEFORE any paid call. (This is how ~$100 vanished.)
- **PostgREST 1000-row cap:** the Supabase default caps responses at 1000 rows. "All rows ascending" queries silently drop the NEWEST data. Order descending, filter by day, or paginate
- **`articles.country` is a region label**, not a country code — never join it to country_code
- **Timestamps → UTC first:** convert feed timestamps to UTC before computing `conflict_day`. Non-UTC outlets were stamped a day ahead
- **RLS policy names prove nothing:** policies named `service_role_*` granted ALL to PUBLIC on `user_events` / `user_notes`. Check the `roles` column in `pg_policies`, never the name
- **Party sources are never evidence of public opinion.** State media, official agencies and state-owned pollsters (e.g. VCIOM) are valid for what a government SAYS (expressed), never for a population's position (latent) or for facts
- **Al Jazeera labelling:** party_source = true only where it reports on Qatar, Egypt or the UAE (DECISION-002 conflict of interest); otherwise Tier 2, not party. The National, WAM, SPA, TASS, Xinhua, IRNA, Tasnim, PressTV, Al-Ahram = party/state
- **Supabase MCP destructive-statement confirmation may never reach the operator** (cancelled 3× on 2026-10-06). Do not loop on it. Ask the operator; with his explicit approval, apply through the Mac's direct DB connection (`~/mid_backfill/conn.py`, credentials read at runtime, never printed), in ONE transaction with per-statement row-count checks and a read-back
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
- **`ANTHROPIC_API_KEY` repo secret DELETED 2026-10-06** (operator order; verified by before/after `gh secret list`). `PERPLEXITY_API_KEY` was never a repo secret (404). Still open: revoke the key itself in the Anthropic console. Caveat: the `admin-agent` Edge Function reads its own `ANTHROPIC_API_KEY` Supabase function secret (admin chat only; returns 503 "AI not configured" without it) — revoking the key disables that feature unless it is repointed or removed. The `/api/generate-briefing` route (visitor-supplied key) was retired 2026-10-06; `/briefings/generate` is now a static notice
- wrangler.jsonc: `services` binding `WORKER_SELF_REFERENCE` → `"service": "mena-intel-desk"` (NOT a vars string, NOT a pages.dev URL)

## Current Status (2026-10-06)
- **Platform recovered and live at Day 220–221** (PR #4 merged 2026-10-05; deploys working again after being broken since April). Home, Briefings, Markets show "AS OF DAY 220 · CURRENT"
- **NAI moved to War Posture (`nai_scores_v2`) — series starts Day 221.** 20 rows written 2026-10-06 after source-by-source verification (81 sources: 78 supported, 3 narrowed, 0 invented). 19 of 20 categories are UNSCORABLE (latent bands missing or too wide) — the sourced expressed score is the signal; the UI shows it with the grey category. Scenarios stay at Day 35 until the registry-derived model (market-anchored-v1) is live
- **Security hardened 2026-10-06:** public ALL on user_events/user_notes closed; users can update only 5 profile columns; unapproved scenarios / inactive alerts no longer public; anon-insert tables length-bounded; SECURITY DEFINER functions locked down
- **0 subscribers** (users: 2 at last count — verify live)
- **articles history Mar–Aug is lost** — the 90-day cleanup job deleted 24,757 rows Jun–Sep 2026 while collection was off; no backups on the free tier. Collection is running again; do not describe the pre-recovery history as complete
- Stack: Next.js 15.5.27 (DO NOT upgrade to 16 — opennextjs-cloudflare prefetch-hints bug); wrangler pinned to 4.76.0 via overrides in package.json
- Current conflict day: calculated fresh each time — do NOT hardcode

## Rulings 2026-10-06 (dynamic model — operator rulings, do not re-open)
- **Scenario probabilities only via `market-anchored-v1`:** markets → method → sourced inputs, with the inputs stored with each run. No hand-set or model-guessed probabilities. `scenario_probabilities` is derived from the registry and never written directly.
- **Retirement:** a scenario retires after 14 consecutive days below 10% on the PUBLISHED whole-number probability (not `probability_raw`). A missing day breaks the streak. Only the operator retires a core (A–D) scenario. E stays "unmeasured" while it has no market.
- **Ceasefire-breaking strike:** counts as Escalation (D).
- **Backfill depth:** daily General brief + weekly country, eschatology and business briefs. Weekly retrospective digests live under `report_type = 'general_weekly'` (stored on the period's last day; `period_start_day`/`period_end_day` carry the span), never under `general`.
- **Daily task upsert:** the Claude daily task upserts `daily_briefings` on `(conflict_day, report_type)`.
- **Provenance:** anything written after 06:00 UTC the next day is "reconstructed", not live.
- **`/api/generate-briefing` retired:** it wrote unsourced model output via a paid API (breaks No-Invented-Claim and the no-metered-AI rule). Briefings come only from the Claude daily build.

## Open Operator Rulings (Claude does not decide these)
- **RESOLVED 2026-10-06 — NAI = War Posture (C2).** E (0–100) = the government's official position on continuing hostilities: 0 immediate unconditional ceasefire · 25 conditional de-escalation · 50 ambivalent · 75 continued pressure · 100 continue/escalate. Same question for every state; no belligerent is the reference (DECISION-001). L = same scale for population + non-government elites, as a band from admissible evidence only (polls, ACLED/protest reporting, opposition votes, independent elite op-eds). Category = DB function `nai_c2_category(E, lo, hi)` (thresholds 10/20/30, midpoint 50 — conventions, not data); UNSCORABLE unless the whole band yields one category. Memo: project doc `claude/nai-decision-memo-2026-10-06.md`
- **Open:** whether to add a deterministic E-only posture label so the map is not 19/20 grey; F4 cleanup of 177 keyword-bot disinfo verdicts + 559 invented reach figures (disinfo table is outside the AI agent's write scope)

## DO NOT Touch (unless Omar explicitly asks)
- `/collaboration/` folder — notes, not code
- `wrangler.jsonc` WORKER_SELF_REFERENCE binding
- Completed admin pages without explicit instruction
- Edge Functions in `supabase/functions/` unless the task requires it
- Existing files in `supabase/migrations/` — treat as applied in production; add new files, never edit old ones
- `.github/workflows-retired/` — stays retired
