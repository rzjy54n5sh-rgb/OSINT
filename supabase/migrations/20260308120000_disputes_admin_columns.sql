-- Add admin resolution columns to disputes (admin panel Accept/Reject).
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS admin_action TEXT;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS admin_action_at TIMESTAMPTZ;
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.admin_users(id);
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
