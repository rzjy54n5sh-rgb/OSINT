-- MENA Intel Desk — initial schema (RLS + anon read on all tables)
-- Enable Realtime for articles in Dashboard: Table Editor > articles > Enable Realtime

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  url text,
  source_name text not null,
  source_logo_url text,
  source_type text,
  published_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),
  conflict_day int,
  region text,
  country text,
  lat float,
  lng float,
  sentiment text,
  confidence_score float,
  tags text[],
  content_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.articles enable row level security;
create policy "Allow read for anon" on public.articles for select using (true);

create table if not exists public.country_reports (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  country_name text not null,
  nai_score float,
  nai_category text,
  content_json jsonb,
  conflict_day int,
  updated_at timestamptz not null default now()
);

alter table public.country_reports enable row level security;
create policy "Allow read for anon" on public.country_reports for select using (true);

create table if not exists public.nai_scores (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  conflict_day int not null,
  expressed_score float,
  latent_score float,
  gap_size float,
  category text,
  updated_at timestamptz not null default now(),
  unique(country_code, conflict_day)
);

alter table public.nai_scores enable row level security;
create policy "Allow read for anon" on public.nai_scores for select using (true);

create table if not exists public.scenario_probabilities (
  id uuid primary key default gen_random_uuid(),
  conflict_day int not null unique,
  scenario_a float not null default 0,
  scenario_b float not null default 0,
  scenario_c float not null default 0,
  scenario_d float not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.scenario_probabilities enable row level security;
create policy "Allow read for anon" on public.scenario_probabilities for select using (true);

create table if not exists public.disinfo_claims (
  id uuid primary key default gen_random_uuid(),
  claim_text text not null,
  verdict text not null check (verdict in ('TRUE', 'FALSE', 'MISLEADING', 'UNVERIFIED')),
  source_url text,
  debunk_url text,
  spread_estimate text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.disinfo_claims enable row level security;
create policy "Allow read for anon" on public.disinfo_claims for select using (true);
