# Login Errors: Supabase Log Fixes

If you get **"Something went wrong"** on login and Supabase logs show these errors, run the fixes below in **Supabase Dashboard → SQL Editor**.

---

## 1. `record "new" has no field "app_metadata"`

**Cause:** The auth trigger uses `app_metadata`, but Postgres `auth.users` stores this in `raw_app_meta_data`.

**Fix:** Run this migration (replaces the trigger with the correct column):

```
supabase/migrations/20260324120000_auth_users_raw_app_meta_data.sql
```

Or copy its contents and run in SQL Editor. After this, sign-up and login should work.

---

## 2. `admin_users violates check constraint "admin_bootstrap"`

**Cause:** `admin_users` requires: `created_by IS NOT NULL OR role = 'SUPER_ADMIN'`. Rows with `role = 'INTEL_ANALYST'` (or any non-SUPER_ADMIN) must have `created_by` set.

**Fix:** Either give the first admin `SUPER_ADMIN` with `created_by` null, or set `created_by` for existing admins.

```sql
-- Option A: If llaham@gmail.com should be SUPER_ADMIN (first admin):
UPDATE public.admin_users
SET role = 'SUPER_ADMIN', created_by = NULL
WHERE email = 'llaham@gmail.com'
  AND created_by IS NULL;

-- Option B: If there is already a SUPER_ADMIN, set created_by for llaham:
UPDATE public.admin_users au
SET created_by = (SELECT id FROM public.admin_users WHERE role = 'SUPER_ADMIN' AND is_active = TRUE LIMIT 1)
WHERE au.email = 'llaham@gmail.com'
  AND au.created_by IS NULL
  AND au.role != 'SUPER_ADMIN';
```

Then link `user_id` so they can log in as admin:

```sql
UPDATE public.admin_users au
SET user_id = u.id
FROM public.users u
WHERE u.email = 'llaham@gmail.com' AND au.email = 'llaham@gmail.com';
```

---

## 3. `invalid input syntax for type bigint: "LOW (21/100)"`

**Cause:** The `collect_social.py` pipeline writes `engagement_estimate` as strings like `"LOW (21/100)"`. If `social_trends.engagement_estimate` is typed as `bigint`, inserts or queries fail. This can also cause the app to hang on sign-in if any page loads social data.

**Fix:** Run the migration in Supabase Dashboard → SQL Editor. Copy-paste the contents of **`scripts/run-social-trends-fix.sql`** and run it.

Or, if you have `DATABASE_URL` (Supabase → Settings → Database → Connection string URI):

```bash
npm run db:fix-social-trends
```

---

## 4. `current transaction is aborted, commands ignored until end of transaction block`

**Cause:** This is a cascade from one of the errors above. Fix the primary error first; new requests will work once it is resolved.

---

## Order of fixes

1. Run **20260324120000_auth_users_raw_app_meta_data.sql** (fixes app_metadata).
2. Fix **admin_bootstrap** with the Option A or B SQL above.
3. Fix **engagement_estimate** type if you use social_trends.
4. Link **admin_users.user_id** as in `docs/supabase-auth-create-user-error.md` for each admin.

Then retry login.
