-- Run in Supabase → SQL Editor when "Database error creating new user" persists
-- after 20260321120000_harden_handle_new_auth_user.sql.

-- 1) Confirm trigger exists on auth.users
SELECT tgname AS trigger_name, tgenabled AS enabled, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND NOT tgisinternal
ORDER BY tgname;

-- 2) Function owner + SECURITY DEFINER (prosecdef = true means SECURITY DEFINER)
SELECT p.proname,
       p.prosecdef AS security_definer,
       r.rolname   AS function_owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname = 'handle_new_auth_user';

-- 3) FORCE ROW LEVEL SECURITY blocks inserts unless role bypasses RLS
SELECT c.relname,
       c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'users';

-- 4) public.users columns (spot NOT NULL without default)
SELECT column_name, is_nullable, column_default, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- 5) Unique constraints / indexes on public.users (duplicate email breaks INSERT)
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.users'::regclass
  AND contype IN ('u', 'p');

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'users';

-- 6) RLS policies on public.users
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy
WHERE polrelid = 'public.users'::regclass;
