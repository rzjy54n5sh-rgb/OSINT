# Independent verification (Wave 2): the scenario registry, report registry and stories migrations

**Verifier:** an independent agent that did not write these files and treated them as suspect. **Date:** 2026-10-06, Day 221.

**What was checked:** the five migrations in `/tmp/claude-0/arch/` and the ADR at `/tmp/claude-0/adr_dynamic_model.md`.

**Safety:** production was read only, through SELECT and catalog queries via `execute_sql` on `qmaszkkyukgiludcakjg`. Nothing was written to production, nothing was committed to the repo, and no paid API was called.

**Engine:** I installed PostgreSQL **17.11** locally from PGDG. Production runs 17.6. Every result below comes from 17.11 unless a line says otherwise.

**Evidence files** are all in `/tmp/claude-0/verify/`:

| Purpose | Files |
|---|---|
| Fixtures | `01_fixture_live_mirror.sql` (built by `gen_mirror.py`) |
| Attack suites | `40_helpers.sql`, `41_attacks.sql`, `42_lifecycle.sql`, `43_privs.sql`, `44_fixed_extra.sql`, `45_churn.sql` |
| Build scripts | `build.sh` (architect migrations only), `build_fixed.sh` (architect migrations plus my fixes) |
| Outputs | `*_output.txt` and `parity_*.txt` |

**Corrected SQL** is in `/tmp/claude-0/arch_fixed/`. The architect's files are untouched.
- `20261007100350_weekly_digest_reclassify.sql`: apply after 100300 and before 100400.
- `20261007100500_verifier_fixes.sql`: apply last.

## Verdict: **APPLY-AFTER-FIXES**

The core design holds up:
- The architect's 104 tests pass on PostgreSQL 17.
- The Day 221 import is exact, and it aborts when the data does not match.
- The compatibility view matches the old table in both directions.
- Current readers return identical results.
- No CHECK constraint or policy lets a NULL through.
- Privileges are correct, apart from one PostgreSQL 17 detail (`MAINTAIN`).

It is not ready to apply as written. I found **8 functional failures**. Each one either breaks a live writer or the backfill, lets an "invented" number through despite rule R1, or overrides an operator decision. All 8 are closed by the two files in `arch_fixed/`. With the fixes applied:
- The architect's suite passes 103 of 104. The one failure, S33, changes by design: approval now has to go through `scenario_promote_candidate()`.
- All of my attack cases are rejected or work as intended (see the "after fixes" column).

---

## Results table

PASS means it held. FAIL means it broke or leaked. PARTIAL means it holds with a caveat.

| # | Attack | Result | Evidence (command → real output) | Required fix |
|---|---|---|---|---|
| 1a | Full suite on Postgres 17 | **PASS** | `PGPORT=55417 bash tests/run_validation.sh` → `PostgreSQL 17.11 … APPLIED ×6 … PASS 104` (`verify/pg17_validation_output.txt`) | none |
| 1b | Explicit `BEGIN`/`COMMIT` vs how the tool wraps migrations | **PASS (with a caveat)** | (i) Wrapped in an outer `BEGIN … COMMIT` (how `apply_migration` and the CLI behave): every file applied, with `WARNING: there is already a transaction in progress` and `WARNING: there is no transaction in progress`, giving 131 `scenario_daily` rows and 32 compat rows. (ii) Sent as a single multi-statement query: applied with no warnings, same counts. (iii) Applied as a **non-superuser** owner role (production `postgres` has `rolsuper=false` and `rolbypassrls=true`): all 5 files plus both fix files OK, and the `reports` bucket was created. | Caveat: the file's own `COMMIT` ends the tool's outer transaction early, so the tool's migration-history insert runs outside the atomic unit. Remove `BEGIN;`/`COMMIT;` from the files when applying through `apply_migration` or the CLI. This is optional and low risk. |
| 1c | Supabase Storage bucket insert | **PASS by inspection; execution UNTESTED** | Live: `storage.buckets.type` is NOT NULL with default `'STANDARD'`. The only triggers are a name-length check and a delete guard. `has_table_privilege('postgres','storage.buckets','INSERT')=true`. `postgres` has BYPASSRLS. | none |
| 2a | Claude daily task (5 types per day, `source 'claude-daily'`) | **PASS** | W01: inserting 5 rows for Day 222 with no provenance gives `5 rows, provenance=contemporaneous`. The task runs at 06:51 Cairo, which is 03:51 UTC in summer and 04:51 UTC in winter. That is before the 06:00 UTC cutoff. | The writer must upsert with `on_conflict=conflict_day,report_type`. W02: an upsert on `(day,type,country_code)` with `EG` where a NULL row exists raises `duplicate key … "daily_briefings_day_type_uniq"`. W02b: the same upsert on `(conflict_day,report_type)` gives `re-run/EG/contemporaneous`. A run that slips past 06:00 UTC is labelled reconstructed. |
| 2a′ | Daily task PATCHes `country_reports` | **PASS** | `grep country_reports\|market_data\|social_trends\|disinfo_claims\|nai_scores *.sql` finds no reference in any migration. | none |
| 2a″ | **`/api/generate-briefing`** (a live route behind the `/briefings/generate` page, using the service key) | **FAIL** | W03: inserting `report_type 'country', country_code 'EG', quality 'auto', source 'community'` violates `foreign key constraint "daily_briefings_report_type_fkey"`, so the route returns HTTP 500. Even if a `country` type were registered, the route is designed for many countries per day, and the new `UNIQUE (conflict_day, report_type)` index allows only one. Production has never stored a `country` row. | Code fix (Claude): retire the route. It writes model output, generated on the user's own Anthropic key, into the official briefings table with `source_ids: []`, which conflicts with the "no invented claim" and "no metered AI" rulings. If it must stay, register per-country types (`country_eg` and so on). The DB rejection itself is correct. |
| 2b | Weekly digests vs the daily General backfill | **FAIL** | Live: 25 rows titled `Retrospective Digest - Days a-b` sit at `report_type='general'` on their **start** day (36, 43, … 214), and Day 155 holds a recovered daily General. W04: 26 days collide in Days 36–218 (`36,43,50,57,64,71,85,91,98,112,119,126,133,140,147,151,155(recovered daily),158,…,214`). W04b: inserting the Day 36 General raises `duplicate key … daily_briefings_day_type_uniq`. Without the new index, the old key (`…country_code`, where NULLs are distinct) would have **silently** created two `general` rows per day, and `.maybeSingle()` readers (`hooks/useBriefing.ts`, `app/briefings/[day]/[type]`) would then error. | `arch_fixed/20261007100350_weekly_digest_reclassify.sql` registers `general_weekly` and moves each digest to `report_type='general_weekly'`, sets `period_start_day`/`period_end_day` from the title, and sets `conflict_day = period_end_day` (the ADR contract). It aborts if the row count changes or if two digests end on the same day. After the fix: X04 gives `25 general_weekly rows; sample 42 period 36-42`, and X05 inserts all 182 missing Generals (Day 155 skipped), giving `183 general rows, max per day 1`. Code fix: the UI needs a label for `general_weekly`. |
| 2c | GitHub collectors (articles with ignore-duplicates, market_data, social_trends, disinfo_claims) | **PASS** | Every collector uses `SUPABASE_SERVICE_KEY` (`collect_*.py`, lines 14–34). W09: a service_role insert into `articles` is OK. W09b: an anon insert gives `permission denied` (intended). market_data, social_trends and disinfo_claims are untouched. | none. Side note: `articles` has no unique key on `url`, so `ignore-duplicates` only ever deduplicates on the random `id`. Live has 0 duplicate URLs, so a `UNIQUE (url)` index can be added (optional; it protects story counts). |
| 2d | Nightly pg_cron `deduplicate-market-data`, and other legitimate deletes | **PARTIAL → FAIL on article_sources** | Live `cron.job` contains only jobid 2 (`deduplicate-market-data`, run as postgres). W06 runs that exact command after the migrations and leaves `5 rows left (one per indicator/day)`, so it works. No migration touches `market_data`. Repo grep of deletes: `admin-sources` DELETEs `article_sources` by id. W07 shows that this fails once an outlet references the source (`violates foreign key constraint "outlets_article_source_id_fkey"`). `admin-users` deletes `user_notes`, which is unaffected. Article updates were also checked: W08 applies the DB-audit F5 timestamp correction to a clustered article, and the next `story_merge` then raises `story_articles snapshot … must equal articles row`. | F7: change the `outlets.article_source_id` FK to `ON DELETE SET NULL`. F8: compare snapshots only on INSERT. Both are in 100500. After the fix, W07 and W08 are accepted. The "never delete" revokes break nothing that deletes today. |
| 2e | Admin approval of `detected_scenarios` | **FAIL (desync)** | The repo has no admin UI write path. Approval happens through the dashboard or SQL. W10: a direct `UPDATE … status='approved'` (service_role) gives `banner active=true, title=New Scenario F Detected, scenarios rows for F=0`. W10b: a later `scenario_promote_candidate` then fails with `is approved, not candidate`. The banner announces a scenario the registry does not have, and it can never be registered. | F9: a guard makes `status→approved` possible only inside `scenario_promote_candidate()`. The function is patched so that `app.lifecycle_txn` stays on across its update. The rejection path stays open. After the fix: W10 gives `approve candidates with scenario_promote_candidate()`, X02 gives `detected=approved scenarios=1 banner=true`, and X03 gives `rejected`. The architect's 100000 §11 trigger fix itself works. |
| 3 | Existing readers give identical results | **PASS** | `30_reader_parity.sql` (14 queries taken from `app/`, `hooks/`, `api-scenarios`, `send-digest`, `warm_kv_cache.py` and `stage4_reports.py`) runs as anon, authenticated and service_role against `v_before` and `v_after`. Both databases use the live-mirror fixture, which matches production counts: 32 scenario days, 201 briefings with the same day/type/cc/source/quality/generated_at shape (reproducing the live 75/126 provenance split), and 584 articles. `diff` gives **IDENTICAL ×3**. With the fixes, the only differences are the intended digest move (`db_days`, `db_list36`). Sync, happy path: a Day 222 core run reaches `scenario_probabilities` with a deterministic id, and a re-run updates the same id. compat==table holds (0/0). After 100200, a direct legacy write is refused. | Applies only after the fixes: once A–D membership changes, the legacy shape stops updating (see 6g). Rows labelled reconstructed (the W1 scenario history backfill) never reach the legacy readers. That is by design and needs reader phase 2 before it shows on the site. |
| 4a | CHECK constraints or policies that evaluate to NULL | **PASS** | All 49 CHECKs that touch a nullable column were listed and reviewed (`verify/checks_nullable.txt`). Every nullable reference goes through `IS [NOT] NULL`, `IS DISTINCT FROM`, `coalesce`, `num_nonnulls` or a helper wrapped in coalesce. All policies are `true` or a status test on a NOT NULL column. | none |
| 4b | Inserts that must be rejected | **PASS** | A01 sum 99: rejected (`sum to 99.000`). A02 sum 101: rejected. A03 NULL in the core group: rejected (`has no number`). A04 incomplete set: rejected (`D have no published reading`). A05/A05b future Day 222: rejected (`in the future`). A06 backdated without the import flag: recorded_at is forced to now (`2026-10-06/reconstructed`). A08 retire by job: rejected. A09 inactive admin: rejected. A10 active→retired: rejected. A12/12b/12d empty, same-host or unlabelled sources: rejected. A21 a past-day brief labelled contemporaneous: rejected. | none |
| 4c | Backdating or inventing through a side door | **FAIL** | A07/A07b: `set_config('app.registry_import','on',true)` in a SQL session, as postgres (the Claude MCP role) or as service_role, gives `recorded_at 2026-09-15 / contemporaneous`. A07c: the same flag accepts a **future** Day 260. A11b: service_role plus `app.lifecycle_txn` retires C with **no lifecycle event**. A13: a market-anchored row for Day 210 cites a Day 200 run. A14: an `operator-override` row on an **input** override is published at 63. A15: an `operator-override` row with value 90 is published against a payload of `E=10` for Day 150. | F14c: import flags may only re-record a row already published in `scenario_probabilities`, with its exact `updated_at`. F14b: the future-day check always applies. F14a: a deferred trigger requires a lifecycle event in the same transaction as any status change. F1/F2: a linkage guard (run day, method and override must match; an operator row must equal its output override). After the fix, A07, A07c, A11b, A13, A14, A15, X07 and X10 are all rejected. |
| 4d | Stories and alerts provenance | **FAIL** | A18: geolocation "stated" by the quote `"Shape"` for the place `Tehran` is accepted. A19: Press TV (registered `party`) is labelled `independent` in story_articles, giving `independent_outlet_count=1`. A20: a `scenario_candidate` alert built from two **party** outlets that label themselves independent is accepted. A12c: `dawn.com` and `epaper.dawn.com` count as 2 independent hosts at birth (minor). | F11: `geo_quote` must contain the first part of `geo_place`. F12: a party label must equal the outlet registry. F13: candidate hosts must resolve through `outlet_aliases` to an `independent` outlet. All three are in 100500. A12c is not fixed (needs registrable-domain logic); the operator check covers it. |
| 5 | RLS and privileges | **PASS (one minor gap)** | `43_privs.sql`: anon and authenticated hold no INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER on any new or touched table. Mutating functions (`scenario_*`, `report_type_*`, `story_*`) have `anon_x=f, auth_x=f`. P01–P04 give `permission denied`. The only SECURITY DEFINER function is `activate_new_scenario_alert`, with `search_path=""`. **authenticated can SELECT** every table and view the public site needs (`auth_sel=t`). The only exceptions are `intel_alerts`, `report_type_events`, `v_report_documents_needed` and `v_story_counts_check`, which are private by design. The daily_briefings anon-only lesson is therefore not repeated. | Gap (PostgreSQL 17): anon and authenticated keep **MAINTAIN** on `articles`, `daily_briefings`, `detected_scenarios` and `scenario_probabilities` (also true on live today). F15 revokes it. Live **already has** `daily_briefings_authenticated_select`, so 100300's `daily_briefings_authenticated_read` is a duplicate; F16 drops it conditionally. P07: the owner (postgres) can still `TRUNCATE` the retention tables, because row triggers do not see TRUNCATE; F18 adds `BEFORE TRUNCATE` guards. Low severity: anon can read `scenario_overrides.reason` and `admin_id` (the admin table's uuid, not the auth uuid). |
| 6a | 13 vs 14 consecutive days below 10% | **PASS** | L01: 13 days at 9% gives streak 13, `no transition`. L02: the 14th day gives `X:active->fading(threshold_streak)`. | none |
| 6b | Exactly 10.0% and recovery | **PASS** | L03: 10.000 gives `fading->active(recovered)`, streak 0. 9.999 counts as below (L04). Note: values are published as Hamilton-rounded integers, so a raw 9.5 is published as 10 and counts as not below. The operator should confirm whether "below 10%" means the published value or `probability_raw`. | ruling only |
| 6c | A missing day breaks the streak | **PASS** | L04: Day 218 missing gives `streak(220)=2`, no transition. L04b: a computed but **unpublished** 5% row on 218 still breaks the streak (2). | none |
| 6d | Two runs on the same day; tick run twice | **PASS** | L05: runs at 5 then 15. Only `15.000` is published, and the streak is 0. L05b: `no transition \| no transition`. | none |
| 6e | Retroactive or old-day tick | **FAIL** | L06c: Y faded on Day 203 and recovered on Day 204 (12%). Re-running `tick(203)` gives `Y:active->fading(threshold_streak)` even though Day 204 is ≥10%. Any re-run or backfill tick re-fades recovered scenarios. | F4: a job transition is refused if later published readings or later events exist, and the tick skips such scenarios. After the fix, L06c gives `no transition -> active`. |
| 6f | Core member fades; only the operator retires; retired is terminal | **PASS** | L08: C at 5% for 14 days gives `C:active->fading`. L08b: retirement by the job is refused. Retirement by the operator succeeds: `retired_day=222`, which is the first day with no reading, because C has a Day 221 reading. L08d/e/f: retired→active, retired→fading and a direct UPDATE are all refused (`terminal`). L08g: publishing C on its `retired_day` is refused (`outside their life`). | none |
| 6g | **Core membership change while the legacy readers are live** | **FAIL** | L08h: after C retires, Day 222 with A+B+D=100 is published, yet the legacy table and compat view show `NO legacy row \| NO compat row`. The compat view requires all 4 of A–D, so **every reader of the site freezes at Day 221**. L11: core member G is born on Day 224 **after** Day 224 was published. The function accepts it, Day 224 then violates the completeness invariant (`G have no published reading`), and every later write to that day fails (L11b). | F5/F6: an exclusive-group birth or retirement is refused while `scenario_daily_b_sync_legacy` exists (that is, until ADR phase 2), and a core birth must come after the group's last published day. **Decision for the lead and operator:** this blocks retiring C, and promoting F into core, until readers move to the registry. The alternative is to emit `scenario_c = 0` in the compat view after retirement, which shows a number nobody published. |
| 6h | E (independent, no market) stays unmeasured and never fades | **PASS (gap: no explicit flag)** | L07: E published NULL on Days 199–221 gives streak 0, `no transition`, `active`. `v_scenario_lifecycle` showed only `latest_probability:null`. | F19: adds `measurement_state` (`measured`/`unmeasured`/`no_reading`). X09 gives `unmeasured`. |
| 6i | Overlapping overrides; override vs job | **FAIL** | L10: two output overrides on the same day: the second wins and both records are kept, which is OK. **L09b: after an operator override on Day 223, the job's `scenario_publish_run` silently re-publishes its own run** (`A=30(market-anchored-v1)…`), undoing the operator's numbers. | F3: `scenario_publish_run(run, p_supersede_override default false)` refuses to replace an operator override unless the flag is set. After the fix: X06 is refused and X06b (flag true) succeeds. |
| 7 | Day 221 import exact, aborts on mismatch | **PASS** | Exact case: Day 221 gives `A=23 raw 23.0, B=44 raw 44.0, C=5 raw 5.5, D=28 raw 27.5, E=NULL`, all contemporaneous, with recorded_at equal to the live `updated_at 17:54:25.380189Z`. `run.inputs == scenario_d221.json inputs: True 14`. `python3 -I scripts/compute_d221.py mk out.json` gives an output **identical** to `scenario_d221.json`, and the code sha256 `db31cd79…` matches `code_ref`. Mismatched legacy row (D=29/B=43): `ERROR: scenario_probabilities Day 221 is not 23/44/5/28/NULL`, with 0 runs written. An extra legacy Day 222: `ERROR: compatibility view differs … (1 missing, 0 extra; days 222)`, rolled back. | Operational: 100100 must be regenerated if any operator session writes another legacy day before it is applied. |
| 8 | Size, about 0.6–0.7 MB per day | **PASS (method is sound; notes)** | Live per-row size: articles 638 B, comparable to the architect's synthetic rows. `articles` holds **16.2 MB of heap for 584 live rows** (about 97% free space left after the 24,757 historical deletes; reused before the file grows). Hourly-churn simulation (`45_churn.sql`, 24 statements per day, 10 days): stories **166 KB/day** after VACUUM against the architect's 138, 78 KB/day when compact. story_articles 108 KB/day. `v_story_counts_check` is empty. The design load of 400 articles/day is **5× the live 78/day**. | Notes: (1) the daily_briefings Arabic edition (`sections_ar`) is missing from the estimate. Live briefs average 12.7 KB per row, so AR adds about 0.06 MB/day. (2) `idx_briefings_day_type` duplicates the new unique index; drop it (optional). (3) At live rates the realistic total is about 0.15–0.2 MB/day. The 500 MB cap is not at risk. PDF in Storage remains the 1 GB risk the ADR names. |

---

## Required changes

All of these are in `/tmp/claude-0/arch_fixed/`. Both files are scratch-tested on PostgreSQL 17.11, both as superuser and as a non-superuser owner.

### Blocking: must be in the same release as the architect's migrations
1. **F20 — weekly digests.** Apply `20261007100350_weekly_digest_reclassify.sql` between 100300 and 100400. Key statement:
   ```sql
   UPDATE public.daily_briefings
      SET report_type='general_weekly',
          period_start_day = substring(title FROM 'Days ([0-9]+)-')::int,
          period_end_day   = substring(title FROM '-([0-9]+)$')::int,
          conflict_day     = substring(title FROM '-([0-9]+)$')::int
    WHERE report_type='general' AND title ~ '^Retrospective Digest - Days [0-9]+-[0-9]+$';   -- prod: 25 rows
   ```
   The backfill must skip Day 155, which is already a General brief. A code fix must label `general_weekly` in the UI.
2. **F1/F2 — linkage guard on `scenario_daily`.** A new `BEFORE INSERT` trigger `scenario_daily_linkage`:
   - `run.conflict_day = NEW.conflict_day`, `run.method_version = NEW.method_version`, and `run.override_id IS NOT DISTINCT FROM NEW.override_id`;
   - for `operator-override` rows: `o.kind='output'`, `o.valid_from_day = NEW.conflict_day`, `o.group_code = scenario.group_code`, and `(o.payload #>> ARRAY['values',code])::numeric = NEW.probability`.
3. **F14a/b/c — stop the GUC side doors.**
   - Replace `scenario_recorded_at_guard()`. Under an import flag, the row must equal an existing `scenario_probabilities(conflict_day, updated_at)`. Otherwise `recorded_at := now()`. The future-day check applies in every case.
   - Add the deferred constraint trigger `scenarios_event_required`: any status change needs a `scenario_lifecycle_events` row for `(scenario, to_status)` with `created_at = now()` in the same transaction.
4. **F3 — operator authority.** `DROP FUNCTION scenario_publish_run(uuid)` and replace it with `scenario_publish_run(uuid, p_supersede_override boolean DEFAULT false)`. Without the flag it raises when the day carries a published `operator-override`.
5. **F4 — stale ticks.**
   - A `sle_staleness` trigger on `scenario_lifecycle_events` refuses a job event when published readings exist after the as-of day. It refuses any event that predates an existing later event.
   - `scenario_lifecycle_tick` skips such scenarios.
6. **F5/F6 — exclusive-group membership.** `scenarios_exclusive_membership` refuses core births or retirements while the phase-1 sync trigger exists, and a core `born_day` must be after the group's last published day. Before Day ~234, when C becomes fade-eligible, the operator must choose: keep this block, or have the compat view emit 0 for a retired legacy member.
7. **F9 — approval desync.** `detected_scenarios_approval_guard` allows `status→approved` only inside `scenario_promote_candidate()`, which is patched to keep `app.lifecycle_txn` on across the `detected_scenarios` update.
8. **W03 — code, not SQL.** Retire `/api/generate-briefing` and the `/briefings/generate` page, or register per-country types, before 100300. Otherwise that page fails with HTTP 500.
9. **Apply 100200 (legacy guard) together with 100000/100100.** No active workflow writes `scenario_probabilities`: the active workflows run only `collect_*`, `warm_kv_cache` and `migrate_admin_tables`, and the daily task forbids writing it. Delaying 100200 only leaves a window in which a manual legacy write would diverge from the registry without anyone noticing.

### Before the W4 cluster job ships (in 100500, not blocking 100000–100300)
- **F7:** `outlets.article_source_id … ON DELETE SET NULL`. Keeps the `admin-sources` delete working.
- **F8:** `story_articles_guard` checks snapshots only on INSERT. Keeps the article timestamp correction compatible with merges.
- **F11:** `stories_geo_place`: `strpos(lower(geo_quote), lower(split_part(geo_place, ',', 1))) > 0`.
- **F12:** a non-unknown `party_status` must equal `outlets.party_status`.
- **F13:** a `scenario_candidate` alert needs ≥2 hosts that resolve via `outlet_aliases(host)` to an `independent` outlet.

### Hygiene (in 100500)
- **F15:** `REVOKE MAINTAIN ON scenario_probabilities, detected_scenarios, daily_briefings, articles FROM anon, authenticated;` This syntax only exists in PostgreSQL 17, which production runs.
- **F16:** drop 100300's `daily_briefings_authenticated_read` when the live `daily_briefings_authenticated_select` exists.
- **F18:** `BEFORE TRUNCATE … EXECUTE FUNCTION reject_mutation()` on all 19 retention tables and on `scenario_probabilities`.
- **F19:** `v_scenario_lifecycle.measurement_state`.
- Optional:
  - drop the redundant `idx_briefings_day_type`;
  - add `UNIQUE (url)` on `articles` (0 duplicates live);
  - strip `BEGIN;`/`COMMIT;` from the files when applying through `apply_migration`.

### The architect's suite after the fixes
103 of 104 pass. **S33** fails because it approves through a direct `UPDATE`, which is now refused on purpose. Update S33 to call `scenario_promote_candidate()`; X02 already proves the banner still fires.

### Who fixes what
- **Claude, SQL:** everything above.
- **Claude, code:**
  - retire `generate-briefing`;
  - the daily task upserts on `(conflict_day, report_type)`;
  - a `general_weekly` UI label;
  - the W1 backfill skips Day 155;
  - the W2 job uses `p_supersede_override` only on an operator decision.
- **Cursor:** none. Per the 2026-10-05 decision there is no more Cursor.

## UNTESTED
- The exact behaviour of Supabase `apply_migration` and the CLI. I simulated both the outer-transaction and single-query modes locally but did not run them against production.
- The real `storage.buckets` insert. Privileges, defaults, RLS and triggers were checked read-only; the insert was not executed.
- PostgreSQL 17.6 exactly. I tested 17.11; no 17.x behaviour change affects these objects. The 100500 fix file uses `REVOKE MAINTAIN`, so it does not run on 16.
- PostgREST HTTP byte parity. I proved row and JSON parity in SQL for each role, but did not issue HTTP calls.
- The Claude daily task's actual transport (PostgREST or `execute_sql`) and its exact payload. I tested its column set as both service_role and postgres.
- The Edge Functions (`api-scenarios`, `send-digest`) and the KV warmer at runtime. Their queries were checked in SQL only.
- Jobs that do not exist yet: `cluster.yml`, `topics_daily.yml`, `render_docs.yml`, `scenario_daily.yml`.
- Storage document sizes and the egress quota.
- Whether "below 10%" means the published integer or `probability_raw`. This needs an operator ruling.
