-- Migration 006: Smart scenario detection + platform alert banners.
-- Depends on 001, 004 (update_updated_at, admin_users). Idempotent.

DO $$ BEGIN
  CREATE TYPE public.scenario_detection_status AS ENUM ('candidate','approved','rejected','superseded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.detected_scenarios (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_day          INTEGER NOT NULL,
  label                 TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description_en        TEXT NOT NULL,
  description_ar        TEXT,
  new_actor             TEXT,
  new_instrument        TEXT,
  trigger_sources       JSONB NOT NULL DEFAULT '[]',
  source_count          INTEGER NOT NULL DEFAULT 0,
  initial_probability   DOUBLE PRECISION,
  acting_party_framing  TEXT,
  affected_party_framing TEXT,
  status                public.scenario_detection_status NOT NULL DEFAULT 'candidate',
  approved_by           UUID REFERENCES public.admin_users(id),
  approved_at           TIMESTAMPTZ,
  rejected_by           UUID REFERENCES public.admin_users(id),
  rejected_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  detected_by           TEXT NOT NULL DEFAULT 'claude_pipeline',
  detection_model       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conflict_day, label)
);

-- Ensure columns exist if table was created elsewhere
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS status public.scenario_detection_status NOT NULL DEFAULT 'candidate';
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS description_en TEXT;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS description_ar TEXT;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS trigger_sources JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS source_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS acting_party_framing TEXT;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS affected_party_framing TEXT;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.admin_users(id);
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.admin_users(id);
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS detected_by TEXT NOT NULL DEFAULT 'claude_pipeline';
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS detection_model TEXT;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS detected_scenarios_updated_at ON public.detected_scenarios;
CREATE TRIGGER detected_scenarios_updated_at
  BEFORE UPDATE ON public.detected_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.platform_alerts (
  key           TEXT PRIMARY KEY,
  title         TEXT,
  message       TEXT,
  message_ar    TEXT,
  alert_type    TEXT NOT NULL DEFAULT 'info'
    CHECK (alert_type IN ('info','warning','critical','new_scenario','pipeline_failure','breaking')),
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  priority      INTEGER NOT NULL DEFAULT 0,
  value         JSONB,
  activated_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES public.admin_users(id)
);

DROP TRIGGER IF EXISTS platform_alerts_updated_at ON public.platform_alerts;
CREATE TRIGGER platform_alerts_updated_at
  BEFORE UPDATE ON public.platform_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Ensure columns exist (if table was created elsewhere with fewer columns)
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS message_ar TEXT;
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS alert_type TEXT DEFAULT 'info';
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS value JSONB;
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.platform_alerts ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.admin_users(id);

INSERT INTO public.platform_alerts (key, title, message, alert_type, is_active, priority) VALUES
  ('new_scenario_alert', NULL, NULL, 'new_scenario', FALSE, 100),
  ('pipeline_failure', NULL, NULL, 'pipeline_failure', FALSE, 90),
  ('breaking_news', NULL, NULL, 'breaking', FALSE, 80),
  ('hormuz_status', NULL, NULL, 'warning', FALSE, 70),
  ('market_alert', NULL, NULL, 'warning', FALSE, 60),
  ('platform_maintenance', NULL, NULL, 'info', FALSE, 50)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.activate_new_scenario_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE public.platform_alerts
    SET is_active = TRUE, activated_at = NOW(),
        title = 'New Scenario ' || NEW.label || ' Detected',
        message = NEW.title,
        value = jsonb_build_object(
          'scenario_label', NEW.label,
          'scenario_id', NEW.id,
          'conflict_day', NEW.conflict_day,
          'new_actor', NEW.new_actor,
          'new_instrument', NEW.new_instrument
        )
    WHERE key = 'new_scenario_alert';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scenario_approval_alert ON public.detected_scenarios;
CREATE TRIGGER scenario_approval_alert
  AFTER UPDATE OF status ON public.detected_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.activate_new_scenario_alert();

ALTER TABLE public.detected_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "detected_scenarios_public_approved" ON public.detected_scenarios;
CREATE POLICY "detected_scenarios_public_approved" ON public.detected_scenarios FOR SELECT TO anon, authenticated
  USING (status = 'approved');
DROP POLICY IF EXISTS "detected_scenarios_service" ON public.detected_scenarios;
CREATE POLICY "detected_scenarios_service" ON public.detected_scenarios FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.platform_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_alerts_public_active" ON public.platform_alerts;
CREATE POLICY "platform_alerts_public_active" ON public.platform_alerts FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);
DROP POLICY IF EXISTS "platform_alerts_service" ON public.platform_alerts;
CREATE POLICY "platform_alerts_service" ON public.platform_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

SELECT 'Migration 006 complete: detected_scenarios + platform_alerts' AS status;
SELECT COUNT(*) AS alert_keys FROM public.platform_alerts;
