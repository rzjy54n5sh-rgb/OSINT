-- Migration 004: Admin users table + full immutable audit log.
-- Depends on 001 (users, update_updated_at). Idempotent.

DO $$ BEGIN
  CREATE TYPE public.admin_role AS ENUM (
    'SUPER_ADMIN','INTEL_ANALYST','USER_MANAGER','FINANCE_MANAGER','CONTENT_REVIEWER'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_action_type AS ENUM (
    'PIPELINE_TRIGGER','PIPELINE_SCHEDULE_CHANGE',
    'NAI_SCORE_OVERRIDE','COUNTRY_REPORT_REGEN',
    'RSS_SOURCE_ADD','RSS_SOURCE_EDIT','RSS_SOURCE_TOGGLE','RSS_SOURCE_DELETE',
    'ALERT_BANNER_TOGGLE','ALERT_BANNER_EDIT',
    'USER_TIER_OVERRIDE','USER_SUSPEND','USER_UNSUSPEND',
    'SUBSCRIPTION_CANCEL','SUBSCRIPTION_PAUSE','SUBSCRIPTION_REFUND',
    'API_KEY_REVOKE','API_KEY_GENERATE_TEST',
    'DISPUTE_ACCEPT','DISPUTE_REJECT',
    'PRICING_CONFIG_CHANGE','TIER_FEATURE_TOGGLE',
    'PAYMENT_REFUND_INITIATE',
    'PLATFORM_CONFIG_CHANGE','ADMIN_USER_CREATE','ADMIN_USER_DEACTIVATE',
    'ADMIN_ROLE_ASSIGN','ADMIN_ROLE_REVOKE',
    'AI_AGENT_REQUEST','AI_AGENT_CONFIRMED','AI_AGENT_REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  role            public.admin_role NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at  TIMESTAMPTZ,
  deactivated_by  UUID REFERENCES public.admin_users(id),
  created_by      UUID REFERENCES public.admin_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_bootstrap CHECK (created_by IS NOT NULL OR role = 'SUPER_ADMIN')
);

DROP TRIGGER IF EXISTS admin_users_updated_at ON public.admin_users;
CREATE TRIGGER admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL REFERENCES public.admin_users(id),
  admin_role      public.admin_role NOT NULL,
  admin_email     TEXT NOT NULL,
  action_type     public.audit_action_type NOT NULL,
  action_summary  TEXT NOT NULL,
  target_type     TEXT,
  target_id       TEXT,
  target_label    TEXT,
  before_state    JSONB,
  after_state     JSONB,
  is_ai_request   BOOLEAN NOT NULL DEFAULT FALSE,
  ai_prompt       TEXT,
  ai_proposal     TEXT,
  confirmed_by    UUID REFERENCES public.admin_users(id),
  ip_address      TEXT,
  user_agent      TEXT,
  session_id      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.get_admin_role(p_user_id UUID DEFAULT NULL)
RETURNS public.admin_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.admin_users
  WHERE user_id = COALESCE(p_user_id, auth.uid()) AND is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_has_permission(required_roles public.admin_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_admin_role() = ANY(required_roles);
$$;

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON public.admin_users(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action_type ON public.admin_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_is_ai ON public.admin_audit_log(is_ai_request) WHERE is_ai_request = TRUE;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_users_select_own_or_super" ON public.admin_users;
CREATE POLICY "admin_users_select_own_or_super" ON public.admin_users FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.get_admin_role() = 'SUPER_ADMIN'
  );
DROP POLICY IF EXISTS "admin_users_all_service" ON public.admin_users;
CREATE POLICY "admin_users_all_service" ON public.admin_users FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "admin_users_write_super" ON public.admin_users;
CREATE POLICY "admin_users_write_super" ON public.admin_users FOR ALL TO authenticated
  USING (public.get_admin_role() = 'SUPER_ADMIN')
  WITH CHECK (public.get_admin_role() = 'SUPER_ADMIN');

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select_own_or_super" ON public.admin_audit_log;
CREATE POLICY "audit_select_own_or_super" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (admin_id = (SELECT id FROM public.admin_users WHERE user_id = auth.uid() LIMIT 1) OR public.get_admin_role() = 'SUPER_ADMIN');
DROP POLICY IF EXISTS "audit_insert_service" ON public.admin_audit_log;
CREATE POLICY "audit_insert_service" ON public.admin_audit_log FOR INSERT TO service_role WITH CHECK (true);

-- Run this ONCE to create Omar as SUPER_ADMIN.
-- Replace OMAR_EMAIL with actual email before running.
-- INSERT INTO public.admin_users (user_id, email, display_name, role, created_by)
-- SELECT u.id, 'OMAR_EMAIL', 'Omar', 'SUPER_ADMIN', NULL
-- FROM public.users u WHERE u.email = 'OMAR_EMAIL'
-- ON CONFLICT (email) DO NOTHING
-- OR if users table is empty:
-- INSERT INTO public.admin_users (email, display_name, role, created_by)
-- SELECT 'OMAR_EMAIL', 'Omar', 'SUPER_ADMIN', NULL
-- WHERE NOT EXISTS (SELECT 1 FROM public.admin_users WHERE role = 'SUPER_ADMIN');

SELECT 'Migration 004 complete: RBAC admin_users + audit_log' AS status;
