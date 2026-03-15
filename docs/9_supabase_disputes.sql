-- Disputes table for ReactionBar submissions (factual dispute with source URL)
-- Run in Supabase SQL Editor. RLS: anon can insert, only service_role can read.

create table if not exists public.disputes (
  id uuid default gen_random_uuid() primary key,
  article_id text not null,
  article_url text,
  claim_text text not null,
  source_url text not null,
  submitted_at timestamptz default now()
);

-- Allow anyone to insert (anonymous users via anon key)
alter table public.disputes enable row level security;

create policy "Anyone can submit a dispute"
  on public.disputes
  for insert
  to anon
  with check (true);

-- Only service role can read (you review via Supabase dashboard)
create policy "Service role reads disputes"
  on public.disputes
  for select
  to service_role
  using (true);
