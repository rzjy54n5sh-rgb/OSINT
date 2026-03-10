# MENA Intel Desk — Project Reference

**Purpose:** Share with Claude (or any developer) for further development. This document describes the full stack, structure, data flow, and how everything connects.

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

| Variable | Where used | Purpose |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/client.ts`, all pages/hooks that use Supabase | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same | Supabase anonymous (public) key for browser client |
| `YOUTUBE_API_KEY` | `app/api/youtube-live/route.ts` only (server) | Optional; when set, Live TV uses YouTube Data API to resolve current live video IDs |
| **Secrets (GitHub Actions only)** | Workflows | **Deploy (`.github/workflows/deploy.yml`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (passed to build so the client bundle has Supabase; otherwise War Room / all Supabase calls fail in production), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. **Pipelines:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Optional: `YOUTUBE_API_KEY` for Media Room Live TV. |

**Note:** The app does **not** use a server-side Supabase client. `NEXT_PUBLIC_*` vars are inlined at **build time**. For the deployed app (Cloudflare), the deploy workflow must pass `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from GitHub Secrets into the Build step; local dev uses `.env.local`. All Supabase access is from the browser via `createClient()` from `@/lib/supabase/client.ts`, which uses the two `NEXT_PUBLIC_*` vars. If those env vars are **not** set at build time, the app still loads: `createClient()` returns a no-op client and pages show empty data (no crash). To get real data in production, set the Supabase env vars in your deployment (e.g. Cloudflare Pages / Wrangler secrets or GitHub Actions secrets passed into the build).

---

## 3. Database (Supabase) — Tables & Types

TypeScript interfaces live in **`types/supabase.ts`**. Table names and shapes used in the app:

| Table | Purpose | Key columns (see types for full shape) |
|-------|---------|----------------------------------------|
| **articles** | OSINT news/feed items from RSS pipelines | `id`, `title`, `url`, `source_name`, `source_type`, `published_at`, `fetched_at`, `conflict_day`, `region`, `country`, `sentiment`, `tags`, `content_json` |
| **nai_scores** | Narrative Alignment Index per country per day | `id`, `country_code`, `conflict_day`, `expressed_score`, `latent_score`, `gap_size`, `category` |
| **scenario_probabilities** | Scenario A/B/C/D probabilities per conflict day | `id`, `conflict_day`, `scenario_a`, `scenario_b`, `scenario_c`, `scenario_d` |
| *(scenario_probs no longer used)* | War Room uses only **scenario_probabilities** for both current row and history (same columns). | — |
| **country_reports** | Per-country intel reports (elite network, risks, etc.) | `id`, `country_code`, `country_name`, `nai_score`, `nai_category`, `content_json`, `conflict_day` |
| **market_data** | Economic/conflict-sensitive indicators | `id`, `indicator`, `value`, `change_pct`, `unit`, `source`, `conflict_day`. **Note:** War Room also orders by `created_at`; add to type if your schema has it. |
| **social_trends** | Social media trends by region/platform | `id`, `region`, `country`, `platform`, `trend`, `sentiment`, `engagement_estimate`, `conflict_day` |
| **disinfo_claims** | Disinformation claims and verdicts | `id`, `claim_text`, `verdict`, `source_url`, `debunk_url`, `spread_estimate`, `published_at` |

### Conflict day

- **Source of truth:** Latest `conflict_day` from `nai_scores` (max value).
- **Hooks:** `useConflictDay()` returns that value (or `null` until loaded). Used by War Room, Countries, Feed (filter), etc.
- **Fallback in UI:** When `conflictDay` is null, many pages use a default (e.g. `10`) so the UI doesn’t break.

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
│   ├── useRealtimeCount.ts       # articles count + nai_scores latest conflict_day; sets live/lastUpdate
│   ├── useConflictDay.ts         # Latest conflict_day from nai_scores
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
│   ├── collect-articles.yml      # Triggers collect_feeds.py (or collect_articles.py) every 30 min
│   ├── collect-markets.yml       # collect_markets.py every 15 min
│   ├── collect-social.yml       # collect_social.py every 6 h
│   ├── collect-disinfo.yml      # collect_disinfo.py daily
│   ├── deploy.yml                # On push main: npm install, build:cf, wrangler deploy
│   └── scripts/
│       ├── requirements.txt      # feedparser, requests, python-dateutil, pytrends, urllib3
│       ├── sources_registry.py   # RSS sources + source_type (wire, broadcast, official, military, elite, etc.)
│       ├── collect_feeds.py      # Fetches RSS, writes to Supabase articles (uses SUPABASE_URL, SUPABASE_SERVICE_KEY)
│       ├── collect_articles.py   # (if different from collect_feeds.py)
│       ├── collect_markets.py    # Writes market_data
│       ├── collect_social.py     # Writes social_trends
│       └── collect_disinfo.py    # Writes disinfo_claims
└── PROJECT.md                    # This file
```

---

## 5. Pages — Data & Connections

| Route | Data source | Hooks / API | Notes |
|-------|-------------|-------------|--------|
| **/** | articles (count), nai_scores (conflict_day), scenario_probabilities | useRealtimeCount, useArticles, useScenarios | Dashboard with quick links to all sections |
| **/feed** | articles | useArticles (region, sentiment, conflict_day), useConflictDay | Filterable feed; conflict day in UI |
| **/nai** | nai_scores, country_reports | useNaiScores(conflictDay), createClient() for selected country report | Map + sidebar; click country loads report |
| **/countries** | nai_scores | useConflictDay, useNaiScores(CONFLICT_DAY) | Grid of countries → /countries/[slug] |
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

- **CONFLICT_DAY** (or `conflictDay`): From `useConflictDay()` or latest from `nai_scores`. Default in UI often `10` when null.
- **Article filters:** `region`, `sentiment`, `source_type`, `conflict_day` (see `UseArticlesFilters` in `useArticles.ts`).
- **source_type (from pipelines):** wire, broadcast, regional, official, military, elite, financial, think_tank (see `sources_registry.py`).
- **Country codes:** Uppercase in many places (e.g. IR, IL, IQ, YE, SA, AE, LB, EG, TR, RU). `countries/[slug]` uses lowercase in URL; query uses `.toUpperCase()` where needed.
- **Sentiment:** positive, negative, neutral (and pro_war, anti_war, fearful in some contexts).

---

## 9. Data Flow Summary

1. **Pipelines (GitHub Actions)**  
   Python scripts run on schedule; they use `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` to insert/update **articles**, **market_data**, **social_trends**, **disinfo_claims**. NAI and scenario data are assumed to be populated by other processes or the same repo’s scripts.

2. **Browser**  
   Next.js app loads; all Supabase reads go through `createClient()` (anon key). Pages and hooks call `.from('articles')`, `.from('nai_scores')`, etc.

3. **Conflict day**  
   Read from `nai_scores` (max `conflict_day`). Used for filtering and labelling across Feed, War Room, Countries, Timeline, etc.

4. **Media Room**  
   Photos and clips avoid CORS by calling Next.js API routes (`/api/flickr`, `/api/youtube-rss`); Live TV optionally uses `/api/youtube-live` when `YOUTUBE_API_KEY` is set.

5. **War Room**  
   Single `fetchAll()` on load and every 60s; reads all listed tables; scenario history from `scenario_probabilities`; latest `country_reports` per country (deduped); shows a banner if any Supabase request fails (`fetchError`).

---

## 10. Extending the Project

- **New Supabase table:** Add interface in `types/supabase.ts`, then use `createClient().from('table_name')` in a page or hook. If RLS is enabled, ensure anon policy allows read.
- **New page:** Add `app/<name>/page.tsx` and a link in `CommandHeader`’s `NAV_LINKS` and/or home `QUICK_LINKS`.
- **New API route:** Add `app/api/<name>/route.ts`; use server-only env (e.g. keys) here, not `NEXT_PUBLIC_*`.
- **New pipeline:** Add a Python script under `.github/workflows/scripts/` and a workflow that runs it with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
- **Market data:** If your `market_data` table has `created_at`, add it to the `MarketData` type and keep ordering by `created_at` where needed (e.g. War Room).

---

## 11. Post-Upgrade Test Checklist (Next 15)

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

## Audit: Next.js 15 upgrade (post-migration)

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

Use this document as the single source of truth for structure, stack, env, and connections when continuing development (e.g. with Claude).
