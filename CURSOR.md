# Cursor / AI — project facts (do not invent env names)

Use this file with **`PROJECT.md`** as the only sources for environment variable and runtime bridge names. **Do not** introduce alternate `window.*` globals or secret names without updating both docs and code.

## Canonical names (copy-paste from GitHub / Cloudflare)

| Name | Role |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (preferred for browser client) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Optional alternative public key (if your project uses it) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (metadata, redirects) |
| `SUPABASE_SERVICE_KEY` | **Preferred** service_role JWT for server admin (`middleware`, `utils/supabase/admin.ts`, `/api/generate-briefing`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Accepted alias** — same value as Dashboard “service_role”; read after `SUPABASE_SERVICE_KEY` |
| `SUPABASE_URL` | Used by **Python pipelines** (GitHub Actions), not always the same as Next’s `NEXT_PUBLIC_SUPABASE_URL` (often identical value) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Deploy / Workers |
| `ANTHROPIC_API_KEY`, etc. | As listed in `PROJECT.md` §2 for APIs |

## Code helpers (single source of behavior)

- **Service role resolution:** `resolveSupabaseServiceRoleKey()` in `lib/env/service-key.ts` — tries `SUPABASE_SERVICE_KEY` then `SUPABASE_SERVICE_ROLE_KEY`.
- **Browser public Supabase env:** `resolveSupabasePublicUrl()` / `resolveSupabasePublicKey()` in `lib/supabase/resolve-public-env.ts`.
- **Injected runtime object:** constant `INJECTED_NEXT_PUBLIC_GLOBAL` = `'__NEXT_PUBLIC_RUNTIME__'` in `lib/env/injected-next-public.ts`. Layout assigns `window[INJECTED_NEXT_PUBLIC_GLOBAL]` with **object keys = env var names** above.

## Rules for edits

1. Never add a second pattern like `window.__SOME_OTHER_SUPABASE__` — extend `__NEXT_PUBLIC_RUNTIME__` only.
2. Never rename `SUPABASE_SERVICE_KEY` in workflows without updating `middleware`, `admin.ts`, `generate-briefing`, and `PROJECT.md`.
3. After `wrangler types`, if `SUPABASE_SERVICE_KEY` drops out of `cloudflare-env.d.ts`, re-add it to `Cloudflare.Env` / `ProcessEnv` pick list or restore from git — see `PROJECT.md`.
