# Desktop browser: admin login, zero articles, stale homepage

## Admin works on phone but not desktop

**Cause (fixed in code):** Middleware treated you as logged out when **`public.users` had no row** yet, even if Supabase Auth had a valid session. Mobile/desktop timing or sync could differ. `/admin` now gates on the **Auth user id** and checks `admin_users` with that id.

**Still stuck?**

- Use the **exact** site URL that matches `NEXT_PUBLIC_SITE_URL` (with or without `www`).
- Clear **cookies** for the site, sign in again.
- **Unregister the service worker**: DevTools → Application → Service Workers → Unregister, then hard refresh.

## “0 articles” on desktop but data exists

**Cause:** The PWA **service worker** (`public/sw.js`) used **cache-first** for `/_next/static/*`. After a deploy, the browser could keep an **old JavaScript bundle** that had no Supabase URL/key (mock client → empty queries).

**Fix (in repo):** Cache version bumped to `mena-intel-v4` and **`/_next/static/` is network-first** so new builds load immediately.

**Manual fix:** Unregister SW + hard refresh (or “Empty cache and hard reload”).

## Homepage “TOP FINDING” text outdated

**Cause:** The paragraph was **hardcoded** in `HomeDashboard.tsx`, not read from the database.

**Fix (in repo):** The strip loads **`daily_briefings.lead`** for `report_type = 'general'` and the current **conflict day** (same day source as the rest of the dashboard). If no row exists, it shows a short message and link to briefings.

## Whole platform shows empty data (not reading the database)

**Causes:**

1. **Supabase env not in the browser bundle** — `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key) must be present at **`next build` / OpenNext build** time. If they’re missing, the app uses a no-op client and queries return empty (check the browser console for `@supabase/ssr: Supabase not configured`).

2. **Stale service worker** — an old bundle without keys (see “0 articles” above). Unregister SW + hard reload.

3. **RLS / wrong project** — anon key must match the same Supabase project as your data; RLS policies must allow `anon` to `SELECT` the tables you expect for public pages.

**Deploy (GitHub Actions):** Ensure secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set; the workflow writes `lib/supabase/env.client.generated.ts` before `build:cf`.

**Local Cloudflare deploy:** Keep the same vars in `.env.local`. `npm run build:cf` / `deploy` runs `sync:supabase-client-env` in CI only; locally Next still inlines `NEXT_PUBLIC_*` from `.env.local`. To bake keys into the generated file on purpose: `FORCE_WRITE_SUPABASE_CLIENT_ENV=1 npm run sync:supabase-client-env` (do **not** commit real keys).

**Runtime bridge (Cloudflare):** `app/layout.tsx` may set `window.__SUPABASE_BROWSER_ENV__` from your existing `NEXT_PUBLIC_SUPABASE_URL` and anon/publishable key (Worker `process.env` or build-inlined `env.client.generated.ts`). That name is **only** an in-page JavaScript global — **not** a GitHub or Cloudflare secret you add. Client `createClient()` reads it before falling back to the compiled bundle. After a deploy, bump the service worker cache (`public/sw.js` `CACHE_NAME`) and hard-reload if you still see old behaviour.
