export type NAICategory = 'aligned' | 'stable' | 'tension' | 'fracture' | 'inversion';

export interface Article {
  id: string;
  title: string;
  summary: string | null;
  url: string | null;
  source_name: string;
  source_logo_url: string | null;
  source_type?: string | null;
  published_at: string;
  fetched_at: string;
  conflict_day: number | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  sentiment: string | null;
  confidence_score: number | null;
  tags: string[] | null;
  content_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CountryReport {
  id: string;
  country_code: string;
  country_name: string;
  nai_score: number | null;
  nai_category: NAICategory | null;
  content_json: Record<string, unknown> | null;
  updated_at: string;
  conflict_day: number | null;
}

export interface NAIScore {
  id: string;
  country_code: string;
  conflict_day: number;
  expressed_score: number | null;
  latent_score: number | null;
  gap_size: number | null;
  category: NAICategory | null;
  updated_at: string;
}

export interface ScenarioProbability {
  id: string;
  conflict_day: number;
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
  updated_at: string;
}

export interface DisinfoClaim {
  id: string;
  claim_text: string;
  verdict: 'TRUE' | 'FALSE' | 'MISLEADING' | 'UNVERIFIED';
  source_url: string | null;
  debunk_url: string | null;
  spread_estimate: string | null;
  published_at: string;
  created_at: string;
}

export interface MarketData {
  id: string;
  indicator: string;
  value: number | null;
  change_pct: number | null;
  unit: string | null;
  source: string | null;
  conflict_day: number | null;
  created_at: string;
}

export interface SocialTrend {
  id: string;
  region: string | null;
  country: string | null;
  platform: string | null;
  trend: string | null;
  sentiment: string | null;
  engagement_estimate: string | null;
  conflict_day: number | null;
  created_at: string;
}

export interface GeoStamp {
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  flag_emoji?: string;
}
