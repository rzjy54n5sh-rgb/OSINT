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
