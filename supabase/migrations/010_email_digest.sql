-- Daily digest opt-in + send audit (Prompt 4)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_digest BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.email_digest IS
  'User has opted in to daily conflict digest email. Default true.';

CREATE TABLE IF NOT EXISTS public.digest_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  conflict_day INTEGER,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  trigger TEXT
);

ALTER TABLE public.digest_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "digest_sends_service" ON public.digest_sends;
CREATE POLICY "digest_sends_service" ON public.digest_sends
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.digest_sends IS
  'Audit log for daily digest Edge Function sends (service role only).';
