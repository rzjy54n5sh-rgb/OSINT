# “Database error creating new user” (Supabase Auth)

We **cannot** log into your Supabase project from here. Fix it in your project using the steps below.

**TL;DR:** In Supabase **SQL Editor**, run `supabase/migrations/20260321120000_harden_handle_new_auth_user.sql`, then retry creating the user (Dashboard or app **Create account** on `/login`).

## Likely cause

Supabase creates a row in `auth.users`, then a **trigger** (`on_auth_user_created` → `public.handle_new_auth_user`) inserts into `public.users`. If that `INSERT` fails (often **`email` NULL or empty**), Auth shows *Database error creating new user*.

The same trigger runs for **Authentication → Add user**, **Sign up** on the site, **OAuth**, and **magic link** (first-time user).

## Fix (recommended)

1. Open **Supabase Dashboard** → **SQL Editor**.
2. Run the migration file in the repo:
   - `supabase/migrations/20260321120000_harden_handle_new_auth_user.sql`  
   Or use **CLI**: `supabase db push` (if this repo is linked to the project).

3. Try **Authentication → Users → Add user** again (email + password, confirm email if your project requires it).

## See the real error (if it still fails)

- **Dashboard** → **Reports** (or **Logs**) → **Postgres** / **Database** — look for errors at the time you click “Create user”.
- **SQL Editor**:

```sql
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND NOT tgisinternal;
```

## Temporary workaround (emergency only)

If you must unblock **before** fixing the trigger, you can disable the trigger (users will **not** appear in `public.users` until you backfill):

```sql
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
-- create user in Dashboard, then:
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
```

After that, insert into `public.users` manually for that `auth.users.id` or fix the function and re-enable.

## Link `admin_users.user_id`

After the user exists in **Authentication** and `public.users`, run:

```sql
UPDATE public.admin_users au
SET user_id = u.id
FROM public.users u
WHERE u.email = 'your@email.com'
  AND au.email = 'your@email.com';
```
