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

/**
 * LEGACY `nai_scores` (Days 1-35). ARCHIVED, read-only, previous (US-referenced) method.
 * NOT comparable with NaiScoreV2. Never present these rows as current.
 */
export interface NaiScore {
  id: string;
  country_code: string;
  conflict_day: number;
  expressed_score: number;
  latent_score: number;
  gap_size: number;
  category: string;
}

/** Categories produced by public.nai_c2_category() (migration 20261006120000_nai_scores_v2.sql). */
export type NaiCategoryV2 = 'ALIGNED' | 'STABLE' | 'TENSION' | 'FRACTURE' | 'INVERSION' | 'UNSCORABLE';

/** One element of nai_scores_v2.sources (data contract). */
export interface NaiSourceV2 {
  claim: string;
  name: string;
  url: string;
  published_at: string;
  /** true = party/state source (CENTCOM, IRGC, IDF, state media …). */
  party_source: boolean;
  /** Which side of the index this source evidences: E = expressed, L = latent. */
  feeds: 'E' | 'L';
}

/**
 * `nai_scores_v2` — NAI War Posture (C2, operator ruling 2026-10-06), method_version 'war-posture-v1'.
 * E and the latent band share one party-neutral scale: 0 = immediate unconditional ceasefire,
 * 50 = conditional/ambivalent, 100 = continue/escalate hostilities.
 * gap / gap_size / category are GENERATED in Postgres — never computed client-side.
 */
export interface NaiScoreV2 {
  id: string;
  country_code: string;
  conflict_day: number;
  as_of: string;
  expressed_score: number | null;
  expressed_basis: string | null;
  latent_low: number | null;
  latent_high: number | null;
  latent_basis: string | null;
  confidence: 'high' | 'medium' | 'low';
  sources: NaiSourceV2[];
  /** E − midpoint(latent band); numeric in Postgres → may arrive as number or string. */
  gap: number | string | null;
  gap_size: number | string | null;
  category: NaiCategoryV2;
  method_version: string;
  created_at: string;
}

export interface ScenarioProbability {
  id: string;
  conflict_day: number;
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
  scenario_e: number | null;   // UAE Direct Strike — added Day 15
  updated_at?: string | null;
  // Dynamic scenarios discovered by smart detection (Day 15+)
  // stored as scenario_f, scenario_g etc. — see SCENARIO_META for labels
}

export interface CountryReport {
  id?: string;
  country_code: string;
  country_name: string | null;
  nai_score: number | null;
  nai_category: string | null;
  content_json?: Record<string, unknown> | null;
  conflict_day: number | null;
  updated_at?: string | null;
}

export interface DisinfoClaim {
  id: string;
  claim_text: string | null;
  verdict: string | null;
  source_url: string | null;
  debunk_url: string | null;
  spread_estimate: number | string | null;
  published_at: string | null;
  created_at?: string | null;
}

export interface MarketData {
  id: string;
  indicator: string | null;
  value: number | null;
  change_pct: number | null;
  unit: string | null;
  source: string | null;
  conflict_day: number | null;
  created_at: string | null;
}

export interface SocialTrend {
  id: string;
  region: string | null;
  country: string | null;
  platform: string | null;
  trend: string | null;
  sentiment: string | null;
  engagement_estimate: number | string | null;
  conflict_day: number | null;
  created_at?: string | null;
}
