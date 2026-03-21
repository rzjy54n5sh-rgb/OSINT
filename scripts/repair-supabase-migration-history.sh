#!/usr/bin/env bash
# Aligns the LINKED Supabase project's migration history with this repo's
# supabase/migrations/*.sql files — WITHOUT running migration SQL.
#
# Prerequisites:
#   - supabase link (project ref)
#   - Logged in: supabase login
#   - Your REMOTE database schema must already match these migrations (e.g. you
#     applied the same SQL via Dashboard). Otherwise you will corrupt history.
#
# Usage (from repo root):
#   bash scripts/repair-supabase-migration-history.sh
#   # or: npm run db:repair-migration-history

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Repairing linked project migration history (repo: $ROOT)"
echo ""

revert() {
  echo "+ supabase migration repair $1 --status reverted --linked"
  supabase migration repair "$1" --status reverted --linked
  echo ""
}

apply() {
  echo "+ supabase migration repair $1 --status applied --linked"
  supabase migration repair "$1" --status applied --linked
  echo ""
}

# Drop orphan remote rows (not represented in this repo)
revert 20250309100000
revert 20250309100001

# Record local migrations as applied (no SQL executed)
apply 001
apply 002
apply 003
apply 004
apply 005
apply 006
apply 007
apply 008
apply 009
apply 010
apply 20260308120000
apply 20260311000003
apply 20260311000004
apply 20260321120000
apply 20260323120000
apply 20260324120000
apply 20260325000000

echo "==> Done. Verify with: supabase migration list"
supabase migration list
