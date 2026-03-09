# MENA Intel Desk

OSINT conflict intelligence dashboard — NAI world map, analytics, timeline, country reports, scenario tracker, disinformation tracker, and live feed.

**Default repository (do not change):** `origin` → https://github.com/rzjy54n5sh-rgb/OSINT.git — default branch `main`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Next.js 14 (App Router)                       │
├─────────────────────────────────────────────────────────────────┤
│  /            Home + nav    │  /feed       Live article feed      │
│  /nai         NAI map      │  /analytics  Mix & match charts      │
│  /timeline    Timeline     │  /scenarios  Scenario probabilities  │
│  /countries   Country list │  /disinfo    Disinformation tracker  │
│  /countries/[slug]         Country report (content_json modules)  │
├─────────────────────────────────────────────────────────────────┤
│  Supabase (Realtime for feed + header count; RLS enabled)         │
│  Vercel (deploy; env vars only — no .env committed)              │
└─────────────────────────────────────────────────────────────────┘
```

## Setup

1. Clone and install:
   ```bash
   npm install
   ```

2. Copy env and set variables (use Vercel env in production):
   ```bash
   cp .env.example .env.local
   # Edit .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
   # and optionally NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN for the NAI map.
   ```

3. Run dev:
   ```bash
   npm run dev
   ```

4. Apply your Supabase schema (tables: `articles`, `country_reports`, `nai_scores`, `scenario_probabilities`, `disinfo_claims`). The app shows "Awaiting data feed..." until the pipeline populates data.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — start production server
- `npm run lint` — ESLint
- `npm run type-check` — TypeScript check

## Security

- CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy in `next.config.js`
- Rate limiting on `/api/*` (60 req/min per IP) in `middleware.ts`
- Supabase anon key is read-only; all writes server-side only
- No secrets in client bundle; use server components for DB access where possible

## Deploy (Vercel)

Connect the repo to Vercel and set environment variables in the dashboard. Do not commit `.env` or real keys.
