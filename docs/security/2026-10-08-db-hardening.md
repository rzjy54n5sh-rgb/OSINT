# Database security hardening — 2026-10-08

- **Migration:** `supabase/migrations/20261008090000_security_hardening.sql` (idempotent, one transaction, preflight + post-condition asserts).
- **Target:** Supabase `qmaszkkyukgiludcakjg` (Postgres 17).
- **Status when this file was written:** prepared and tested on a replica of the live schema (identical ACL fingerprint), **not applied**. Merging the PR that adds it does **not** apply it: no workflow runs migrations on push (`run-migration.yml` is `workflow_dispatch` only and runs an unrelated script; `deploy.yml` only builds and deploys the Worker).
- **Rollback:** `docs/security/2026-10-08-db-hardening-rollback.sql`.

## What changes and why

| § | Change | Fixes |
|---|---|---|
| 1 | `anon` and `authenticated` lose INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on every public table and view, and every sequence privilege (UPDATE on the identity sequences allowed `setval`). | Audit 2026-10-07 P1 #1 |
| 2 | Sensitive tables (`payments`, `admin_audit_log`, `pipeline_runs`, `social_analysis`, `strategic_assessments`, `user_events`, `user_notes`, `intel_alerts`, `report_type_events`, two internal views) get no grant at all. `users`, `admin_users`, `api_keys` and `subscriptions` keep only what the app reads (own row through RLS; `api_keys.key_hash` hidden). | P1 #1 |
| 3 | **Paid columns.** `nai_scores_v2` (`latent_low`, `latent_high`, `latent_basis`, `gap`, `gap_size`, `category`, `sources`) and `country_reports.content_json` are no longer readable by the API roles. They are served by two `SECURITY DEFINER` RPCs that recompute the caller's tier in SQL: `viewer_nai_v2(p_day, p_country, p_limit, p_ascending, p_method)` and `viewer_country_report(p_code)`. No JWT = free tier; a JWT whose `role` claim is not `authenticated` = free tier (even with a `sub`); an unknown / NULL tier gets no paid feature (fails closed). | verify_phase2 F5: one `curl` with the public key returned every paid War Posture value |
| 4 | `report_documents`: only the 8 catalog columns `v_briefing_catalog` needs (no `storage_path`, `sha256`, …). | P2 #8 |
| 5 | `get_admin_role(uuid)` / `admin_has_permission(...)` are no longer executable by signed-in users (a free user could ask "what role does uuid X have"). The three RLS policies that used them are rewritten or dropped. | P2 #9, advisor 0029 |
| 6 | `subscribers`, `contact_inquiries`, `disputes`: column-limited INSERT, shape CHECKs, `unique(lower(email))`; INSERT policies cover `anon` and `authenticated` (signed-in visitors' forms were rejected before). | P2 #10 |
| 7 | Explicit service-only policy on `social_analysis` / `strategic_assessments`. | advisor 0008 |
| 8 | Default privileges: future tables created by `postgres` in `public` are not auto-granted to the API roles. **Every new public table now needs an explicit `GRANT SELECT … TO anon, authenticated`.** | defence in depth |

`service_role` and `postgres` are untouched: collectors, the daily build, admin pages (`createAdminClient()`) and Edge Functions (`serviceClient()`) keep working.

### RPC contract (what the app relies on)

`viewer_nai_v2` returns the `nai_scores_v2` row shape plus `latent_access`, `gap_access` (booleans for the caller) and `hidden_latent_source_count`. When the caller lacks the feature, the paid columns are `NULL`, L-feeding sources are removed from `sources`, and `category` is `NULL` unless it is `UNSCORABLE` (always disclosed). Ordered by `conflict_day DESC` unless `p_ascending`; `p_limit` capped at 5000 (PostgREST still caps responses at 1000 rows).

`viewer_country_report` returns one row per country (latest): `country_code, country_name, conflict_day, updated_at, has_access, content_json` — `content_json` only when `has_access`.

PostgREST quirk: a column used in a filter on an RPC result must also be in its `select`; the app uses the `p_day` / `p_country` parameters instead.

## App changes (PR `sec/db-hardening-app`)

Every read that touched a paid column calls the RPC first and falls back to the old `.from()` query **only** when PostgREST answers `PGRST202` (function not found) — `lib/supabase/rpc-fallback.ts`. Any other error is surfaced, never retried against the (then denied) table.

| Where | Change |
|---|---|
| `lib/nai-v2.ts` | `getNaiV2Day` / `getNaiV2CountryLatest` use `viewer_nai_v2`. `toNaiV2View` combines the app's tier check with the RPC's `latent_access` / `gap_access`, keeps a NULL (locked) category locked instead of rendering it as UNSCORABLE, uses `hidden_latent_source_count`, and exposes `gapLocked`. Covers `/`, `/nai`, `/countries`, `/countries/[slug]`, `/api/viewer/nai`, `/api/viewer/country/[code]`. |
| `lib/country-report.ts` | `viewer_country_report` reads for one country / all countries. |
| `app/countries/[slug]/page.tsx`, `app/api/viewer/country/[code]/route.ts` | Narrative via the RPC; shown only when the app's tier check **and** `has_access` agree. |
| `app/analytics/page.tsx` | `viewer_nai_v2(p_ascending, p_limit 1000)` with the plotted columns. |
| `app/warroom/page.tsx` | **Operator ruling 2026-10-07: paid War Posture details are locked everywhere for visitors who are not entitled.** Before this PR `/warroom` showed the latent band, gap, category and paid narrative to everyone. It now reads only through the RPCs (redacted for the session's JWT); before the migration it never reads paid columns from the browser — War Posture comes from `/api/viewer/nai` (server-side tier check) and a signed-in visitor's narrative from `/api/viewer/country/[code]`. Locked fields show "Informed tier" / a paywall chip. |
| `/disinfo`, `/warroom` disinfo panel | `scope_status`: in-scope claims by default, `?scope=all` adds unreviewed (labelled), out-of-scope never shown; ordered `published_at DESC NULLS LAST, created_at DESC`. |
| `utils/supabase/server.ts`, `utils/supabase/middleware.ts`, `app/(platform)/account/page.tsx` | Explicit column lists instead of `select('*')` on `users` / `subscriptions` (`lib/user-profile.ts`), so a follow-up migration can hide admin-only columns of a user's own row. |
| `AccountClient.tsx` | Removed the "Daily conflict digest" toggle: it wrote `users.email_digest`, which does not exist live (migration `010_email_digest` never applied), so it always failed. |
| `components/CommandHeader.tsx`, `hooks/useViewerTier.ts` | `onAuthStateChange` work deferred with `setTimeout`. auth-js runs the callback while holding its auth lock and the callback awaited `getSession()` → deadlock: with a stored session **every** browser Supabase call on the page hung, so signed-in visitors never unlocked anything client-side. Reproduced on the live site before this change (session cookie present → 0 Supabase requests, lock held forever). |
| `components/ReactionBar.tsx`, `components/disinfo/DisinfoDisputeForm.tsx`, `lib/dispute-url.ts` | The new `disputes_content_chk` requires `https?://` URLs. Both dispute forms now add `https://` when no scheme was typed, reject other schemes / malformed links client-side with a message, send `article_url` only when it passes the CHECK (else NULL), and show the insert error instead of a false "submitted". |
| `lib/tier.ts` | `tierHasFeature` fails closed: only `professional` gets `pro_access`; anonymous / unknown tier values get the free tier. Mirrors `viewer_has_feature` (`ELSE false`). |
| `hooks/useViewerTier.ts`, `components/CommandHeader.tsx` | One shared `users` + `admin_users` lookup per page (`resolveViewerProfile`), and the duplicate `INITIAL_SESSION` reload is skipped: signed-in /warroom made 12 tier requests, now 2. |
| `supabase/functions/stripe-webhook` | Returns **503** (and logs) instead of 200 when `STRIPE_WEBHOOK_SECRET` / `STRIPE_SECRET_KEY` is unset, so Stripe retries instead of dropping the event. Signature check unchanged. Not deployed by merging. |

## Deploy order

1. **Merge and deploy the app PR** (Deploy workflow on push to `main`). With the RPCs absent every read takes the table fallback, so the site renders exactly as before — except `/warroom`, which now locks paid fields for non-entitled visitors (ruling 2026-10-07).
2. **Deploy the `stripe-webhook` Edge Function** (`supabase functions deploy stripe-webhook`) when convenient; independent of the migration.
3. **Apply the migration** as `postgres`. The file carries its own `BEGIN; … COMMIT;`, so it is all-or-nothing even under autocommit:
   `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261008090000_security_hardening.sql`
   (SQL editor: paste the whole file as one batch. Under `--single-transaction` or a tool that wraps its own transaction, the inner `BEGIN` only raises a WARNING.) See CLAUDE.md "Supabase MCP destructive-statement confirmation" gotcha for the operator's direct connection. It prints a NOTICE for any CHECK left `NOT VALID`; live had 0 violating rows on 2026-10-07.
4. **Purge / wait out the ISR cache** (pages revalidate within 15 min; nothing breaks in between because the old HTML already held only free values).
5. **Verify** with the publishable key (no JWT):
   - `GET /rest/v1/nai_scores_v2?select=latent_low,gap,category&limit=1` → `401/42501`
   - `GET /rest/v1/country_reports?select=content_json&limit=1` → `401/42501`
   - `POST /rest/v1/rpc/viewer_nai_v2 {"p_day":<latest>}` → rows with `latent_low:null, gap:null, latent_access:false`
   - `/`, `/nai`, `/countries`, `/countries/ir`, `/warroom`, `/analytics` render War Posture; re-run the Supabase security advisor.

**Never apply the migration before the app deploy**: the old code's `select('*')` on `nai_scores_v2` is denied after it, and `/nai`, `/countries`, `/`, `/warroom`, `/analytics` would lose War Posture data (ISR pages built in that gap stay blank for up to 15 min).

## Rollback

Run `docs/security/2026-10-08-db-hardening-rollback.sql` as `postgres` (`psql "$DB_URL" -v ON_ERROR_STOP=1 -f …`; it carries its own `BEGIN; … COMMIT;`). On the replica it restored the exact pre-migration ACL fingerprint and test results. Kept on purpose: CHECKs that were already present (`NOT VALID`) and got validated, and the pre-existing `subscribers_email_lower_key` index. Rolling back the database alone is safe once this app PR is deployed: the RPCs disappear and the app falls back to the table reads automatically.

The rollback restores a privilege **snapshot of 2026-10-07**; tables created after that date need their grants re-checked.

## Follow-ups (not in this change)

- Narrow `users` / `subscriptions` to column grants (the app now selects explicit columns).
- `eschatology_tracker`, `disinfo_claims`, legacy `nai_scores` are fully readable while their features are tier-gated in `tier_features` — operator decision.
- Rate limiting for the anon insert tables (Turnstile or an edge rule).
- `auth_leaked_password_protection` (Auth dashboard setting).
- `send-digest` also filters on the missing `users.email_digest`.
