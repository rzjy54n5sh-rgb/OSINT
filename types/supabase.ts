export interface Article {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  source_name: string | null;
  source_logo_url: string | null;
  source_type: string | null;
  published_at: string | null;
  fetched_at: string | null;
  conflict_day: number | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  sentiment: string | null;
  confidence_score: number | null;
  tags: string[] | null;
  content_json: Record<string, unknown> | null;
}

export interface NaiScore {
  id: string;
  country_code: string;
  conflict_day: number;
  expressed_score: number;
  latent_score: number;
  gap_size: number;
  category: string;
}

export interface ScenarioProbability {
  id: string;
  conflict_day: number;
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
}

export interface CountryReport {
  id: string;
  country_code: string;
  country_name: string | null;
  nai_score: number | null;
  nai_category: string | null;
  content_json: Record<string, unknown> | null;
  conflict_day: number | null;
}

export interface DisinfoClaim {
  id: string;
  claim_text: string | null;
  verdict: string | null;
  source_url: string | null;
  debunk_url: string | null;
  spread_estimate: number | null;
  published_at: string | null;
}

export interface MarketData {
  id: string;
  indicator: string | null;
  value: number | null;
  change_pct: number | null;
  unit: string | null;
  source: string | null;
  conflict_day: number | null;
}

export interface SocialTrend {
  id: string;
  region: string | null;
  country: string | null;
  platform: string | null;
  trend: string | null;
  sentiment: string | null;
  engagement_estimate: number | null;
  conflict_day: number | null;
}
