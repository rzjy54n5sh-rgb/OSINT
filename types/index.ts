// Tier system
export type UserTier = 'free' | 'informed' | 'professional';
export type AdminRole =
  | 'SUPER_ADMIN'
  | 'INTEL_ANALYST'
  | 'USER_MANAGER'
  | 'FINANCE_MANAGER'
  | 'CONTENT_REVIEWER';

// Auth
export interface User {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  tier: UserTier;
  tier_source: string;
  stripe_customer_id?: string;
  country_code?: string;
  preferred_currency: 'usd' | 'aed' | 'egp';
  auth_provider: string;
  is_suspended: boolean;
  last_seen_at?: string;
  created_at: string;
  updated_at: string;
}

// Subscriptions
export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id?: string;
  plan: UserTier;
  status: string;
  currency: string;
  amount?: number;
  current_period_start?: string;
  current_period_end?: string;
  trial_start?: string;
  trial_end?: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  report_type?: string;
  report_day?: number;
  created_at: string;
}

// API Keys
export interface ApiKey {
  id: string;
  user_id: string;
  key_prefix: string;
  name: string;
  description?: string;
  last_used_at?: string;
  request_count: number;
  rate_limit_per_hour: number;
  is_revoked: boolean;
  revoked_at?: string;
  expires_at?: string;
  created_at: string;
}

// Intelligence data
export interface NaiScore {
  country_code: string;
  conflict_day: number;
  expressed_score: number;
  /** Expressed delta vs previous conflict day (all tiers; null if no prior row). */
  delta?: number | null;
  latent_score?: number;
  gap_size?: number;
  category?: string;
  velocity?: string;
  velocity_delta?: number;
  updated_at?: string;
  _tier_note?: string;
}

export interface CountryReport {
  country_code: string;
  country_name: string;
  nai_score: number;
  nai_category: string;
  conflict_day: number;
  updated_at?: string;
  content_json?: unknown | null;
  _tier_note?: string;
}

export interface ScenarioProbabilities {
  conflict_day: number;
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
  scenario_e?: number;
  updated_at: string;
}

export interface DisinfoClaim {
  id: string;
  conflict_day: number;
  claim: string;
  status: string;
  verdict?: string;
  source?: string;
  created_at: string;
}

export interface DetectedScenario {
  id: string;
  conflict_day: number;
  label: string;
  title: string;
  description_en: string;
  initial_probability?: number;
  acting_party_framing?: string;
  affected_party_framing?: string;
}

// Admin
export interface AdminUser {
  id: string;
  user_id?: string;
  email: string;
  display_name: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  admin_id: string;
  admin_role: AdminRole;
  admin_email: string;
  action_type: string;
  action_summary: string;
  target_type?: string;
  target_id?: string;
  target_label?: string;
  before_state?: unknown;
  after_state?: unknown;
  is_ai_request: boolean;
  ai_prompt?: string;
  ai_proposal?: string;
  confirmed_by?: string;
  ip_address?: string;
  created_at: string;
}

export interface PipelineRun {
  id: string;
  run_date: string;
  conflict_day: number;
  stage: string;
  status: string;
  triggered_by: string;
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  stages_completed: unknown[];
  countries_processed: number;
  articles_ingested: number;
  error_message?: string;
  created_at: string;
}

export interface ArticleSource {
  id: string;
  name: string;
  display_name: string;
  url: string;
  rss_url?: string;
  language: string;
  category: string;
  is_party_source: boolean;
  party_affiliation?: string;
  neutrality_note?: string;
  is_active: boolean;
  health_status: string;
  last_fetch_at?: string;
  last_error?: string;
  consecutive_failures: number;
  total_articles_fetched: number;
  fetch_interval_minutes?: number;
  use_google_news_proxy?: boolean;
}

export interface TierFeature {
  feature_key: string;
  description?: string;
  free_access: boolean;
  informed_access: boolean;
  pro_access: boolean;
}

export interface PlatformConfig {
  key: string;
  value: unknown;
  description?: string;
  is_sensitive: boolean;
}

export interface PlatformAlert {
  key: string;
  title?: string;
  message?: string;
  alert_type: string;
  is_active: boolean;
  priority: number;
  value?: unknown;
}

// Agent
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AgentPendingAction {
  actionType: string;
  actionData: unknown;
  aiProposal: string;
  aiPrompt: string;
}

// Disputes
export interface Dispute {
  id: string;
  article_id: string;
  article_url?: string;
  claim_text: string;
  source_url: string;
  submitted_at: string;
}

// API response types (match Edge Function responses)
export interface NaiApiResponse {
  data: NaiScore[];
  conflictDay?: number;
  tier?: string;
  total?: number;
}

export interface ScenariosApiResponse {
  current?: ScenarioProbabilities;
  history?: ScenarioProbabilities[];
}

export interface CountryApiResponse {
  data?: CountryReport | CountryReport[];
  conflictDay?: number;
  tier?: string;
}

export interface DisinfoApiResponse {
  data: Array<{ id: string; conflict_day?: number; claim?: string; verdict?: string; source?: string; created_at?: string }>;
  total: number;
  tier?: string;
  conflictDay?: number | null;
}

export interface UserFilters {
  tier?: UserTier;
  search?: string;
  page?: number;
  limit?: number;
  provider?: string;
  suspended?: 'true' | 'false';
}

export interface UserListResponse {
  users: User[];
  total: number;
}

export interface UserDetailResponse {
  user: User;
  subscriptions: Subscription[];
  payments: Payment[];
  apiKeys?: { id: string; key_prefix: string; name: string; last_used_at?: string; request_count: number; is_revoked: boolean; created_at: string }[];
}

export interface SourceFilters {
  category?: string;
  language?: string;
  is_active?: boolean;
  is_party_source?: boolean;
  health?: string;
  search?: string;
}

export interface SourceListResponse {
  sources: ArticleSource[];
  total: number;
}

export interface FeedTestResult {
  success: boolean;
  items?: number;
  error?: string;
}

export interface AuditFilters {
  admin_id?: string;
  action_type?: string;
  target_type?: string;
  since?: string;
  until?: string;
  ai_only?: boolean;
  page?: number;
  limit?: number;
}

export interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
}
