-- MENA Intel Desk — reference schema for Supabase
-- Apply in Supabase SQL Editor; enable RLS on all tables.

-- Articles (live feed)
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

-- Country reports (content_json holds module data)
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

-- NAI scores (per country per day)
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

-- Scenario probabilities (A/B/C/D per day)
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

-- Disinformation claims
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

-- Market data (indicators, value, change_pct, unit, source, conflict_day)
create table if not exists public.market_data (
  id uuid primary key default gen_random_uuid(),
  indicator text not null,
  value float,
  change_pct float,
  unit text,
  source text,
  conflict_day int,
  created_at timestamptz not null default now()
);

alter table public.market_data enable row level security;
create policy "Allow read for anon" on public.market_data for select using (true);

-- Social trends (region, country, platform, trend, sentiment, engagement_estimate, conflict_day)
create table if not exists public.social_trends (
  id uuid primary key default gen_random_uuid(),
  region text,
  country text,
  platform text,
  trend text,
  sentiment text,
  engagement_estimate text,
  conflict_day int,
  created_at timestamptz not null default now()
);

alter table public.social_trends enable row level security;
create policy "Allow read for anon" on public.social_trends for select using (true);

-- Realtime: enable for articles (feed + header count)
alter publication supabase_realtime add table public.articles;
