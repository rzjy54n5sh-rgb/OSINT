-- Harden auth → public.users sync: avoid NOT NULL / empty email failures when creating users
-- from Dashboard or OAuth (Supabase error: "Database error creating new user").
-- Idempotent: replaces public.handle_new_auth_user.

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

  -- NOT NULL email: empty string must not slip through (COALESCE alone keeps '').
  p_email := COALESCE(
    NULLIF(BTRIM(NEW.email), ''),
    NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'email', '')), ''),
    'user-' || NEW.id::text || '@placeholder.invalid'
  );

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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'After INSERT on auth.users, mirror row into public.users. Safe email fallback for Dashboard / phone / empty metadata.';
