-- Migration 003: T2 (professional) programmatic API key access.
-- Depends on 001 (users, update_updated_at). Idempotent.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key_hash            TEXT NOT NULL UNIQUE,
  key_prefix          TEXT NOT NULL,
  name                TEXT NOT NULL DEFAULT 'Default Key',
  description         TEXT,
  last_used_at        TIMESTAMPTZ,
  last_used_ip        TEXT,
  request_count       BIGINT NOT NULL DEFAULT 0,
  rate_limit_per_hour INTEGER NOT NULL DEFAULT 500,
  is_revoked          BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at          TIMESTAMPTZ,
  revoked_by          UUID REFERENCES public.users(id),
  revoke_reason       TEXT,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS api_keys_updated_at ON public.api_keys;
CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.revoke_api_keys_on_downgrade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.tier = 'professional' AND NEW.tier != 'professional' THEN
    UPDATE public.api_keys
    SET is_revoked = TRUE, revoked_at = NOW(),
        revoke_reason = 'Automatic: user downgraded from professional tier'
    WHERE user_id = NEW.id AND is_revoked = FALSE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS api_keys_tier_revoke ON public.users;
CREATE TRIGGER api_keys_tier_revoke
  AFTER UPDATE OF tier ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.revoke_api_keys_on_downgrade();

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_revoked ON public.api_keys(is_revoked);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_select_own" ON public.api_keys;
CREATE POLICY "api_keys_select_own" ON public.api_keys FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "api_keys_insert_own_pro" ON public.api_keys;
CREATE POLICY "api_keys_insert_own_pro" ON public.api_keys FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (SELECT tier FROM public.users WHERE id = auth.uid()) = 'professional'
    AND NOT (SELECT is_suspended FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "api_keys_update_revoke_only" ON public.api_keys;
CREATE POLICY "api_keys_update_revoke_only" ON public.api_keys FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND is_revoked = TRUE);

DROP POLICY IF EXISTS "api_keys_service_role" ON public.api_keys;
CREATE POLICY "api_keys_service_role" ON public.api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

SELECT 'Migration 003 complete: api_keys' AS status;
