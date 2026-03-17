-- Migration 001: Platform users table + auth sync trigger.
-- Run in order via Supabase Dashboard → SQL Editor. Idempotent.

-- ENUMs (skip if already exist)
DO $$ BEGIN
  CREATE TYPE public.user_tier AS ENUM ('free', 'informed', 'professional');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE public.tier_source AS ENUM ('free', 'stripe_subscription', 'stripe_one_time', 'manual_override');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE public.auth_provider AS ENUM ('email', 'magic_link', 'google', 'apple', 'samsung', 'microsoft', 'github');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  display_name        TEXT,
  avatar_url          TEXT,
  tier                public.user_tier NOT NULL DEFAULT 'free',
  tier_source         public.tier_source NOT NULL DEFAULT 'free',
  stripe_customer_id  TEXT UNIQUE,
  country_code        TEXT,
  preferred_currency  TEXT DEFAULT 'usd' CHECK (preferred_currency IN ('usd','aed','egp')),
  auth_provider       public.auth_provider DEFAULT 'email',
  is_suspended        BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_at        TIMESTAMPTZ,
  suspended_reason    TEXT,
  last_seen_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- update_updated_at helper (used by many tables)
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Sync new auth user into public.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p_currency TEXT := 'usd';
  p_country  TEXT;
  p_provider public.auth_provider := 'email';
BEGIN
  p_country := NEW.raw_user_meta_data->>'country';

  IF p_country IN ('AE','BH','KW','OM','QA','SA') THEN p_currency := 'aed';
  ELSIF p_country = 'EG' THEN p_currency := 'egp';
  END IF;

  CASE NEW.app_metadata->>'provider'
    WHEN 'google'    THEN p_provider := 'google';
    WHEN 'apple'     THEN p_provider := 'apple';
    WHEN 'samsung'   THEN p_provider := 'samsung';
    WHEN 'microsoft' THEN p_provider := 'microsoft';
    WHEN 'github'   THEN p_provider := 'github';
    WHEN 'magiclink' THEN p_provider := 'magic_link';
    ELSE p_provider := 'email';
  END CASE;

  INSERT INTO public.users (id, email, display_name, avatar_url, preferred_currency, country_code, auth_provider)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    p_currency,
    p_country,
    p_provider
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON public.users(tier);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON public.users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_country_code ON public.users(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND tier = (SELECT tier FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "users_service_role" ON public.users;
CREATE POLICY "users_service_role" ON public.users FOR ALL TO service_role
  USING (true) WITH CHECK (true);

SELECT 'Migration 001 complete: users table' AS status;
