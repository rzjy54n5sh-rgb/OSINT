-- market_data: indicators, value, change_pct, unit, source, conflict_day
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

-- social_trends: region, country, platform, trend, sentiment, engagement_estimate, conflict_day
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
