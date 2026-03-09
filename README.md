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
│  Cloudflare (deploy; env vars in dashboard — no .env committed)   │
└─────────────────────────────────────────────────────────────────┘
```

## Setup

1. Clone and install:
   ```bash
   npm install
   ```

2. Copy env and set variables (use Cloudflare env in production):
   ```bash
   cp .env.example .env.local
   # Edit .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
   # NAI map uses MapLibre (no API key).
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

## Deploy (Cloudflare Workers)

The app uses **OpenNext** to build for Cloudflare Workers. Build completed successfully; to deploy from your machine:

1. **Authenticate** (one-time): run `npx wrangler login` and complete the browser flow, **or** create an [API token](https://dash.cloudflare.com/profile/api-tokens) and set:
   ```bash
   export CLOUDFLARE_API_TOKEN=your_token
   export CLOUDFLARE_ACCOUNT_ID=your_32_char_account_id   # Workers & Pages → right sidebar "Account ID" (not your email)
   ```
2. **Deploy:**
   ```bash
   npm run deploy
   ```
   This runs `opennextjs-cloudflare build` then `wrangler deploy`. Your Worker will be at `https://mena-intel-desk.<your-subdomain>.workers.dev` (or your custom domain).

**Env for build:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are read from `.env.local` during `npm run deploy`. In CI, set them as build env vars. Do not commit `.env` or real keys.
