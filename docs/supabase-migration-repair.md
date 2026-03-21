# Supabase: migration repair & `db pull`

When `supabase migration list` shows different versions **Local** vs **Remote**, `db push` and `db pull` will fail until the remote history table matches your local `supabase/migrations/` files.

## Your project’s current mismatch

From `supabase migration list` (linked project):

| Situation | Versions |
|-----------|----------|
| **Only on remote** | `20250309100000`, `20250309100001` |
| **Only in local files** | `001`–`010`, `20260311000003`, `20260311000004`, `20260321120000`, `20260323120000`, `20260324120000`, `20260325000000` |

You also have **two files** with version `009`:

- `009_pipeline_metadata.sql`
- `009_disputes_admin_columns.sql`

Supabase treats the version as the prefix before `_`; both are `009`, which confuses repair/push. **Rename one** to a unique timestamp (e.g. `20260309100000_disputes_admin_columns.sql`) before relying on migration repair long term.

---

## Option A — Repair remote history (no schema dump)

Use this when the **live database already matches** what your local migration files would create (e.g. you applied the same SQL via Dashboard / SQL Editor), and you only need the history table fixed.

**If you skip or mis-order this while the DB is missing objects, you will break future `db push`.**

1. (Recommended) Fix the duplicate `009` by renaming one migration file to a unique version, then re-run:

   ```bash
   cd /path/to/OSINT
   supabase migration list
   ```

2. Run the repairs Supabase suggests (from a failed `db pull` / `db push`), in order:

   ```bash
   supabase migration repair --status reverted 20250309100000
   supabase migration repair --status reverted 20250309100001
   supabase migration repair --status applied 001
   supabase migration repair --status applied 002
   supabase migration repair --status applied 003
   supabase migration repair --status applied 004
   supabase migration repair --status applied 005
   supabase migration repair --status applied 006
   supabase migration repair --status applied 007
   supabase migration repair --status applied 008
   supabase migration repair --status applied 009
   supabase migration repair --status applied 009
   supabase migration repair --status applied 010
   supabase migration repair --status applied 20260311000003
   supabase migration repair --status applied 20260311000004
   supabase migration repair --status applied 20260321120000
   supabase migration repair --status applied 20260323120000
   supabase migration repair --status applied 20260324120000
   supabase migration repair --status applied 20260325000000
   ```

   After you rename the second `009` file, replace the **two** `009` lines with a single `009` and one line for the **new** version (e.g. `20260309100000`).

3. Confirm:

   ```bash
   supabase migration list
   ```

   Local and Remote columns should align for every row.

4. Then `db pull` / `db push` should work for **new** migrations only.

**Flags:** add `--linked` if you use multiple targets; default is linked project.

---

## Option B — `db pull` as a new baseline (replace local history)

Use this when you want **one migration file** that matches **current remote schema**, and you’re okay resetting migration history (per [Supabase docs](https://supabase.com/docs/reference/cli/supabase-migration-repair)).

1. **Back up** `supabase/migrations/` and your database.

2. Remove remote-only history (the two `20250309` rows), **or** align local files first — same idea as Option A step 2 for those two versions.

3. Typical “clean slate” flow from docs:

   - Delete or archive conflicting **local** migration files until history matches what you want.
   - `supabase migration repair <version> --status reverted` for remote rows you’re abandoning.
   - Run:

     ```bash
     supabase db pull <timestamp>_remote_schema
     ```

   - Answer **Y** when prompted to update the remote migration history if that matches your intent.

`db pull` writes schema into `supabase/migrations/`; **auth** and **storage** are often excluded unless you pass `--schema auth,storage`.

---

## Quick reference

| Command | Purpose |
|--------|---------|
| `supabase migration list` | See Local vs Remote |
| `supabase migration repair <version> --status reverted` | Remove a row from remote history (does not roll back SQL) |
| `supabase migration repair <version> --status applied` | Record a version as applied **without** running the file |
| `supabase db pull [name]` | Introspect remote → new migration file; needs history compatible or repaired first |

---

## Regenerating the exact repair script

From the project root:

```bash
supabase db pull __will_fail__
```

The CLI prints the suggested `migration repair` lines for your repo; use that output if filenames/versions change.
