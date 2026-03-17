# Phase 2 — Database migrations verification

Run each migration in **Supabase Dashboard → SQL Editor** in order: **001 → 002 → 003 → 004 → 005 → 006 → 007 → 008**.

After each file, confirm the final line shows the expected status (e.g. `Migration 001 complete: users table`).

## Verification checklist (all must pass before Phase 3)

| Check | Command | Expected |
|-------|--------|----------|
| 001 | `SELECT COUNT(*) FROM public.users;` | 0 (table exists) |
| 002 | `SELECT COUNT(*) FROM public.subscriptions;` | 0 |
| 003 | `SELECT COUNT(*) FROM public.api_keys;` | 0 |
| 004 | `SELECT COUNT(*) FROM public.admin_users;` | 0 |
| 005 | `SELECT COUNT(*) FROM public.tier_features;` | 18 |
| 005 | `SELECT COUNT(*) FROM public.platform_config;` | 26+ |
| 006 | `SELECT COUNT(*) FROM public.platform_alerts;` | 6 |
| 007 | `SELECT COUNT(*) FROM public.article_sources;` | 26 |
| 008 | `SELECT get_current_conflict_day();` | Correct day number |

## Omar bootstrap (run once after 004)

In **004_rbac.sql** there is a commented block at the end. Run this **once** after migrations, with your real email:

```sql
INSERT INTO public.admin_users (user_id, email, display_name, role, created_by)
SELECT u.id, 'YOUR_EMAIL@example.com', 'Omar', 'SUPER_ADMIN', NULL
FROM public.users u WHERE u.email = 'YOUR_EMAIL@example.com'
ON CONFLICT (email) DO NOTHING;
```

If `public.users` is still empty (no one has signed up yet), you can create the first admin with `user_id` NULL:

```sql
INSERT INTO public.admin_users (email, display_name, role, created_by)
SELECT 'YOUR_EMAIL@example.com', 'Omar', 'SUPER_ADMIN', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.admin_users WHERE role = 'SUPER_ADMIN');
```

## Final verification (copy-paste in SQL Editor)

Run these four queries. All must pass before Phase 3:

```sql
SELECT get_current_conflict_day();   -- must return today's day number
SELECT COUNT(*) FROM public.tier_features;  -- must return 18
SELECT COUNT(*) FROM public.article_sources; -- must return 26
SELECT * FROM public.admin_users;           -- must show Omar as SUPER_ADMIN
```

- **get_current_conflict_day()** = (today’s date − 2026-02-28) + 1 (integer).
- **tier_features** = 18 rows.
- **article_sources** = 26 rows.
- **admin_users** = at least one row with Omar, `role` = `SUPER_ADMIN`.
