-- supabase/migrations/20260311000003_create_subscribers_table.sql
-- FALLBACK: If CLI is not authenticated, paste this entire block into
-- Supabase Dashboard → SQL Editor → New Query → Run

create table if not exists public.subscribers (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  source text default 'platform',  -- which page they signed up from
  subscribed_at timestamptz default now(),
  active boolean default true
);

alter table public.subscribers enable row level security;

-- Anyone can insert their own email
create policy "Anyone can subscribe"
  on public.subscribers
  for insert
  to anon
  with check (true);

-- Only service role can read (you review via dashboard)
create policy "Service role reads subscribers"
  on public.subscribers
  for select
  to service_role
  using (true);

-- No updates or deletes from anon
