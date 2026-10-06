# MENA Intel Desk — Project Reference & Setup

**Purpose:** Single source of truth for this project. Share with Claude (or any developer) for further development. Describes the full stack, structure, data flow, setup steps, and how everything connects.

### Git / branch policy

- **Claude owns the repo** (since 2026-10-05; Cursor is no longer used). Changes land on a branch and reach `main` through a pull request that **Omar merges** (as with PR #4). Do not push to `main` directly or merge your own PR unless Omar says so.
- Do not push to other remotes unless Omar asks.

### Operating model (effective 2026-10-05)

Authoritative detail lives in **`CLAUDE.md`** ("Operating Model", "Hard Bans", "Gotchas") — not duplicated here.

- Claude owns repo, workflows, deploy, schema and content. No Cursor.
- No metered AI API in automation. Agent-based analysis = the Claude scheduled task "MENA Intel Desk — daily build" (06:51 Cairo, subscription). The five Anthropic-API workflows are retired to `.github/workflows-retired/` (its `README.md` has the run history: ~$100 burned, 247 of ~320 runs failed).
- GitHub Actions (free, public repo): Collect Feeds (hourly), Collect Market Data (30 min), Collect Social Trends (12 h), Collect Disinfo Claims (daily), Deploy (push to `main`). Production E2E and Run DB Migration are manual-only / disabled.

---

## 1. Stack & Tooling

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS + CSS variables in `app/globals.css` |
| **Database / Backend** | Supabase (PostgreSQL + REST API; browser client only, no server-side Supabase) |
| **Maps** | MapLibre GL JS |
| **Charts** | Recharts |
| **Animation** | Framer Motion |
| **3D / Background** | Three.js (optional, in `BackgroundCanvas`) |
| **Deploy** | Cloudflare (OpenNext adapter + Wrangler); GitHub Actions for deploy and data pipelines |
| **Data pipelines** | Python 3.11 (feedparser, requests, pytrends, etc.) in `.github/workflows/scripts/` |

### Key config files

- **`package.json`** — Scripts: `dev`, `build`, `start`, `lint`, `type-check`, `build:cf`, `deploy`.
- **`next.config.js`** — `images.remotePatterns` for Flickr, YouTube, Google static.
- **`tailwind.config.ts`** — Content: `app/**`, `components/**`; theme extends CSS vars (e.g. `--bg-primary`, `--accent-gold`).
- **`tsconfig.json`** — Path alias `@/*` → `./*`.
- **`open-next.config.ts`** — `defineCloudflareConfig()` for Cloudflare deployment.
- **`wrangler.toml`** — `run_worker_first = true` so the OpenNext worker serves `/_next/static/*` assets (avoids 404s on JS/CSS chunks in production).

---

## 2. Environment Variables

**Canonical list for humans and AI:** also keep **`CURSOR.md`** (legacy filename; the env-name companion to this file) in sync when names change. Do not invent parallel names (especially no extra `window.*` globals).

### Public / browser (Next.js + Cloudflare Worker)

| Variable | Where used | Purpose |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/resolve-public-env.ts`, `@/lib/supabase/client`, hooks/pages | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same | Default public anon key |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same | Optional; if set (and anon empty), used as the public key |
| `NEXT_PUBLIC_SITE_URL` | `app/layout.tsx` (metadata), redirects | Canonical origin |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `app/layout.tsx` (head script) | Optional analytics domain |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | Maps (if used) | Map tiles |

### Service role (server-only; never `NEXT_PUBLIC_*`)

| Variable | Where used | Purpose |
|----------|-------------|---------|
| **`SUPABASE_SERVICE_KEY`** | **Preferred** in GitHub Actions, `wrangler.toml`, `middleware.ts`, `utils/supabase/admin.ts`, `app/api/generate-briefing/route.ts` | Same JWT as Supabase Dashboard **service_role** |
| `SUPABASE_SERVICE_ROLE_KEY` | **Accepted alias** — same value; middleware/admin resolve **either** name via `lib/env/service-key.ts` | Supabase CLI / dashboard naming |

### Pipelines (Python on GitHub Actions)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | REST URL for scripts |
| `SUPABASE_SERVICE_KEY` | Service JWT for inserts/updates |

### Browser runtime bridge (not a separate secret)

On Cloudflare/OpenNext, `app/layout.tsx` may inject **`window.__NEXT_PUBLIC_RUNTIME__`** (constant `INJECTED_NEXT_PUBLIC_GLOBAL` in `lib/env/injected-next-public.ts`). The value is a plain object whose **keys are the real env strings**, e.g. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — not `{ url, key }`. Client resolution: `lib/supabase/resolve-public-env.ts`.

### Other

| Variable | Where used | Purpose |
|----------|-------------|---------|
| `YOUTUBE_API_KEY` | `app/api/youtube-live/route.ts` | Optional Live TV |
| **Secrets (GitHub Actions)** | Workflows | **Deploy:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_SERVICE_KEY` (for worker/API), optional `YOUTUBE_API_KEY`. **Collectors:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, plus `CLOUDFLARE_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CLOUDFLARE_API_TOKEN` for the KV warm step. |
| **`ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`** | **Not used by any active workflow** (grep of `.github/workflows/*.yml`, 2026-10-06; only `.github/workflows-retired/` references them) | **Recommendation to the operator (not done):** delete both repo secrets and revoke the Anthropic API key. Caveat: the `admin-agent` Edge Function reads its own `ANTHROPIC_API_KEY` Supabase function secret (admin chat; returns 503 without it), so revoking the key disables that feature. |

**Note:** `NEXT_PUBLIC_*` are available at build time and on the Worker as `process.env`. The browser bundle may still need the **`__NEXT_PUBLIC_RUNTIME__`** bridge when inlining is incomplete. Local dev: `.env.local`. If public Supabase vars are missing, the app can load with empty data; service routes need `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.

**Pipeline failure alerts:** the four collector workflows (`collect-articles.yml`, `collect-markets.yml`, `collect-social.yml`, `collect-disinfo.yml`) run a `Notify on failure` step that only emits a `::error::` annotation — **no GitHub Issue is created** and nothing is emailed (the earlier text here claimed a `pipeline-failure` issue; no workflow in the repo does that). A failure is visible only as a red run in the Actions tab, which is why collectors must exit non-zero on a silent no-write (see `CLAUDE.md` Gotchas).

---

## 3. Database (Supabase) — Tables & Types

TypeScript interfaces live in **`types/supabase.ts`**. Table names and shapes used in the app:

| Table | Purpose | Key columns (see types for full shape) |
|-------|---------|----------------------------------------|
| **articles** | OSINT news/feed items from RSS pipelines | `id`, `title`, `summary`, `url`, `source_name`, `source_type`, `published_at`, `fetched_at`, `conflict_day`, `region`, `country` (a REGION label, not a country code), `lat`, `lng`, `sentiment`, `confidence_score`, `tags`, `content_json` |
| **nai_scores** | Narrative Alignment Index per country per day. **FROZEN at Day 35** pending an operator ruling on expressed/latent (no automated writes) | `id`, `country_code`, `conflict_day`, `expressed_score`, `latent_score`, `gap_size`, `category` |
| **scenario_probabilities** | Scenario A–D probabilities per conflict day (+ independent sub-branch E); frozen at Day 35 like `nai_scores`; AI agent never writes it | `id`, `conflict_day`, `scenario_a`, `scenario_b`, `scenario_c`, `scenario_d`, `scenario_e`, `updated_at` |
| **daily_briefings** | **Where reports live** — general / country / other briefing types read by `app/page.tsx`, `app/briefings/page.tsx`, `app/briefings/[day]/[type]/page.tsx` | `conflict_day`, `report_type`, `country_code`, `title`, `lead`, `sections`, `cover_stats`, `source_ids`, `source`, `quality`, `generated_at` (as used in code; no migration defines it — full shape: verify live) |
| **detected_scenarios** | Candidate scenarios from detection; require admin approval (migration `006_scenario_detection.sql`) | `conflict_day`, `label`, `title`, `description_en`, `status` (candidate/approved/rejected/superseded), `detected_by`, … `UNIQUE (conflict_day, label)` |
| *(scenario_probs no longer used)* | War Room uses only **scenario_probabilities** for both current row and history (same columns). | — |
| **country_reports** | Per-country intel reports (elite network, risks, etc.) | `id`, `country_code`, `country_name`, `nai_score`, `nai_category`, `content_json`, `conflict_day` |
| **market_data** | Economic/conflict-sensitive indicators. Two writers with disjoint indicator sets — see `CLAUDE.md` Gotchas | `id`, `indicator`, `value`, `change_pct`, `unit`, `source`, `conflict_day`, `created_at` |
| **social_trends** | Social media trends by region/platform | `id`, `region`, `country`, `platform`, `trend`, `sentiment`, `engagement_estimate`, `conflict_day` |
| **disinfo_claims** | Disinformation claims and verdicts | `id`, `claim_text`, `verdict`, `source_url`, `debunk_url`, `spread_estimate`, `published_at` |

### Conflict day

- **Source of truth (current day):** the UTC calendar — DAY LOCK, identical to CLAUDE.md rule 1:
  `DAY = (today_utc − 2026-02-28).days + 1` (2026-02-28 = Day 1; 2026-10-05 = Day 220).
  Implemented once in `lib/conflict-calendar.ts` → `currentConflictDay()`, and re-exported via
  `lib/constants.ts` (`getConflictDay`), `utils/supabase/server.ts` (`getConflictDay`, no DB read),
  `hooks/useConflictDay.ts` and `hooks/useRealtimeCount.ts`. The current day is **never** derived from
  any table's `MAX(conflict_day)`.
- **Per-section data day:** a section that shows "latest" data maxes over its **own** table
  (`getLatestDayFor(table)` in `utils/supabase/server.ts`, or `maxConflictDay(rows)` client-side) —
  briefings over `daily_briefings`, markets over `market_data`, NAI over `nai_scores`, scenarios over
  `scenario_probabilities`, social over `social_trends`. No section borrows another table's day.
- **Degraded state:** every such section renders `components/ui/DataAsOf.tsx`. When its own latest day ≠
  the calendar day it shows `Latest available: Day N (date) — no data for Day <today>`; when current it
  shows `AS OF DAY N · CURRENT`. Frozen sections (NAI, scenarios) therefore always show their as-of day.
- **Exception — `country_reports`:** UNIQUE on `country_code` alone, i.e. one current snapshot per
  country, not a time series. Its single `conflict_day` is the snapshot stamp, not staleness.
- **Resolved contradiction (2026-10-05):** this section previously said "Source of truth: Latest
  `conflict_day` from `nai_scores` (max value)", which contradicted CLAUDE.md rule 1 ("NEVER use DB
  max+1"). When `nai_scores` froze at Day 35 (field semantics under dispute; writes paused) while
  `daily_briefings`/`market_data` advanced to Day 220, every reader of the nai_scores max (header, War
  Room, Feed, home realtime count, digest email, KV snapshot) froze at Day 35 and hid current briefings
  and markets. **The calendar rule (CLAUDE.md rule 1) won**: the current day must not depend on whether
  any single pipeline stage wrote rows; per-section freshness is reported, not used to define "today".

---

## 4. Directory Structure & Responsibilities

```
OSINT/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout: fonts (Bebas, IBM Plex Mono, DM Sans), BackgroundCanvas, CommandHeader, {children}
│   ├── globals.css               # Design system (CSS vars), base styles, card/scanlines, Media Room / War Room styles
│   ├── page.tsx                  # Home / Command dashboard: AsciiHero, quick links, useRealtimeCount, useArticles, useScenarios
│   ├── api/                      # Server-side API routes (no Supabase here)
│   │   ├── flickr/route.ts        # GET ?tags=… → proxies Flickr public feed (JSON)
│   │   ├── youtube-rss/route.ts  # GET ?channelId=… → proxies YouTube channel RSS (XML)
│   │   └── youtube-live/route.ts # GET ?ids=id1,id2 → YouTube Data API live video IDs (optional YOUTUBE_API_KEY)
│   ├── feed/page.tsx             # Live feed: useArticles (region/sentiment/conflict_day), useConflictDay
│   ├── nai/page.tsx              # NAI map: MapLibre, useNaiScores(conflictDay), country_reports for selected country
│   ├── countries/
│   │   ├── page.tsx              # Country list: useConflictDay, useNaiScores, links to /countries/[slug]
│   │   └── [slug]/page.tsx       # Single country: country_reports by country_code + conflict_day
│   ├── scenarios/page.tsx        # Scenario tracker: useScenarios (scenario_probabilities), Recharts
│   ├── disinfo/page.tsx          # Disinfo list: disinfo_claims
│   ├── markets/page.tsx          # Markets: market_data, Recharts by indicator
│   ├── social/page.tsx           # Social: social_trends
│   ├── timeline/page.tsx         # Timeline: useArticles(conflict_day), useNaiScores per day
│   ├── analytics/page.tsx        # Mix-and-match: useNaiScoresAll, useScenarios, Recharts scatter/line
│   ├── mediaroom/page.tsx        # Live TV (YouTube), Flickr photos (/api/flickr), clips (/api/youtube-rss), wire (articles)
│   └── warroom/page.tsx          # Unified war room: all Supabase tables, useConflictDay, scenario_probs + fallback to scenario_probabilities
├── components/
│   ├── AsciiHero.tsx             # Hero with article count, conflict day, countries tracked
│   ├── BackgroundCanvas.tsx       # Optional Three.js / canvas background
│   ├── CommandHeader.tsx         # Sticky nav: logo, conflict day, last update, article count, NAV_LINKS
│   ├── OsintCard.tsx             # Card with gold bracket styling
│   ├── SourceBadge.tsx           # Source type badge for articles
│   ├── SentimentBar.tsx          # Sentiment distribution
│   ├── GlossaryTooltip.tsx       # Term + definition tooltip
│   ├── TimelineScrubber.tsx      # Day scrubber (min/max/value/onChange)
│   ├── NaiScoreBadge.tsx         # NAI category/score badge
│   ├── CountryFlag.tsx           # Country flag (emoji or code)
│   ├── ConflictDayBadge.tsx      # Conflict day badge
│   ├── PulseDot.tsx              # Live indicator dot
│   └── (others as needed)
├── hooks/
│   ├── useRealtimeCount.ts       # articles count + calendar conflict day; sets live/lastUpdate
│   ├── useConflictDay.ts         # Calendar conflict day (DAY LOCK) — no DB read
│   ├── useArticles.ts            # articles with filters (region, sentiment, source_type, conflict_day), pagination
│   ├── useScenarios.ts           # scenario_probabilities, all rows, order conflict_day asc
│   ├── useNaiScores.ts           # nai_scores for one conflict_day
│   └── useNaiScoresAll.ts        # nai_scores all (for analytics)
├── lib/
│   ├── supabase/client.ts        # createClient() via @supabase/ssr createBrowserClient (NEXT_PUBLIC_* only)
│   └── utils.ts                  # formatEngagement(n) for social/markets
├── types/
│   └── supabase.ts               # Article, NaiScore, ScenarioProbability, CountryReport, DisinfoClaim, MarketData, SocialTrend
├── .github/workflows/
│   ├── collect-articles.yml      # Collect Feeds: collect_feeds.py hourly (+ KV warm)
│   ├── collect-markets.yml       # Collect Market Data: collect_markets.py every 30 min (+ KV warm)
│   ├── collect-social.yml       # Collect Social Trends: collect_social.py every 12 h (+ KV warm)
│   ├── collect-disinfo.yml      # Collect Disinfo Claims: collect_disinfo.py daily 06:00 UTC
│   ├── deploy.yml                # On push main: npm install, build:cf, wrangler deploy
│   ├── prod-e2e.yml              # Production E2E — manual-only / disabled
│   ├── run-migration.yml         # Run DB Migration — manual-only / disabled
│   └── scripts/
│       ├── requirements.txt      # feedparser, requests, python-dateutil, pytrends, urllib3
│       ├── sources_registry.py   # RSS sources + source_type (wire, broadcast, official, military, elite, etc.)
│       ├── collect_feeds.py      # Fetches RSS, writes to Supabase articles (uses SUPABASE_URL, SUPABASE_SERVICE_KEY)
│       ├── collect_articles.py   # (if different from collect_feeds.py)
│       ├── collect_markets.py    # Writes market_data
│       ├── collect_social.py     # Writes social_trends
│       ├── collect_disinfo.py    # Writes disinfo_claims
│       └── (daily_analysis.py, stage1-4, detect_scenarios.py, collect_*_analysis — retired pipeline, reference only)
├── .github/workflows-retired/    # Five retired Anthropic-API workflows + README.md (run history). Never move back.
└── PROJECT.md                    # Main project file (reference + setup)
```

---

## 5. Pages — Data & Connections

| Route | Data source | Hooks / API | Notes |
|-------|-------------|-------------|--------|
| **/** | articles (count), daily_briefings (latest general), market_data (latest day), scenario_probabilities | useRealtimeCount, useArticles, useScenarios, useLatestBriefing, useMarketData | Dashboard; calendar day + per-section DataAsOf labels |
| **/feed** | articles | useArticles (region, sentiment, conflict_day), useConflictDay | Filterable feed; conflict day in UI |
| **/nai** | nai_scores, country_reports | useNaiScores(conflictDay), createClient() for selected country report | Map + sidebar; click country loads report |
| **/countries** | nai_scores | server: getLatestDayFor('nai_scores') → scores at NAI's own latest day + DataAsOf | Grid of countries → /countries/[slug] |
| **/countries/[slug]** | country_reports | createClient().from('country_reports').eq('country_code').eq('conflict_day') | Single country report |
| **/scenarios** | scenario_probabilities | useScenarios | Line chart A/B/C/D over days |
| **/disinfo** | disinfo_claims | createClient(), local state | List of claims + verdicts |
| **/markets** | market_data | createClient(), local state | Charts by indicator |
| **/social** | social_trends | createClient(), local state | Trends by platform/region |
| **/timeline** | articles, nai_scores | useArticles({ conflict_day }), useNaiScores(day) | Day selector; articles + NAI summary per day |
| **/analytics** | nai_scores, scenario_probabilities | useNaiScoresAll, useScenarios | Scatter/line; user picks X/Y axes |
| **/mediaroom** | articles (Supabase), Flickr (via /api/flickr), YouTube (via /api/youtube-rss, /api/youtube-live) | createClient() for wire; fetch /api/flickr, /api/youtube-rss, /api/youtube-live | Live TV grid, photos, clips, wire; country filter |
| **/warroom** | country_reports, articles, market_data, social_trends, scenario_probabilities, disinfo_claims, nai_scores | useConflictDay, createClient() for all tables | Single page with CONFLICT_DAY; scenario history from scenario_probabilities; fetchError banner on Supabase errors |

---

## 6. API Routes (Server)

- **GET /api/flickr?tags=mena,middleeast**  
  Proxies Flickr public JSON feed. Returns array of `{ title, thumb, full, url, author }`. Used by Media Room photos.

- **GET /api/youtube-rss?channelId=UC...**  
  Proxies YouTube channel RSS XML. Media Room clips call this per channel and parse XML in the client.

- **GET /api/youtube-live?ids=id1,id2,...**  
  Returns `[{ channelId, videoId, isLive }, ...]` using YouTube Data API v3. Requires `YOUTUBE_API_KEY`. Media Room uses `videoId` for embed when live; otherwise falls back to `live_stream?channel=` and shows “Off air?”.

---

## 7. Design System (CSS Variables)

Defined in **`app/globals.css`** and referenced in Tailwind theme:

- **Backgrounds:** `--bg-primary`, `--bg-secondary`, `--bg-card`, `--bg-elevated`
- **Borders:** `--border`, `--border-bright`, `--border-gold`
- **Text:** `--text-primary`, `--text-secondary`, `--text-muted`
- **Accents:** `--accent-gold`, `--accent-red`, `--accent-green`, `--accent-blue`, `--accent-orange`, `--accent-teal`
- **NAI categories:** `--nai-safe`, `--nai-stable`, `--nai-tension`, `--nai-fracture`, `--nai-inversion`

Fonts (from layout): `--font-bebas`, `--font-mono`, `--font-dm`.

---

## 8. Key Variables & Conventions

- **CONFLICT_DAY** (or `conflictDay`): From `useConflictDay()` — the calendar DAY LOCK, no DB read (§3). Per-section "latest data" days come from each section's own table, never from `nai_scores`.
- **Article filters:** `region`, `sentiment`, `source_type`, `conflict_day` (see `UseArticlesFilters` in `useArticles.ts`).
- **source_type (from pipelines):** wire, broadcast, regional, official, military, elite, financial, think_tank (see `sources_registry.py`).
- **Country codes:** Uppercase in many places (e.g. IR, IL, IQ, YE, SA, AE, LB, EG, TR, RU). `countries/[slug]` uses lowercase in URL; query uses `.toUpperCase()` where needed.
- **Sentiment:** positive, negative, neutral (and pro_war, anti_war, fearful in some contexts).

---

## 9. Data Flow Summary

1. **Pipelines (GitHub Actions)**  
   Python collectors run on schedule; they use `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` to insert/update **articles**, **market_data** (collector-owned indicators), **social_trends**, **disinfo_claims**. No AI runs in GitHub Actions. The Claude scheduled task "MENA Intel Desk — daily build" (06:51 Cairo) writes **daily_briefings**, **market_data** for the indicators no feed covers (USD/EGP, open-market USD/IRR, Hormuz/Bab al-Mandeb traffic), **country_reports** narrative (PATCH by `country_code`) and **detected_scenarios** candidates. **nai_scores** and **scenario_probabilities** are frozen at Day 35 — nothing writes them until the operator rules on NAI semantics (`CLAUDE.md`, Hard Bans).

2. **Browser**  
   Next.js app loads; all Supabase reads go through `createClient()` (anon key). Pages and hooks call `.from('articles')`, `.from('nai_scores')`, etc.

3. **Conflict day**  
   UTC calendar (DAY LOCK, see §3 "Conflict day"). Each section's own latest day is compared against it and labelled via `DataAsOf`.

4. **Media Room**  
   Photos and clips avoid CORS by calling Next.js API routes (`/api/flickr`, `/api/youtube-rss`); Live TV optionally uses `/api/youtube-live` when `YOUTUBE_API_KEY` is set.

5. **War Room**  
   Single `fetchAll()` on load and every 60s; reads all listed tables; scenario history from `scenario_probabilities`; latest `country_reports` per country (deduped); shows a banner if any Supabase request fails (`fetchError`).

---

## 10. Extending the Project

- **New Supabase table:** Add interface in `types/supabase.ts`, then use `createClient().from('table_name')` in a page or hook. If RLS is enabled, ensure anon policy allows read.
- **New page:** Add `app/<name>/page.tsx` and a link in `CommandHeader`’s `NAV_LINKS` and/or home `QUICK_LINKS`.
- **New API route:** Add `app/api/<name>/route.ts`; use server-only env (e.g. keys) here, not `NEXT_PUBLIC_*`.
- **New pipeline:** Add a Python script under `.github/workflows/scripts/` and a workflow that runs it with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. It must not call a paid model API; insert grouped by key signature (PGRST102), fetch with `requests(timeout=…)`, convert timestamps to UTC before `conflict_day`, and exit non-zero if it collected rows but wrote none (`CLAUDE.md` Gotchas).
- **Market data:** If your `market_data` table has `created_at`, add it to the `MarketData` type and keep ordering by `created_at` where needed (e.g. War Room).

---

## 11. Setup & Free Tier Optimization

Complete step-by-step guide. Follow in order. All steps are one-time setup.

### Overview of what this does

```
Now (2026-10-06):
  User visits site → pages read Supabase directly (no code reads Cloudflare KV — see below)
  GitHub Actions collectors every 30 min / hourly / 12 h / daily → free (public repo)
  Claude scheduled task, daily 06:51 Cairo, on subscription → briefings, Claude-owned market
  indicators, country_reports narrative, scenario candidates (NOT nai_scores — frozen at Day 35)
  No metered AI API anywhere in automation
```

**KV note (verified by grep, 2026-10-06):** `warm_kv_cache.py` writes snapshots to Cloudflare KV after each collector run, but no code in `app/`, `lib/`, `components/`, `hooks/`, `utils/` or `middleware.ts` reads them, and `wrangler.jsonc` declares no `kv_namespaces`. The snapshot is write-only. It is 3 PUTs per run × ~74 runs/day ≈ 220 writes/day against the 1,000/day free cap — fine, but it is cost without benefit until a reader exists (candidate for removal).

### Step 1 — Supabase retention (**DO NOT run `docs/8_supabase_cron_cleanup.sql`**)

This step used to say "paste the entire contents of `docs/8_supabase_cron_cleanup.sql` and Run". **Do not.** Its `cleanup-old-articles` job (delete articles older than 90 days) deleted **24,757 articles between June and September 2026 while collection was off**. The free tier has no backups, so the Mar–Aug article history is unrecoverable. The file is kept only as a record, with its statements commented out and a DO NOT RUN header.

**Retention policy (replaces it):** never delete rows. When the database passes ~350 MB (free limit 500 MB), strip `summary` and `tags` on OLD rows only; keep the row, title, url, source, timestamps and `conflict_day`.

**Market-data dedup:** a nightly pg_cron job keeps one row per `indicator` + `conflict_day`. It was written to keep a RANDOM row (it compared UUIDs, not time) and is being fixed to keep the newest by `created_at` for closed days. Check the live job body with `SELECT jobid, jobname, schedule, command FROM cron.job;` before trusting it. Writers must also never share an indicator name (`CLAUDE.md` Gotchas).

### Step 2 — Create Cloudflare KV Namespace (3 minutes)

In your terminal (inside the OSINT project folder):

```bash
# Login to Cloudflare (if not already)
npx wrangler login

# Create the KV namespace
npx wrangler kv namespace create "OSINT_CACHE"
```

**Copy the ID it outputs** — looks like: `abc123def456...`

### Step 3 — Update wrangler.toml (1 minute)

Open `wrangler.toml` and **replace** `REPLACE_WITH_KV_NAMESPACE_ID` with the KV namespace ID from Step 2.

### Step 4 — Add GitHub Secrets (5 minutes)

Go to: https://github.com/rzjy54n5sh-rgb/OSINT/settings/secrets/actions

**Required for Deploy (build bakes these into the client — if missing, live site shows 0 articles):**

| Secret Name | Value / Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL, e.g. `https://qmaszkkyukgiludcakjg.supabase.co` (Supabase → Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (Project Settings → API → anon public). Safe to expose; RLS protects data. |

You should also have: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

**Add this for the collectors' KV warm step:**

| Secret Name | Value / Where to get it |
|---|---|
| `CF_KV_NAMESPACE_ID` | The KV namespace ID from Step 2, e.g. `5ff576b8a0c44c7fa45618584829df04` (or run `npx wrangler kv namespace list` and copy the `id` for OSINT_CACHE) |

**Do not add `ANTHROPIC_API_KEY` or `PERPLEXITY_API_KEY`.** No active workflow uses them and no automation may call a metered model API. Recommendation to the operator (not done): delete both repo secrets and revoke the Anthropic API key (note: this also disables the `admin-agent` Edge Function, which has its own `ANTHROPIC_API_KEY` function secret).

### Step 5 — Scripts and workflows (already in repo)

The following are already in place:

- `.github/workflows/scripts/warm_kv_cache.py`
- `.github/workflows/collect-articles.yml` (with KV warming, every 60 min)
- `.github/workflows/collect-markets.yml` (with KV warming, every 30 min)
- `.github/workflows/collect-social.yml` (with KV warming, every 12 hours)
- `.github/workflows/collect-disinfo.yml` (daily)
- `.github/workflows/deploy.yml` (on push to `main`)

`daily_analysis.py` and `daily-analysis.yml` are **retired** (see `.github/workflows-retired/README.md`). `docs/8_supabase_cron_cleanup.sql` is **DO NOT RUN** (Step 1).

### Step 6 — Deploy to Cloudflare (2 minutes)

```bash
npm run build
npx wrangler deploy
```

### Step 7 — Verify the collectors and the daily build

1. Go to: https://github.com/rzjy54n5sh-rgb/OSINT/actions — the four `Collect …` workflows and `Deploy` should be green. A red run is the only failure signal (no issue/email is sent).
2. Check the site: Home, Briefings and Markets should read `AS OF DAY <today> · CURRENT` once the Claude daily build (06:51 Cairo) has run; Feed should show articles stamped with the current day.
3. NAI / Scenarios / Countries will read `Latest available: Day 35` until the NAI ruling — that is the correct, honest label, not a bug.

### Result — Free Tier Budget After Optimization

| Service | Free Limit | Your Usage After |
|---|---|---|
| GitHub Actions minutes | Free for public repos (2,000/month if it were private) | Collectors only; no AI workflows ✅ |
| Supabase DB storage | 500MB | Policy: never delete; strip `summary`/`tags` on old rows past ~350MB (check live size) |
| Supabase bandwidth | 2GB/month | Unmeasured — pages read Supabase directly (KV is write-only); verify live |
| Cloudflare Workers | 100K req/day | ~500/day ✅ |
| Cloudflare KV reads | 100K/day | 0 (nothing reads KV) |
| Cloudflare KV writes | 1K/day | ~220/day (3 PUTs × ~74 collector runs) ✅ |
| AI APIs | n/a | $0 — none in automation (Claude scheduled task is on subscription) |

Stay on free tiers; flag any limit or cost risk before building. The one metered-cost lesson: ~$100 of Anthropic credit was burned by the retired workflows.

### Daily Build — Contract

The task's prompt is managed from Omar's Claude session, not from this repo; this is the contract it must satisfy.

```
Every day at 06:51 Cairo (Claude scheduled task "MENA Intel Desk — daily build", subscription):
  1. Claude reads the last 24h of articles / markets / social from Supabase
  2. Idempotency check first: is today already done? If so, stop
  3. Validate before writing; real sourced data only, each item stamped with source, date/time, geolocation
  4. Writes daily_briefings, market_data (USD/EGP, open-market USD/IRR, Hormuz/Bab al-Mandeb only),
     country_reports narrative (PATCH by country_code, never country_name), detected_scenarios candidates
  5. NEVER writes nai_scores (frozen at Day 35), scenario_probabilities, or any disinformation table
```

The old flow (GitHub Actions 06:00 UTC → `daily_analysis.py` → metered Claude API → 20 NAI scores + 20 country reports + scenarios) is retired; it ran twice daily, paid before validating, and failed 247 of ~320 runs.

Claude still needs to be triggered manually for: deep-dive reports / DOCX exports, anything needing human judgment, adding new countries, and changing scoring methodology (the latter requires the NAI ruling first).

### Troubleshooting — Live site shows zero data (articles: 0, conflict day: —)

**Cause:** The deploy build needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at **build time**. If these GitHub Actions secrets are missing, Next.js bakes `undefined` into the client bundle and the site never calls Supabase.

1. **Add the two secrets** (repo → Settings → Secrets and variables → Actions):  
   `NEXT_PUBLIC_SUPABASE_URL` = your project URL (e.g. `https://qmaszkkyukgiludcakjg.supabase.co`)  
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon/public key from Supabase → Project Settings → API.

2. **Confirm** `.github/workflows/deploy.yml` Build step has `env: NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}` and `NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}` (no hardcoded values).

3. **Re-run the Deploy workflow:** Actions → Deploy → Run workflow → Run workflow. Wait ~3–5 min.

4. **Verify:** Open the live site; CONFLICT DAY and article counts should show real data. If not, DevTools → Network: requests to `*.supabase.co` should appear; if not, search the built JS for your project ID to confirm the env was inlined.

---

## 12. Post-Upgrade Test Checklist (Next 15)

After deploying, verify these work on the live URL (e.g. `https://mena-intel-desk.*.workers.dev`):

| Area | What to test |
|------|----------------|
| **Home** | Load `/` — hero animation, article count, conflict day, quick links to all sections. |
| **Header** | Day, last update, article count; nav links (WAR ROOM, MEDIA ROOM, FEED, NAI MAP, etc.). |
| **Feed** | `/feed` — filters (region, sentiment, day); articles load; links open. |
| **NAI Map** | `/nai` — map loads; day scrubber; click country → report panel. |
| **Countries** | `/countries` — grid of countries; click → `/countries/[slug]` (e.g. `ir`, `il`) shows report or [DATA UNAVAILABLE] if no data. |
| **Scenarios** | `/scenarios` — scenario A/B/C/D chart and descriptions. |
| **Disinfo** | `/disinfo` — claims list, verdicts, links. |
| **Markets** | `/markets` — indicator charts. |
| **Social** | `/social` — Google Trends–sourced rows. |
| **Timeline** | `/timeline` — day selector; articles and NAI summary per day. |
| **Analytics** | `/analytics` — axis selectors; scatter/line charts. |
| **Media Room** | `/mediaroom` — Live TV (8 channels: load, embed, “Off air?”); Photos (Flickr by country); Clips (YouTube RSS); Wire (articles). |
| **War Room** | `/warroom` — country selector; intel panels; scenario drift; live intelligence; articles; market/social/disinfo sections; no red error banner. |
| **APIs** | `/api/flickr?tags=mena`, `/api/youtube-rss?channelId=...`, `/api/youtube-live?ids=...` (optional key) return expected shapes. |

---

## 13. Audit: Next.js 15 upgrade (post-migration)

The following was verified after the Next.js 15 upgrade to avoid regressions (Supabase crash and static asset 404s were observed only after the upgrade and have been addressed):

| Area | Status | Notes |
|------|--------|--------|
| **Async request APIs** | ✅ N/A | No `cookies()`, `headers()`, `draftMode()`; no server `params`/`searchParams` props (only `useParams()` in client and `request.nextUrl.searchParams` in API routes). |
| **React 19** | ✅ | `react`/`react-dom` ^19; no `useFormState` (deprecated). |
| **Supabase in browser** | ✅ | `lib/supabase/client.ts` guards missing env and returns a no-op client (no throw); `useRealtimeCount` uses shared `createClient()`. |
| **Static assets (Cloudflare)** | ✅ | `wrangler.toml` has `run_worker_first = true` so OpenNext worker serves `/_next/static/*` correctly. |
| **Env vars** | ✅ | `NEXT_PUBLIC_*` inlined at build; deploy workflow passes them to `build:cf`; server-only `YOUTUBE_API_KEY` in API route only. |
| **Config** | ✅ | `next.config.js` (no async APIs), `open-next.config.ts`, `wrangler.toml` and deploy workflow aligned. |
| **API routes** | ✅ | All use `NextRequest`/`NextResponse` and `request.nextUrl.searchParams`; no async page `searchParams`. |
| **Build** | ✅ | `next build` and `opennextjs-cloudflare build` (build:cf) both succeed. |

**This file (PROJECT.md) is the main project file.** Use it as the single source of truth for structure, stack, env, setup, and connections when continuing development (e.g. with Claude).

---

## 14. Platform Upgrade: Transparency & User Journey (March 2026)

### What was added

| Feature | File(s) | Notes |
|---------|---------|-------|
| Methodology page | `app/methodology/page.tsx` | Full Q&A with citations, accordion UI, 6 sections |
| Translation banner | `components/TranslationBanner.tsx` | First-visit only, localStorage dismissal |
| Globe/translation menu | `components/GlobeMenu.tsx` | Header icon, dropdown with browser instructions + Google Translate link |
| Page briefing strip | `components/PageBriefing.tsx` | Injected at top of all 11 pages with pre-written explanatory text |
| Reaction bar | `components/ReactionBar.tsx` | Source verification link, save, share (copy URL), dispute with source requirement |
| HTML translate attributes | `app/layout.tsx` | `dir="ltr" translate="yes"` on `<html>` tag |
| Navigation | `components/CommandHeader.tsx` | Added METHODOLOGY link and GlobeMenu |

### Neutrality architecture

The platform operates under a strict neutrality framework documented in `/methodology`:
- Collects from all sides simultaneously (Iranian state media + IDF + Pentagon + Gulf press)
- No editorial commentary on news items
- All probabilities are estimates, not predictions
- All limitations are explicitly stated in the "What We Cannot Know" section

### Reaction system (no comments)

Comments were deliberately excluded. Instead: structured reactions (verify source, save, share, dispute with source requirement). Rationale: free-form comments on a geopolitical conflict platform create moderation decisions that are inherently editorial decisions, which would compromise the platform's neutrality positioning.

### Translation approach

No built-in translations. Rationale: (1) mistranslation of technical terms (NAI, GAP score, INVERSION) on sensitive geopolitical content is a liability, (2) browser translation is mature and sufficient. Technical terms like `translate="no"` can be applied to NAI category labels, source type badges, and country codes to prevent mis-translation.
