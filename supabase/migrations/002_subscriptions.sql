-- Migration 002: Stripe subscriptions + payment log.
-- Depends on 001 (users, user_tier, update_updated_at). Idempotent.

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','canceled','paused','incomplete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('succeeded','pending','failed','refunded','partially_refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE public.payment_type AS ENUM ('subscription','one_time_report');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_customer_id      TEXT NOT NULL,
  stripe_price_id         TEXT,
  stripe_product_id       TEXT,
  plan                    public.user_tier NOT NULL,
  status                  public.subscription_status NOT NULL DEFAULT 'incomplete',
  currency                TEXT NOT NULL DEFAULT 'usd' CHECK (currency IN ('usd','aed','egp')),
  amount                  INTEGER,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at             TIMESTAMPTZ,
  trial_start             TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.sync_user_tier_from_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('active', 'trialing') THEN
    UPDATE public.users SET tier = NEW.plan, tier_source = 'stripe_subscription'
    WHERE id = NEW.user_id;
  ELSIF NEW.status IN ('canceled', 'past_due') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = NEW.user_id AND s.id != NEW.id
        AND s.status IN ('active', 'trialing')
    ) THEN
      UPDATE public.users SET tier = 'free', tier_source = 'free'
      WHERE id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_tier_sync ON public.subscriptions;
CREATE TRIGGER subscription_tier_sync
  AFTER INSERT OR UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_tier_from_subscription();

CREATE TABLE IF NOT EXISTS public.payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subscription_id           UUID REFERENCES public.subscriptions(id),
  stripe_payment_intent_id  TEXT UNIQUE,
  stripe_invoice_id         TEXT,
  stripe_charge_id          TEXT,
  type                      public.payment_type NOT NULL DEFAULT 'subscription',
  amount                    INTEGER NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'usd',
  status                    public.payment_status NOT NULL DEFAULT 'pending',
  description               TEXT,
  report_type               TEXT,
  report_day                INTEGER,
  refunded_amount           INTEGER DEFAULT 0,
  refunded_at               TIMESTAMPTZ,
  refund_reason             TEXT,
  stripe_event_id           TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS payments_updated_at ON public.payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.grant_report_access_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'one_time_report' AND NEW.status = 'succeeded' THEN
    UPDATE public.users
    SET tier = 'informed', tier_source = 'stripe_one_time'
    WHERE id = NEW.user_id AND tier = 'free';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_report_access ON public.payments;
CREATE TRIGGER payment_report_access
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.grant_report_access_on_payment();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON public.subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON public.subscriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi ON public.payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments(created_at DESC);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subs_select_own" ON public.subscriptions;
CREATE POLICY "subs_select_own" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "subs_service_role" ON public.subscriptions;
CREATE POLICY "subs_service_role" ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own" ON public.payments FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "payments_service_role" ON public.payments;
CREATE POLICY "payments_service_role" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);

SELECT 'Migration 002 complete: subscriptions + payments' AS status;
