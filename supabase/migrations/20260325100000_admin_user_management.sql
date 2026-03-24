-- Admin User Management: status tracking, event log, notes
-- Idempotent — safe to re-run

-- ── users table additions ──
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_source TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_spent_usd NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lifetime_value_usd NUMERIC(10,2) DEFAULT 0;

-- ── subscriptions table additions ──
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pause_start TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pause_end TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS pause_reason TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS cancellation_feedback TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS discount_code TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS discount_pct INTEGER;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS mrr_usd NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_payment_attempt TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS sub_notes TEXT;

-- ── user_events table ──
CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  performed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_events_user_id_idx ON public.user_events(user_id);
CREATE INDEX IF NOT EXISTS user_events_created_at_idx ON public.user_events(created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_type_idx ON public.user_events(event_type);

-- ── user_notes table ──
CREATE TABLE IF NOT EXISTS public.user_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  note TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_notes_user_id_idx ON public.user_notes(user_id);

-- ── RLS ──
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

-- Service role policies (service role bypasses RLS but we add explicit policies)
DROP POLICY IF EXISTS service_role_user_events ON public.user_events;
CREATE POLICY service_role_user_events ON public.user_events FOR ALL USING (true);

DROP POLICY IF EXISTS service_role_user_notes ON public.user_notes;
CREATE POLICY service_role_user_notes ON public.user_notes FOR ALL USING (true);
