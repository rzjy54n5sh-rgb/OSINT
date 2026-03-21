# Supabase: fix migration history (smooth path)

If `supabase db push` / `db pull` fail with **migration history does not match local files**, use the one-command repair **after** your **remote database already matches** the SQL in `supabase/migrations/` (e.g. you ran the same migrations in the SQL Editor).

## What we fixed in the repo

- **Duplicate `009`:** There were two files both versioned as `009` (`009_pipeline_metadata.sql` and `009_disputes_admin_columns.sql`). Supabase uses the filename prefix before `_` as the version ID, so that broke repair/push.
- **Resolution:** Disputes columns migration is now  
  **`20260308120000_disputes_admin_columns.sql`**  
  It sorts **after** `010_email_digest.sql` and **before** `20260311000003_*` (lexicographic order = apply order).

## One command

From the **project root**, linked project + `supabase login`:

```bash
npm run db:repair-migration-history
```

Or:

```bash
bash scripts/repair-supabase-migration-history.sh
```

This script:

1. **Reverts** remote-only history rows: `20250309100000`, `20250309100001` (removes them from the history table; does **not** undo SQL).
2. **Marks applied** every migration version in this repo (again: **no SQL run** — only updates `supabase_migrations.schema_migrations`).

Then it prints `supabase migration list` — **Local** and **Remote** should match on every row.

## After that

- `supabase db pull …` and `supabase db push` work for **new** migrations going forward.
- If the CLI ever changes the suggested list, run `supabase db pull __any_name__` and update `scripts/repair-supabase-migration-history.sh` to match the printed commands.

## When **not** to run this

- If production **does not** yet have tables/policies from `001`…`010` and the dated files — running repair will lie to the CLI; fix the database first, then repair.

## Option: baseline from remote only

If you prefer a **single** migration file from current remote schema instead, see [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair) (`db pull` after reverting conflicting remote rows). This repo standardizes on the scripted repair above when the DB already matches local SQL.
