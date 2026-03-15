-- supabase/migrations/20260311000004_create_contact_inquiries_table.sql
-- FALLBACK: Paste into Supabase Dashboard → SQL Editor → New Query → Run

create table if not exists public.contact_inquiries (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null,
  organization text,
  inquiry_type text not null,  -- 'subscription', 'media', 'research', 'technical', 'other'
  message text not null,
  submitted_at timestamptz default now()
);

alter table public.contact_inquiries enable row level security;

create policy "Anyone can submit an inquiry"
  on public.contact_inquiries
  for insert
  to anon
  with check (true);

create policy "Service role reads inquiries"
  on public.contact_inquiries
  for select
  to service_role
  using (true);
