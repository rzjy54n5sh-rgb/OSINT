# MENA Intel Desk — Claude Code Standing Brief
# Omar Seif | Egypt + UAE | github.com/rzjy54n5sh-rgb/OSINT
# UPDATE THIS FILE whenever Claude does something wrong — it compounds over time.

## Project Identity
- **Platform:** MENA Intel Desk — live OSINT geopolitical intelligence tracker
- **Conflict:** US-Iran War 2026 (Operation Epic Fury / True Promise IV / Roaring Lion)
- **Operator:** Omar Seif — sole operator, companies in Egypt and UAE
- **Repo:** github.com/rzjy54n5sh-rgb/OSINT
- **Live URL:** mena-intel-desk.mores-cohorts9x.workers.dev
- **Supabase project:** qmaszkkyukgiludcakjg

## Stack
- **Frontend:** Next.js 15.2.9 + React 19.2.4 + TypeScript + Tailwind CSS
- **Hosting:** Cloudflare Workers via @opennextjs/cloudflare 1.17.1 + wrangler 3.99.0
- **DB:** Supabase PostgreSQL (PostgREST via direct HTTP)
- **Payments:** Stripe | **Email:** Resend | **Analytics:** Plausible
- **AI pipeline:** claude-sonnet-4-6 with adaptive thinking + output_config.format structured outputs
- **Pipeline:** GitHub Actions daily_pipeline.yml (cron 06:00 UTC) — 5 stages
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
- `app/(public)/` — All public-facing pages (NAI, scenarios, disinfo, countries, markets, timeline, sources, api-docs)
- `app/(admin)/` — Admin panel (16 pages, 5 RBAC roles)
- `supabase/functions/` — 16 Edge Functions (10 public, 6 admin)
- `lib/api/` — Public API layer (nai.ts, scenarios.ts, country.ts, disinfo.ts, dispute.ts)
- `lib/api/admin/` — Admin API layer (pipeline.ts, users.ts, config.ts, sources.ts, audit.ts, agent.ts)
- `utils/supabase/` — 4 files ONLY: client.ts, server.ts, admin.ts, middleware.ts
- `lib/email/` — Resend templates (welcome, payment-confirmation, subscription-past-due, pipeline-alert)
- `.github/workflows/` — 5 workflows: feeds.yml, markets.yml, disinfo.yml, social_trends.yml, daily_pipeline.yml
- `collaboration/` — Partner analysis only (PROJECT.md, METHODOLOGY.md, STRATEGY.md, SCENARIOS.md, SOURCES.md, IDEAS.md, DEBATES.md, DECISIONS.md, CLAUDE_INSTRUCTIONS.md)
- `docs/` — All docs: supabase-auth-setup.md, email-setup.md, stripe-setup.md, cloudflare-security.md, integration-tests.md, go-live.md

## Supabase Schema (verified — do not recreate existing tables)
**Core intelligence tables (EXISTING — never recreate):**
- `nai_scores`: country_code, conflict_day, expressed_score, latent_score, gap_size, category, updated_at
  - NO velocity column. NO notes column.
  - Valid categories ONLY: ALIGNED | STABLE | TENSION | FRACTURE | INVERSION
  - Unique constraint: (country_code, conflict_day)
- `country_reports`: country_code, country_name (REQUIRED NOT NULL), nai_score, nai_category, content_json, conflict_day, updated_at
  - Unique constraint on country_code ALONE → PATCH by country_code=eq.{cc}
- `scenario_probabilities`: conflict_day, scenario_a, scenario_b, scenario_c, scenario_d, scenario_e, updated_at
  - ONE ROW PER DAY. Not one row per scenario code.
- `disinfo_claims` (NOT disinformation_tracker — that table does NOT exist): claim_text, verdict, source_url, spread_estimate, published_at, created_at
  - verdict values: FALSE | MISLEADING | TRUE | UNVERIFIED
- `articles`: id, title, summary, url, source_name, conflict_day, region, country, sentiment, tags, content_json
- `market_data`, `social_trends`, `disputes`, `subscribers`, `contact_inquiries`

**Platform tables (added in 14-phase build — DO NOT recreate):**
- users, subscriptions, payments, api_keys, admin_users, admin_audit_log
- platform_config, tier_features, detected_scenarios, platform_alerts
- article_sources (26 rows), pipeline_runs

## Critical Rules — NEVER Violate
1. **DAY LOCK:** `DAY = (datetime.date.today() - datetime.date(2026, 2, 28)).days + 1` — NEVER use DB max+1
2. **No fabrication:** Every content_json field must cite a real DB article. If none: "No sourced data for Day X."
3. **Post-write validation:** Schema violations must trigger sys.exit(1) before any DB write
4. **No global Supabase clients** — Cloudflare Workers throws "Cannot perform I/O on behalf of a different request"; create new client per request
5. **CVE-2025-29927:** Every admin Server Component must independently verify auth (4-line block: getUser → redirect if not found → check admin_users → redirect if not active)
6. **docx rules:** NEVER ShadingType.SOLID (use CLEAR). NEVER PageNumber constructor. NEVER \u2022 in Paragraph indent (use '* '). sentBar() MUST return [labelParagraph, tableElement] array.
7. **country_name REQUIRED** in every country_reports row — never omit
8. **scenario_probabilities:** ONE ROW per conflict_day. A+B+C+D must sum to 100. E is independent sub-branch.
9. **docx only** for reports — never PDF/ReportLab
10. **country_reports upsert:** PATCH by country_code=eq.{cc} — INSERT with Prefer:resolution=merge-duplicates silently fails
11. **Pipeline model:** claude-sonnet-4-6 with thinking:{type:"adaptive"} and output_config.format (NOT deprecated output_format)

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
- `SUPABASE_SERVICE_ROLE_KEY` — NEVER NEXT_PUBLIC_ prefix, NEVER client-side
- `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `API_KEY_SECRET` — same
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` safe for browser
- Immutable audit log: admin_audit_log has NO UPDATE, NO DELETE policy — writeAuditLog() before every admin action
- AI Agent: NEVER touches scenario_probabilities or disinformation tracker (structural neutrality)

## Secrets Location
- Local: `.env.local` (NEVER commit — in .gitignore)
- GitHub Actions: 6 secrets (SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY, PERPLEXITY_API_KEY, RESEND_API_KEY, ADMIN_EMAIL)
- wrangler.jsonc: `services` binding `WORKER_SELF_REFERENCE` → `"service": "mena-intel-desk"` (NOT a vars string, NOT a pages.dev URL)

## Current Status (March 2026)
- Platform build: ALL 14 phases complete — production ready (March 18, 2026)
- Next step: 10 hard gates → soft launch (see docs/go-live.md)
- Current conflict day: calculated fresh each time — do NOT hardcode
- Stack: Next.js 15.2.9 (DO NOT upgrade to 16 — opennextjs-cloudflare prefetch-hints bug)
- wrangler: pinned to 3.99.0 via overrides in package.json

## DO NOT Touch (Completed — Stable)
- `/collaboration/` folder — partner analysis only, no code access
- `wrangler.jsonc` WORKER_SELF_REFERENCE binding
- Any completed admin pages without explicit instruction
- All 16 Edge Functions in supabase/functions/ unless specifically asked
- All 8 DB migrations — already ran in production
