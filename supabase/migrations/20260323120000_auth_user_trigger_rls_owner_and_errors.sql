-- Follow-up when "Database error creating new user" persists after hardening email handling.
-- Fixes common Supabase issues: FORCE ROW LEVEL SECURITY, wrong function owner, opaque errors.
-- Idempotent.

-- A) Inserts into public.users from SECURITY DEFINER triggers can still fail if FORCE RLS is on.
ALTER TABLE IF EXISTS public.users NO FORCE ROW LEVEL SECURITY;

-- B) Function should be owned by a superuser-equivalent role so RLS is bypassed.
ALTER FUNCTION public.handle_new_auth_user() OWNER TO postgres;

-- C) Hosted Supabase: auth pipeline may need explicit schema/table grants for auth admin role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT INSERT ON TABLE public.users TO supabase_auth_admin;
  END IF;
END $$;

-- D) Replace trigger body: same logic as 20260321120000 + clear exception text in Postgres logs / Auth.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_currency TEXT := 'usd';
  p_country  TEXT;
  p_provider public.auth_provider := 'email';
  p_email    TEXT;
BEGIN
  p_country := NEW.raw_user_meta_data->>'country';

  IF p_country IN ('AE','BH','KW','OM','QA','SA') THEN
    p_currency := 'aed';
  ELSIF p_country = 'EG' THEN
    p_currency := 'egp';
  END IF;

  CASE NEW.app_metadata->>'provider'
    WHEN 'google'     THEN p_provider := 'google';
    WHEN 'apple'      THEN p_provider := 'apple';
    WHEN 'samsung'    THEN p_provider := 'samsung';
    WHEN 'microsoft'  THEN p_provider := 'microsoft';
    WHEN 'azure'      THEN p_provider := 'microsoft';
    WHEN 'github'     THEN p_provider := 'github';
    WHEN 'magiclink'  THEN p_provider := 'magic_link';
    ELSE                 p_provider := 'email';
  END CASE;

  p_email := COALESCE(
    NULLIF(BTRIM(NEW.email), ''),
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'email', '')), ''),
    'user-' || NEW.id::text || '@placeholder.invalid'
  );

  BEGIN
    INSERT INTO public.users (
      id,
      email,
      display_name,
      avatar_url,
      preferred_currency,
      country_code,
      auth_provider
    )
    VALUES (
      NEW.id,
      p_email,
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'avatar_url',
      p_currency,
      NULLIF(p_country, ''),
      p_provider
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'handle_new_auth_user → public.users: % [SQLSTATE %]', SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Mirror auth.users into public.users. NO FORCE RLS; owner postgres; raises detailed errors.';
