# Backups, restore drill, scheduler and watchdog (WS4)

Supabase Free has **no backups**. 24,757 articles were lost in 2026 and could not be recovered.
This page explains what now protects the data, how to switch it on, and how to restore.

## What runs

| Piece | Where | When (UTC) | What it does |
|---|---|---|---|
| `db-backup.yml` → `backup` | GitHub Actions | 01:17 nightly | `pg_dump` 17 of `public` (schema + data) and `auth` (schema + data) from **one snapshot**, through the Supabase **session pooler** (IPv4). Records exact row counts. Encrypts with `age`. Uploads to R2 `daily/`, plus `monthly/<YYYY-MM>/` for the first backup of each month. Keeps 30 daily and 12 monthly. |
| `db-backup.yml` → `restore-test` | GitHub Actions | Sun 03:43 | Downloads the newest backup, checks its SHA-256, decrypts it, restores it into a throwaway `postgres:17`, and requires **every table's row count to equal the manifest**. |
| `workers/scheduler` (`mena-intel-scheduler`) | Cloudflare Cron Triggers | `*/30`, `20 5` | Calls GitHub `workflow_dispatch` for collect-markets (every 30 min), collect-articles (hourly) and scenario-daily (05:20). The GitHub `schedule:` triggers stay as a fallback. Each workflow's `gate` job skips a late scheduled run that a dispatched run already covered. |
| `job_heartbeats` + `job-watchdog` | Supabase (pg_cron + pg_net) | every 15 min | Each collector and backup run appends a heartbeat. The watchdog sends one Telegram message per late job, at most once every 6 h. |

Script: `.github/workflows/scripts/db_backup.sh` (`dump`, `upload`, `fetch-latest`, `restore-verify`).

## Switching it on (Omar, once)

The PR body lists every secret with its exact scope. The order is:

1. **R2 bucket.** Cloudflare dashboard → R2 → Create bucket (e.g. `mena-intel-backups`), with no public access.
   Settings → Object lifecycle rules: add `daily/` → delete after 31 days, and `monthly/` → delete after 400 days.
   The script also prunes, but the rules are the guarantee.
2. **R2 API token.** R2 → Manage API tokens → Create: **Object Read & Write**, scoped to that bucket only.
   Copy the Access Key ID and the Secret Access Key.
3. **age key pair** (on the Mac): `brew install age && age-keygen -o mena-backup.key`.
   The public key (`age1…`) goes into the repo variable `BACKUP_AGE_RECIPIENT`.
   The whole private key file content goes into the secret `BACKUP_AGE_KEY`, which only the restore drill uses.
   Keep an **offline copy** of `mena-backup.key` (password manager plus paper). Without it, the backups cannot be read.
4. **Pooler URL.** Supabase → Connect → **Session pooler**, then copy the URI:
   `postgresql://postgres.qmaszkkyukgiludcakjg:<DB_PASSWORD>@aws-<N>-<region>.pooler.supabase.com:5432/postgres`.
   Copy the host from the dialog, because `<N>` is a pooler cluster index. Do not use the direct host (IPv6) or port 6543 (transaction mode).
5. Add the GitHub secrets, then run **Actions → DB Backup → Run workflow → both**. Check that the step summary shows `mismatches=0`.
6. **Scheduler:** create the `GH_DISPATCH_TOKEN` secret, then run **Actions → Deploy Scheduler Worker**.
   Cron changes take up to 15 minutes to reach the network.
7. **Heartbeats and watchdog:** apply `supabase/migrations/20261010090000_job_heartbeats.sql`, then `20261010090100_job_watchdog.sql`.
   Then, in the SQL editor:
   `select vault.create_secret('<bot token>', 'telegram_bot_token', 'WS4 watchdog');`
   `select vault.create_secret('<chat id>', 'telegram_chat_id', 'WS4 watchdog');`

## Restoring (disaster recovery)

```bash
# 1. Get a backup: R2 dashboard download, or
R2_ACCOUNT_ID=… R2_BUCKET=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… \
  .github/workflows/scripts/db_backup.sh fetch-latest ./restore
# 2. Decrypt and unpack (needs the offline private key)
age -d -i mena-backup.key -o b.tar ./restore/mena-db-*.tar.age && tar -xf b.tar   # manifest.json public.dump auth.dump
```

**Into a NEW Supabase project.** Supabase owns the `auth` DDL, so restore only auth *data*:

```bash
NEW="postgresql://postgres.<new-ref>:<pw>@aws-<N>-<region>.pooler.supabase.com:5432/postgres"
# auth data FIRST: public.users has a foreign key to auth.users
pg_restore --data-only --file=auth-data.sql auth.dump                         # users, identities, …
psql "$NEW" --single-transaction -v ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' --file auth-data.sql     # as in Supabase's restore guide
pg_restore --dbname="$NEW" --no-owner --schema=public public.dump          # schema + data, RLS, functions
```

Then check row counts against `manifest.json` (`row_counts`).
Then re-create the Vault secrets, the pg_cron jobs (`deduplicate-market-data`, `job-watchdog`) and the Edge Function secrets, and repoint `NEXT_PUBLIC_SUPABASE_URL`, the keys and the Worker secrets.
The dump does not contain extension-schema objects (`extensions`, `cron`, `vault`) or Storage objects.

**Rehearsal in a scratch Postgres 17** (this is exactly what the weekly drill does):
`BACKUP_AGE_KEY="$(cat mena-backup.key)" db_backup.sh restore-verify ./restore/mena-db-….tar.age postgresql://…/emptydb`

## Failure modes

| Symptom | Meaning / action |
|---|---|
| Job green with notice "DB backup skipped" | One or more secrets are missing. The notice names them. |
| `cannot connect to the source database` | The pooler is unreachable or `DB_POOLER_URL` is wrong (session pooler, port 5432?). No partial file is uploaded. |
| `pg_dump N is older than server M` | Supabase upgraded Postgres. Bump `postgresql-client-17` in `db-backup.yml`. |
| `upload failed` / `uploaded size … !=` | R2 error or wrong token. Nothing is pruned when the upload fails. |
| `could not delete …` warning | The token cannot delete. The lifecycle rules still expire old objects. |
| Drill `MISMATCH` / `checksum mismatch` / `decrypt failed` | P1: the backup is not restorable. Investigate before the next night. |
