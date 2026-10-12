/**
 * War Posture v2 — per country PER CONFLICT, evidence captured once and carried forward with decaying
 * confidence, neutral behavioural labels, and a stated-positions ledger (no grade) for EG / AE / SA.
 *
 * Source of truth: supabase/migrations/20261012091000_war_posture_v2.sql (conflicts, posture_scores,
 * posture_publication_policy, viewer_posture_v2). Every function here that mirrors SQL (labels, decay,
 * freshness) must give the same answer as its SQL twin — see tests/unit/posture.test.ts.
 *
 * Until that migration is applied (or while viewer_posture_v2 returns no rows) the board falls back to the
 * War Posture v1 table (nai_scores_v2: one blended number per country) and says so. Once v2 rows exist
 * the board is v2, and every country with NO v2 row that day keeps its latest v1 row (v1 is frozen: no
 * new rows), marked "War Posture v1 — frozen, Day N" and grouped under V1_FROZEN_CONFLICT. A country
 * never gets both. In EVERY mode the EG / AE / SA rule is applied here too, so the page never shows a
 * grade for them, whatever the DB holds; their v1 rows are dropped from a v2 board altogether.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NaiSourceV2 } from '@/types/supabase';
import { isMissingRpc } from '@/lib/supabase/rpc-fallback';
import {
  NAI_V2_START_DAY,
  getNaiV2CountryLatest,
  getNaiV2DayRange,
  getNaiV2DayResult,
  getNaiV2LatestPerCountry,
  type NaiV2View,
} from '@/lib/nai-v2';

export const POSTURE_V2_RPC = 'viewer_posture_v2';
export const POSTURE_V2_METHOD = 'war-posture-v2';
export const POSTURE_V1_METHOD = 'war-posture-v1';

// ---------------------------------------------------------------------------------------------------
// Editorial policy: positions ledger only (mirror of public.posture_publication_policy)
// ---------------------------------------------------------------------------------------------------
export const POSTURE_WITHHELD_CODES = ['EG', 'AE', 'SA'] as const;
export function isPostureWithheld(code: string | null | undefined): boolean {
  return !!code && (POSTURE_WITHHELD_CODES as readonly string[]).includes(code.toUpperCase());
}
export const POSTURE_WITHHELD_TITLE = 'Stated positions only';
export const POSTURE_WITHHELD_TEXT =
  'Editorial policy: the desk publishes no 0–100 War Posture grade or category colour for Egypt, the United Arab Emirates or Saudi Arabia. It shows what their governments have said, word for word with date and link, and what they have done (deployments, basing, votes) as facts.';

// ---------------------------------------------------------------------------------------------------
// Labels (mirror of public.posture_label_for_score)
// ---------------------------------------------------------------------------------------------------
export type PostureLabelCode =
  | 'immediate_ceasefire'
  | 'conditional_deescalation'
  | 'ambivalent'
  | 'continued_pressure'
  | 'escalation';

export interface PostureLabelDef {
  code: PostureLabelCode;
  text: string;
  /** Inclusive E range. */
  min: number;
  max: number;
  /** Anchor on the 0–100 scale. */
  anchor: number;
  color: string;
}

/**
 * Colour-blind-safe diverging scale: blue (ceasefire) → grey (ambivalent) → orange (escalation).
 * No red / green. Readable on the dark surfaces as swatches; text always stays in theme tokens.
 */
export const POSTURE_LABELS: readonly PostureLabelDef[] = [
  { code: 'immediate_ceasefire', text: 'Seeks immediate ceasefire', min: 0, max: 12, anchor: 0, color: '#2F7FD8' },
  { code: 'conditional_deescalation', text: 'Conditional de-escalation', min: 13, max: 37, anchor: 25, color: '#86B4EA' },
  { code: 'ambivalent', text: 'Ambivalent', min: 38, max: 62, anchor: 50, color: '#9CA3AF' },
  { code: 'continued_pressure', text: 'Supports continued pressure', min: 63, max: 87, anchor: 75, color: '#F0AE6B' },
  { code: 'escalation', text: 'Supports escalation', min: 88, max: 100, anchor: 100, color: '#D9711C' },
];
export const POSTURE_SILENCE_COLOR = '#5B6472';
export const POSTURE_NODATA_COLOR = '#2E3A4E';
export const POSTURE_DEFENSIVE_TEXT = 'citing attacks on its own territory';

export function postureLabelFor(e: number | null | undefined): PostureLabelCode | null {
  if (typeof e !== 'number' || !Number.isFinite(e) || e < 0 || e > 100) return null;
  const v = Math.round(e);
  return (POSTURE_LABELS.find((l) => v >= l.min && v <= l.max) ?? null)?.code ?? null;
}
export function postureLabelDef(code: PostureLabelCode | null | undefined): PostureLabelDef | null {
  return code ? (POSTURE_LABELS.find((l) => l.code === code) ?? null) : null;
}

// ---------------------------------------------------------------------------------------------------
// Decay schedule (mirror of posture_decay_factor / posture_confidence_now / posture_freshness)
// ---------------------------------------------------------------------------------------------------
export type Confidence = 'high' | 'medium' | 'low';
export type Freshness = 'current' | 'decaying' | 'stale';
export const POSTURE_HALF_LIFE_DAYS = 30;

export function decayFactor(ageDays: number | null, halfLife = POSTURE_HALF_LIFE_DAYS): number | null {
  if (ageDays === null || !Number.isFinite(ageDays)) return null;
  return Math.round(Math.pow(0.5, Math.max(ageDays, 0) / Math.max(halfLife, 1)) * 10000) / 10000;
}
export function confidenceNow(base: Confidence | null, ageDays: number | null, halfLife = POSTURE_HALF_LIFE_DAYS): Confidence | null {
  const rank = { low: 1, medium: 2, high: 3 } as const;
  const weight = { low: 0.5, medium: 0.7, high: 0.9 } as const;
  const f = decayFactor(ageDays, halfLife);
  if (!base || !(base in rank) || f === null) return null;
  const w = weight[base] * f;
  const band = w >= 0.6 ? 3 : w >= 0.3 ? 2 : 1;
  return (['low', 'medium', 'high'] as const)[Math.min(rank[base], band) - 1];
}
export function freshnessFor(ageDays: number | null): Freshness | null {
  if (ageDays === null || !Number.isFinite(ageDays)) return null;
  return ageDays <= 14 ? 'current' : ageDays <= 45 ? 'decaying' : 'stale';
}
export const FRESHNESS_TEXT: Record<Freshness, string> = {
  current: 'current',
  decaying: 'confidence decaying',
  stale: 'stale — still on record',
};

/** DAY LOCK: Day 1 = 2026-02-28 (UTC). */
export function dayToIsoDate(day: number): string {
  const d = new Date(Date.UTC(2026, 1, 27) + day * 86_400_000);
  return d.toISOString().slice(0, 10);
}
function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(toIso.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(Math.round((b - a) / 86_400_000), 0);
}
/** "6 Oct" (UTC). */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.length <= 10 ? iso + 'T00:00:00Z' : iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------------------------------
// Conflicts registry (mirror of the rows seeded by the migration; the DB table wins when present)
// ---------------------------------------------------------------------------------------------------
export interface ConflictDef {
  conflict_code: string;
  name: string;
  short_name: string;
  description: string;
  theatre: string;
  started_on: string | null;
  status: string;
  sort_order: number;
}
export const CONFLICTS_FALLBACK: readonly ConflictDef[] = [
  {
    conflict_code: 'us-iran',
    name: 'US/Israel–Iran war (2026)',
    short_name: 'US–Iran',
    description:
      'Hostilities between the United States and Israel and Iran and its allied forces since 28 February 2026 (Conflict Day 1). Party codenames: Epic Fury (US), Roaring Lion (Israel), True Promise IV (Iran).',
    theatre: 'Gulf & Levant',
    started_on: '2026-02-28',
    status: 'active',
    sort_order: 10,
  },
  {
    conflict_code: 'red-sea-houthi',
    name: 'Red Sea and Houthi front',
    short_name: 'Red Sea / Houthis',
    description:
      'Attacks by the Houthis (Ansar Allah) on shipping and on Saudi territory, and the military responses to them, including by the Saudi-led coalition.',
    theatre: 'Red Sea & Yemen',
    started_on: null,
    status: 'active',
    sort_order: 20,
  },
  {
    conflict_code: 'horn-tigray',
    name: 'Ethiopia offensive and Eritrea rupture (2026)',
    short_name: 'Ethiopia / Horn',
    description:
      "Ethiopia's offensive from 23 September 2026 against the TPLF/Fano/OLA alliance, and the Ethiopia–Eritrea rupture over Red Sea access.",
    theatre: 'Horn of Africa',
    started_on: '2026-09-23',
    status: 'active',
    sort_order: 30,
  },
  {
    conflict_code: 'sudan',
    name: 'Sudan: SAF–RSF war',
    short_name: 'Sudan',
    description: 'The war between the Sudanese Armed Forces (SAF) and the Rapid Support Forces (RSF), since 15 April 2023.',
    theatre: 'Horn of Africa',
    started_on: '2023-04-15',
    status: 'active',
    sort_order: 40,
  },
];
/** Pseudo-conflict for War Posture v1 rows: one blended number per country across different wars. */
export const BLENDED_CONFLICT: ConflictDef = {
  conflict_code: 'blended-v1',
  name: 'All wars, one number (method v1)',
  short_name: 'Blended (v1)',
  description:
    'War Posture v1 scored each country on one number, even where countries were scored on different wars. Per-conflict scores replace it once War Posture v2 rows exist.',
  theatre: '—',
  started_on: null,
  status: 'active',
  sort_order: 0,
};

/**
 * Pseudo-conflict (group) for War Posture v1 rows on a v2 board: countries not yet re-coded under v2
 * keep their last v1 number, frozen, with its own day. Not a war: v1 blended different wars into one
 * number, so these rows are never filed under a real conflict (e.g. us-iran). Sorted after the conflicts.
 */
export const V1_FROZEN_CONFLICT: ConflictDef = {
  conflict_code: 'v1-frozen',
  name: 'War Posture v1 — frozen, not yet re-coded',
  short_name: 'v1 (frozen, not yet re-coded)',
  description:
    'Governments not yet re-coded under War Posture v2 keep their last War Posture v1 number: one blended number per country across different wars, frozen (no new v1 rows are written) and shown with the day it was scored. Each is replaced as soon as the government has a v2 row; v1 numbers never count as moves.',
  theatre: '—',
  started_on: null,
  status: 'frozen',
  sort_order: 10_000,
};

/** "War Posture v1 — frozen, Day 224" — the marker for a v1 row shown on a v2 board. */
export function v1FrozenText(row: Pick<PostureView, 'score_day'>): string {
  return `War Posture v1 — frozen, Day ${row.score_day ?? '—'}`;
}

// ---------------------------------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------------------------------
export type PostureStance = 'position' | 'deliberate_silence' | 'nulled' | 'uncoded' | 'withheld';
export type ChangeReason = 'new_evidence' | 'reverification' | 'nulled';

export interface PostureEvidenceView {
  id: string | null;
  conflict_code: string | null;
  kind: 'statement' | 'act' | 'silence_trigger';
  act_type: string | null;
  quote: string;
  speaker: string | null;
  speaker_office: string | null;
  source_url: string;
  archive_url: string | null;
  page_sha256: string | null;
  party_source: boolean | null;
  stated_at: string | null;
  captured_at: string | null;
}

export interface PostureView {
  country_code: string;
  /** null = War Posture v1 (blended across wars). */
  conflict_code: string | null;
  /** Per-row schema: a v2 board can carry frozen v1 rows (see isV1Fallback). */
  method: typeof POSTURE_V2_METHOD | typeof POSTURE_V1_METHOD;
  /** Day of the coded row (v2: may be earlier than the viewed day = carried forward). */
  score_day: number | null;
  as_of: string | null;
  stance: PostureStance;
  label: PostureLabelCode | null;
  expressed_score: number | null;
  defensive: boolean | null;
  confidence_base: Confidence | null;
  confidence_now: Confidence | null;
  decay_factor: number | null;
  /** Age of the evidence on the viewed day (days since the statement / newest cited source). */
  evidence_age_days: number | null;
  freshness: Freshness | null;
  /** When the evidence was dated: statement date (v2) or newest cited source's publication date (v1). */
  evidence_date: string | null;
  evidence: PostureEvidenceView | null;
  /** v1 only: the cited reporting behind E (outlet summaries, NOT verbatim quotes). */
  cited: NaiSourceV2[];
  expressed_basis: string | null;
  change_reason: ChangeReason | null;
  note: string | null;
  previous_day: number | null;
  previous_stance: string | null;
  previous_label: PostureLabelCode | null;
  previous_score: number | null;
  withheld: boolean;
  latent_low: number | null;
  latent_high: number | null;
  latent_basis: string | null;
  latentLocked: boolean;
  gap: number | null;
  gapLocked: boolean;
  category: string | null;
  categoryLocked: boolean;
  hiddenLatentSourceCount: number;
}

export interface PostureBoard {
  /**
   * 'v1' = every row is War Posture v1 for one day (no v2 rows yet). 'v2' = viewer_posture_v2 rows PLUS,
   * for each country with no v2 row, its latest frozen v1 row on or before `day` (row.method says which;
   * those rows keep their own score_day, conflict_code null, never withheld countries).
   */
  schema: 'v2' | 'v1';
  /** Day the board shows (v2: state on that day, rows carried forward). */
  day: number | null;
  firstDay: number | null;
  latestDay: number | null;
  conflicts: ConflictDef[];
  rows: PostureView[];
  hasLatentAccess: boolean;
  hasGapAccess: boolean;
}

export interface CountryPosture {
  schema: 'v2' | 'v1';
  rows: PostureView[];
  /** Captured statements / acts / silence triggers for the country (posture_evidence), newest first. */
  ledger: PostureEvidenceView[];
}

type Sb = Pick<SupabaseClient, 'from' | 'rpc'>;
type Access = { latent: boolean; gap: boolean };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const conf = (v: unknown): Confidence | null => (v === 'high' || v === 'medium' || v === 'low' ? v : null);
const isLabel = (v: unknown): v is PostureLabelCode => POSTURE_LABELS.some((l) => l.code === v);

// ---------------------------------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------------------------------
export function evidenceFromRow(r: Record<string, unknown>): PostureEvidenceView | null {
  const url = str(r.source_url);
  const quote = str(r.position_quote);
  if (!url || !quote || !/^https?:\/\//i.test(url)) return null;
  const kind = r.evidence_kind === 'act' || r.evidence_kind === 'silence_trigger' ? r.evidence_kind : 'statement';
  const archive = str(r.archive_url);
  return {
    id: str(r.evidence_id) ?? str(r.id),
    conflict_code: str(r.conflict_code),
    kind,
    act_type: str(r.act_type),
    quote,
    speaker: str(r.speaker),
    speaker_office: str(r.speaker_office),
    source_url: url,
    archive_url: archive && /^https?:\/\//i.test(archive) ? archive : null,
    page_sha256: str(r.page_sha256),
    party_source: typeof r.party_source === 'boolean' ? r.party_source : null,
    stated_at: str(r.stated_at),
    captured_at: str(r.captured_at),
  };
}

/** One viewer_posture_v2 row → view. Withholding is re-applied here (defence in depth). */
export function fromV2Row(r: Record<string, unknown>, access: Access): PostureView {
  const code = String(r.country_code ?? '').toUpperCase();
  const withheld = r.withheld === true || isPostureWithheld(code);
  const latent = access.latent && r.latent_access !== false && !withheld;
  const gap = access.gap && r.gap_access !== false && !withheld;
  const evidence = evidenceFromRow(r);
  const stanceRaw = str(r.stance);
  const stance: PostureStance = withheld
    ? 'withheld'
    : stanceRaw === 'position' || stanceRaw === 'deliberate_silence' || stanceRaw === 'nulled' || stanceRaw === 'uncoded'
      ? stanceRaw
      : 'uncoded';
  const age = num(r.evidence_age_days);
  const rawCategory = str(r.category);
  const category = withheld ? null : gap ? rawCategory : rawCategory === 'UNSCORABLE' ? 'UNSCORABLE' : null;
  return {
    country_code: code,
    conflict_code: str(r.conflict_code),
    method: POSTURE_V2_METHOD,
    score_day: withheld ? null : num(r.score_day),
    as_of: withheld ? null : str(r.as_of),
    stance,
    label: withheld ? null : isLabel(r.label) ? r.label : null,
    expressed_score: withheld ? null : num(r.expressed_score),
    defensive: withheld ? null : typeof r.defensive === 'boolean' ? r.defensive : null,
    confidence_base: withheld ? null : conf(r.confidence_base),
    confidence_now: withheld ? null : conf(r.confidence_now),
    decay_factor: withheld ? null : num(r.decay_factor),
    evidence_age_days: age,
    freshness: (['current', 'decaying', 'stale'] as const).find((f) => f === r.freshness) ?? freshnessFor(age),
    evidence_date: evidence ? (evidence.stated_at ?? evidence.captured_at) : null,
    evidence,
    cited: [],
    expressed_basis: null,
    change_reason: withheld ? null : r.change_reason === 'new_evidence' || r.change_reason === 'reverification' || r.change_reason === 'nulled' ? r.change_reason : null,
    note: withheld ? null : str(r.note),
    previous_day: withheld ? null : num(r.previous_day),
    previous_stance: withheld ? null : str(r.previous_stance),
    previous_label: withheld ? null : isLabel(r.previous_label) ? r.previous_label : null,
    previous_score: withheld ? null : num(r.previous_score),
    withheld,
    latent_low: latent ? num(r.latent_low) : null,
    latent_high: latent ? num(r.latent_high) : null,
    latent_basis: latent ? str(r.latent_basis) : null,
    latentLocked: !latent && !withheld,
    gap: gap ? num(r.gap) : null,
    gapLocked: !gap && !withheld,
    category,
    categoryLocked: !withheld && category === null && stance === 'position',
    hiddenLatentSourceCount: 0,
  };
}

/** One War Posture v1 row (already tier-redacted by toNaiV2View) → view, at reference date `refIso`. */
export function fromV1View(v: NaiV2View, refIso: string): PostureView {
  const withheld = v.withheld || isPostureWithheld(v.country_code);
  const eSources = v.sources.filter((s) => s.feeds === 'E');
  const newest = eSources
    .map((s) => s.published_at)
    .filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d))
    .sort()
    .pop() ?? null;
  const age = newest ? daysBetween(newest, refIso) : null;
  const e = withheld ? null : v.expressed_score;
  return {
    country_code: v.country_code,
    conflict_code: null,
    method: POSTURE_V1_METHOD,
    score_day: v.conflict_day,
    as_of: v.as_of,
    stance: withheld ? 'withheld' : e === null ? 'uncoded' : 'position',
    label: postureLabelFor(e),
    expressed_score: e,
    defensive: null,
    confidence_base: withheld ? null : v.confidence,
    confidence_now: withheld || e === null ? null : confidenceNow(v.confidence, age),
    decay_factor: withheld || e === null ? null : decayFactor(age),
    // A v1 row with no E has nothing to age: its sources explain the gap, they are not a position.
    evidence_age_days: withheld || e !== null ? age : null,
    freshness: withheld || e !== null ? freshnessFor(age) : null,
    evidence_date: withheld || e !== null ? newest : null,
    evidence: null,
    // EG / AE / SA: verbatim statements and acts only — never the desk's outlet summaries that fed a grade.
    cited: withheld ? [] : eSources,
    expressed_basis: withheld ? null : v.expressed_basis,
    change_reason: null,
    note: null,
    previous_day: null,
    previous_stance: null,
    previous_label: null,
    previous_score: null,
    withheld,
    latent_low: withheld ? null : v.latent_low,
    latent_high: withheld ? null : v.latent_high,
    latent_basis: withheld ? null : v.latent_basis,
    latentLocked: !withheld && v.latentLocked,
    gap: withheld ? null : v.gap,
    gapLocked: !withheld && v.gapLocked,
    category: withheld ? null : v.category,
    categoryLocked: !withheld && v.categoryLocked,
    hiddenLatentSourceCount: withheld ? 0 : v.hiddenLatentSourceCount,
  };
}

// ---------------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------------
export async function getConflicts(supabase: Sb): Promise<ConflictDef[]> {
  try {
    const { data, error } = await supabase
      .from('conflicts')
      .select('conflict_code, name, short_name, description, theatre, started_on, status, sort_order')
      .order('sort_order', { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) return [...CONFLICTS_FALLBACK];
    return data as ConflictDef[];
  } catch {
    return [...CONFLICTS_FALLBACK];
  }
}

/** Raw viewer_posture_v2 call. `missing` = the migration is not applied (PGRST202). */
export async function readPostureV2(
  supabase: Sb,
  args: { conflict?: string | null; country?: string | null; day?: number | null },
): Promise<{ rows: Record<string, unknown>[]; missing: boolean; error: boolean }> {
  try {
    const { data, error } = await supabase.rpc(POSTURE_V2_RPC, {
      p_conflict: args.conflict ?? null,
      p_country: args.country ?? null,
      p_day: args.day ?? null,
    });
    if (error) return { rows: [], missing: isMissingRpc(error) || error.code === '42883', error: !isMissingRpc(error) };
    return { rows: Array.isArray(data) ? (data as Record<string, unknown>[]) : [], missing: false, error: false };
  } catch {
    return { rows: [], missing: true, error: false };
  }
}

export function currentConflictDayUtc(now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - Date.UTC(2026, 1, 28)) / 86_400_000) + 1;
}

/**
 * The /nai board. v2 when viewer_posture_v2 exists AND has rows: every v2 row plus, per country with no
 * v2 row (any conflict, any stance) that day, its latest v1 row on or before that day (frozen fallback,
 * EG / AE / SA excluded). Otherwise v1 (nai_scores_v2) for its latest day (or `day`). `v1Loader` lets a
 * browser caller replace the v1 day read (see /warroom); the frozen fallback reads the tier-gated RPC
 * only (never the table from a browser), and uses `v1Loader` only if that RPC is missing.
 */
export async function getPostureBoard(
  supabase: Sb,
  { day = null, access, v1Loader }: { day?: number | null; access: Access; v1Loader?: (day: number) => Promise<NaiV2View[]> },
): Promise<PostureBoard> {
  const today = currentConflictDayUtc();
  const [v2, conflicts] = await Promise.all([readPostureV2(supabase, { day: day ?? today }), getConflicts(supabase)]);
  if (!v2.missing && v2.rows.length > 0) {
    const boardDay = day ?? today;
    const v2Rows = v2.rows.map((r) => fromV2Row(r, access));
    const v2Countries = new Set(v2Rows.map((r) => r.country_code));
    // Frozen v1 fallback for countries not yet coded in v2. When viewer_posture_v2 exists, viewer_nai_v2
    // exists too (same migration chain), so the browser never needs the table read here.
    let fallback = await getNaiV2LatestPerCountry(supabase, boardDay, access, { tableFallback: !v1Loader });
    if (fallback.via === 'missing' && v1Loader) {
      const viaLoader = (await v1Loader(boardDay)).filter((v) => v.conflict_day <= boardDay);
      fallback = { rows: viaLoader, via: 'table' };
    }
    const refIso = dayToIsoDate(boardDay);
    const v1Rows = fallback.rows
      .filter((v) => !v2Countries.has(v.country_code.toUpperCase()))
      // EG / AE / SA: no v1 row at all on a v2 board (their v2 ledger rows, if any, carry the words).
      .filter((v) => !v.withheld && !isPostureWithheld(v.country_code))
      .map((v) => fromV1View(v, refIso))
      .filter((r) => !r.withheld);
    return {
      schema: 'v2',
      day: boardDay,
      firstDay: NAI_V2_START_DAY,
      latestDay: today,
      conflicts,
      rows: [...v2Rows, ...v1Rows],
      hasLatentAccess: access.latent,
      hasGapAccess: access.gap,
    };
  }
  const { firstDay, latestDay } = await getNaiV2DayRange(supabase);
  const want = day ?? latestDay;
  let v1: NaiV2View[] = [];
  if (want != null) {
    if (v1Loader) v1 = await v1Loader(want);
    else v1 = (await getNaiV2DayResult(supabase, want, access)).rows;
  }
  const refIso = want != null ? dayToIsoDate(want) : new Date().toISOString().slice(0, 10);
  return {
    schema: 'v1',
    day: want,
    firstDay,
    latestDay,
    conflicts,
    rows: v1.map((r) => fromV1View(r, refIso)),
    hasLatentAccess: access.latent,
    hasGapAccess: access.gap,
  };
}

/** posture_evidence for one country, newest first (public, append-only ledger). */
export async function getPositionsLedger(supabase: Sb, code: string, limit = 12): Promise<PostureEvidenceView[]> {
  try {
    const { data, error } = await supabase
      .from('posture_evidence')
      .select('*')
      .eq('country_code', code.toUpperCase())
      .order('captured_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return (data as Record<string, unknown>[])
      .map((r) => evidenceFromRow(r))
      .filter((e): e is PostureEvidenceView => e !== null)
      .sort((a, b) => (b.stated_at ?? b.captured_at ?? '').localeCompare(a.stated_at ?? a.captured_at ?? ''));
  } catch {
    return [];
  }
}

export async function getCountryPosture(supabase: Sb, code: string, access: Access): Promise<CountryPosture> {
  const cc = code.toUpperCase();
  const [v2, ledger] = await Promise.all([readPostureV2(supabase, { country: cc }), getPositionsLedger(supabase, cc)]);
  if (!v2.missing && v2.rows.length > 0) {
    return { schema: 'v2', rows: v2.rows.map((r) => fromV2Row(r, access)), ledger };
  }
  const latest = await getNaiV2CountryLatest(supabase, cc, access);
  const rows = latest ? [fromV1View(latest, new Date().toISOString().slice(0, 10))] : [];
  return { schema: 'v1', rows, ledger };
}

// ---------------------------------------------------------------------------------------------------
// Moves: only changes that rest on NEW evidence (never method artefacts / re-verification)
// ---------------------------------------------------------------------------------------------------
export interface PostureMove {
  row: PostureView;
  delta: number;
}
export function postureMoves(board: PostureBoard, withinDays = 2): PostureMove[] {
  if (board.schema !== 'v2' || board.day == null) return [];
  const from = board.day - withinDays;
  return board.rows
    .filter(
      (r) =>
        // v2 rows only: the frozen v1 fallback rows on a v2 board never count as moves
        r.method === POSTURE_V2_METHOD &&
        !r.withheld &&
        r.stance === 'position' &&
        r.change_reason === 'new_evidence' &&
        // a statement made weeks ago and captured today is not news: only current evidence drives a move
        r.freshness === 'current' &&
        r.score_day != null &&
        r.score_day >= from &&
        r.expressed_score != null &&
        r.previous_score != null &&
        (r.previous_label !== r.label || Math.abs(r.expressed_score - r.previous_score) >= 10),
    )
    .map((r) => ({ row: r, delta: (r.expressed_score ?? 0) - (r.previous_score ?? 0) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.row.country_code.localeCompare(b.row.country_code));
}

/** true = a frozen War Posture v1 row shown on a v2 board (country not yet re-coded in v2). */
export function isV1Fallback(board: Pick<PostureBoard, 'schema'>, row: Pick<PostureView, 'method'>): boolean {
  return board.schema === 'v2' && row.method === POSTURE_V1_METHOD;
}

/** Group (tab) a row belongs to: its conflict (v2), the blended pseudo-conflict (v1 board), or v1-frozen. */
export function postureGroupCode(board: Pick<PostureBoard, 'schema'>, row: Pick<PostureView, 'method' | 'conflict_code'>): string {
  if (board.schema === 'v1') return BLENDED_CONFLICT.conflict_code;
  if (row.method === POSTURE_V1_METHOD || row.conflict_code === null) return V1_FROZEN_CONFLICT.conflict_code;
  return row.conflict_code;
}

/**
 * Groups present on a board, registry order; v1 board = the single blended pseudo-conflict; a v2 board
 * with frozen v1 rows ends with V1_FROZEN_CONFLICT.
 */
export function boardConflicts(board: PostureBoard): ConflictDef[] {
  if (board.schema === 'v1') return [BLENDED_CONFLICT];
  const present = new Set(board.rows.map((r) => postureGroupCode(board, r)));
  const real = board.conflicts.filter((c) => present.has(c.conflict_code));
  return present.has(V1_FROZEN_CONFLICT.conflict_code) ? [...real, V1_FROZEN_CONFLICT] : real;
}
export function conflictName(conflicts: readonly ConflictDef[], code: string | null): string {
  if (code === null) return BLENDED_CONFLICT.short_name;
  return conflicts.find((c) => c.conflict_code === code)?.short_name ?? code;
}

/** "captured 6 Oct · confidence decaying" (v2) / "source dated 7 Oct · current" (v1). */
export function ageLine(r: Pick<PostureView, 'method' | 'evidence' | 'evidence_date' | 'freshness'>): string | null {
  const parts: string[] = [];
  if (r.method === POSTURE_V2_METHOD && r.evidence) {
    const stated = shortDate(r.evidence.stated_at);
    const captured = shortDate(r.evidence.captured_at);
    if (stated && stated !== captured) parts.push(`stated ${stated}`);
    if (captured) parts.push(`captured ${captured}`);
  } else if (r.evidence_date) {
    const d = shortDate(r.evidence_date);
    if (d) parts.push(`source dated ${d}`);
  }
  if (r.freshness) parts.push(FRESHNESS_TEXT[r.freshness]);
  return parts.length ? parts.join(' · ') : null;
}
