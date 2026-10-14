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
 * the board is v2, and every LINE (country x actor: one per country, two for Yemen — see "Actors") with
 * no CODED v2 row that day (none, or only 'uncoded' = statement captured, not yet coded) keeps its latest
 * v1 row (v1 is frozen: no new rows), marked "War Posture v1 — frozen, Day N", grouped under
 * V1_FROZEN_CONFLICT, and noted when a v2 statement awaits coding. A line never gets both; the v1 row
 * (one number per country) stands in for one line only (V1_FALLBACK_ACTOR). Yemen's two lines (20261013090000_posture_yemen_dual_actor.sql)
 * are never merged or averaged. In EVERY mode the EG / AE / SA rule is applied here too, so the page never
 * shows a grade for them, whatever the DB holds: on a v2 board their v1 rows are never shown, and with no
 * v2 row at all they get a policy-only "Stated positions only" row (no evidence, no grade).
 */
import { isPostureNoGrade, postureScaleColor, postureScaleVar } from './design-tokens';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NaiSourceV2 } from '@/types/supabase';
import { isMissingRpc } from '@/lib/supabase/rpc-fallback';
import { TRACKED_COUNTRY_NAMES } from '@/lib/country-names';
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
  return !!code && (POSTURE_WITHHELD_CODES as readonly string[]).includes(code.trim().toUpperCase());
}
export const POSTURE_WITHHELD_TITLE = 'Stated positions only';
/** Stance text for a v2 'uncoded' row (evidence captured, no score yet). */
export const POSTURE_UNCODED_TEXT = 'Statement captured, not yet coded';
/** The panel-wide question every tracked state is asked (the /nai "nothing on record" list lives here). */
export const POSTURE_PANEL_CONFLICT = 'us-iran';
export const POSTURE_WITHHELD_TEXT =
  'Editorial policy: the desk publishes no 0–100 War Posture grade or category colour for Egypt, the United Arab Emirates or Saudi Arabia. It shows what their governments have said, word for word with date and link, and what they have done (deployments, basing, votes) as facts.';

// ---------------------------------------------------------------------------------------------------
// Actors (mirror of public.posture_actors, migration 20261013090000_posture_yemen_dual_actor.sql)
// ---------------------------------------------------------------------------------------------------
/**
 * Whose posture a line scores. Every country is scored for its government (the default). A country
 * registered with a de facto authority (Yemen: Ansar Allah / Houthi authorities in Sanaa) has a SECOND,
 * separate line — never merged with the government line into one number (operator decision 2026-10-13).
 */
export type PostureActor = 'government' | 'de_facto_authority';
export const POSTURE_DEFAULT_ACTOR: PostureActor = 'government';

export interface PostureActorDef {
  country_code: string;
  actor: PostureActor;
  display_name: string;
  display_name_ar: string;
  /** Suffix after the country name on a board line: "Yemen — Government (PLC)". */
  line_label: string;
}
export const POSTURE_ACTORS: readonly PostureActorDef[] = [
  {
    country_code: 'YE',
    actor: 'government',
    display_name: 'Government of Yemen (Presidential Leadership Council)',
    display_name_ar: 'الحكومة اليمنية (مجلس القيادة الرئاسي)',
    line_label: 'Government (PLC)',
  },
  {
    country_code: 'YE',
    actor: 'de_facto_authority',
    display_name: 'Ansar Allah (Houthi) authorities, Sanaa',
    display_name_ar: 'سلطات أنصار الله (الحوثيين) في صنعاء',
    line_label: 'Ansar Allah (Houthi), de facto authority',
  },
];

/**
 * The line a country's frozen War Posture v1 row (nai_scores_v2, one number per country) belongs to on a
 * v2 board. Default: government. YE: government too — every frozen v1 YE row (Days 221–227) states in its
 * expressed_basis that it was "Scored for the internationally recognised government (PLC)" and cites PLC
 * chair al-Alimi / the Office of the Prime Minister in Aden. The v1 number is therefore attached to the
 * government line only and never shown on the de facto authority line. Change here (one line) only if
 * the operator rules otherwise.
 */
export const V1_FALLBACK_ACTOR: Readonly<Record<string, PostureActor>> = { YE: 'government' };
export function v1ActorFor(code: string): PostureActor {
  return V1_FALLBACK_ACTOR[code.trim().toUpperCase()] ?? POSTURE_DEFAULT_ACTOR;
}

/** Normalise an actor value from the DB. Anything but the two enum values is the government line. */
export function asPostureActor(v: unknown): PostureActor {
  return v === 'de_facto_authority' ? 'de_facto_authority' : POSTURE_DEFAULT_ACTOR;
}
export function postureActorDef(code: string | null | undefined, actor: PostureActor): PostureActorDef | null {
  const cc = (code ?? '').trim().toUpperCase();
  return POSTURE_ACTORS.find((a) => a.country_code === cc && a.actor === actor) ?? null;
}
/** true = the country has more than one line (YE). */
export function isDualActorCountry(code: string | null | undefined): boolean {
  const cc = (code ?? '').trim().toUpperCase();
  return POSTURE_ACTORS.some((a) => a.country_code === cc && a.actor !== POSTURE_DEFAULT_ACTOR);
}
/** "Government (PLC)" / "Ansar Allah (Houthi), de facto authority" for a dual-actor line; null otherwise. */
export function postureActorLineLabel(row: Pick<PostureView, 'country_code' | 'actor' | 'actor_display_name'>): string | null {
  if (!isDualActorCountry(row.country_code) && row.actor === POSTURE_DEFAULT_ACTOR) return null;
  return (
    postureActorDef(row.country_code, row.actor)?.line_label ??
    row.actor_display_name ??
    (row.actor === 'de_facto_authority' ? 'de facto authority' : 'Government')
  );
}
/** Board line name: "Yemen — Government (PLC)", "Yemen — Ansar Allah (Houthi), de facto authority", "Iran". */
export function postureLineLabel(row: Pick<PostureView, 'country_code' | 'actor' | 'actor_display_name'>, countryName?: string | null): string {
  const name = countryName ?? TRACKED_COUNTRY_NAMES[row.country_code] ?? row.country_code;
  const suffix = postureActorLineLabel(row);
  return suffix ? `${name} — ${suffix}` : name;
}
/** One line = country x actor (across conflicts). */
export function postureLineKey(code: string, actor: PostureActor): string {
  return `${code.toUpperCase()}|${actor}`;
}
/** Unique key of a board row: country x conflict x actor (React keys, selection, moves). */
export function postureRowKey(row: Pick<PostureView, 'country_code' | 'conflict_code' | 'actor'>): string {
  return `${row.country_code}|${row.conflict_code ?? 'v1'}|${row.actor}`;
}

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
 * Colours: the War Posture scale of design system v2 (lib/design-tokens.ts), four bands by SCORE —
 * 0–30, 31–60, 61–80, 81–100 (no red / green). `color` is a theme-aware swatch / fill value
 * (`var(--posture-N, #hex)`), never a text colour. A label has no score of its own, so its `color` is its
 * anchor's band; wherever a score exists use postureSwatchColor(row) / postureScaleVar(score), which
 * colour by the score band (e.g. 85 "Supports continued pressure" draws band 4, like PostureSwatch).
 */
const anchorColor = (anchor: number): string => postureScaleVar(anchor) as string;
export const POSTURE_LABELS: readonly PostureLabelDef[] = [
  { code: 'immediate_ceasefire', text: 'Seeks immediate ceasefire', min: 0, max: 12, anchor: 0, color: anchorColor(0) },
  { code: 'conditional_deescalation', text: 'Conditional de-escalation', min: 13, max: 37, anchor: 25, color: anchorColor(25) },
  { code: 'ambivalent', text: 'Ambivalent', min: 38, max: 62, anchor: 50, color: anchorColor(50) },
  { code: 'continued_pressure', text: 'Supports continued pressure', min: 63, max: 87, anchor: 75, color: anchorColor(75) },
  { code: 'escalation', text: 'Supports escalation', min: 88, max: 100, anchor: 100, color: anchorColor(100) },
];

/** Swatch colour of a coded position: its score band, else its label's anchor band; null for EG / AE / SA. */
export function postureSwatchColor(row: { label: PostureLabelCode | null; expressed_score?: number | null; country_code?: string | null }): string | null {
  return (
    postureScaleVar(row.expressed_score, { countryCode: row.country_code }) ??
    (isPostureNoGrade(row.country_code) ? null : (postureLabelDef(row.label)?.color ?? null))
  );
}

/** Hex (dark) for canvas renderers that cannot read CSS variables (the MapLibre map). */
export function postureSwatchHex(row: { label: PostureLabelCode | null; expressed_score?: number | null; country_code?: string | null }): string | null {
  const score = typeof row.expressed_score === 'number' ? row.expressed_score : postureLabelDef(row.label)?.anchor;
  return postureScaleColor(score, { countryCode: row.country_code });
}
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
  name: 'Old method (v1) — frozen, no longer updated',
  short_name: 'Old method (v1, frozen)',
  description:
    'Governments with no position recorded under the current method yet keep their last score under the old method: one blended number per country across different wars, no longer updated, shown with the day it was scored. Each is replaced as soon as the government has a position under the current method; old-method scores never count as changes.',
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
  /** Whose voice: government (default) or a registered de facto authority (YE). */
  actor: PostureActor;
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
  /**
   * Which authority this line scores: government (default) or de_facto_authority (YE: Ansar Allah /
   * Houthi authorities, Sanaa). Two lines of one country are separate rows, never merged or averaged.
   */
  actor: PostureActor;
  /** posture_actors.display_name for a registered country (YE), else null (the UI uses the country name). */
  actor_display_name: string | null;
  actor_display_name_ar: string | null;
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
  /**
   * v1 fallback rows on a v2 board only: conflicts where a v2 statement has been captured for this
   * country but not yet coded (its 'uncoded' v2 rows, replaced on the board by this v1 row). Else [].
   */
  v2UncodedConflicts: string[];
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
  /**
   * Every War Posture v2 coding day (ascending, public.posture_v2_days), whatever day the board shows. Only
   * when asked for (withDays: /nai, /api/viewer/posture) and readable; drives the day stepper (operator R2).
   */
  v2Days?: number[];
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
    actor: asPostureActor(r.actor),
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
  // A viewer row without actor (RPC from before 20261013090000) is the government line.
  const actor = asPostureActor(r.actor);
  const def = postureActorDef(code, actor);
  return {
    country_code: code,
    conflict_code: str(r.conflict_code),
    actor,
    actor_display_name: str(r.actor_display_name) ?? def?.display_name ?? null,
    actor_display_name_ar: str(r.actor_display_name_ar) ?? def?.display_name_ar ?? null,
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
    v2UncodedConflicts: [],
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
  // v1 scored one number per country: it belongs to ONE line (V1_FALLBACK_ACTOR; government by default).
  const actor = v1ActorFor(v.country_code);
  const def = postureActorDef(v.country_code, actor);
  return {
    country_code: v.country_code,
    conflict_code: null,
    actor,
    actor_display_name: def?.display_name ?? null,
    actor_display_name_ar: def?.display_name_ar ?? null,
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
    v2UncodedConflicts: [],
  };
}

/**
 * EG / AE / SA on a v2 board with no v2 row at all: the editorial policy row ("Stated positions only"),
 * filed under the panel-wide conflict so the country is never listed as "nothing on record". Carries no
 * evidence, no day and no grade — it states the policy, not a captured position.
 */
export function withheldPolicyRow(code: string): PostureView {
  return {
    country_code: code.toUpperCase(),
    conflict_code: POSTURE_PANEL_CONFLICT,
    actor: POSTURE_DEFAULT_ACTOR,
    actor_display_name: null,
    actor_display_name_ar: null,
    method: POSTURE_V2_METHOD,
    score_day: null,
    as_of: null,
    stance: 'withheld',
    label: null,
    expressed_score: null,
    defensive: null,
    confidence_base: null,
    confidence_now: null,
    decay_factor: null,
    evidence_age_days: null,
    freshness: null,
    evidence_date: null,
    evidence: null,
    cited: [],
    expressed_basis: null,
    change_reason: null,
    note: null,
    previous_day: null,
    previous_stance: null,
    previous_label: null,
    previous_score: null,
    withheld: true,
    latent_low: null,
    latent_high: null,
    latent_basis: null,
    latentLocked: false,
    gap: null,
    gapLocked: false,
    category: null,
    categoryLocked: false,
    hiddenLatentSourceCount: 0,
    v2UncodedConflicts: [],
  };
}

/** "War Posture v2: Statement captured, not yet coded" on a v1 fallback row, else null. */
export function v2UncodedNote(row: Pick<PostureView, 'v2UncodedConflicts'>): string | null {
  return row.v2UncodedConflicts.length > 0 ? `War Posture v2: ${POSTURE_UNCODED_TEXT}` : null;
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

/**
 * Board-level defence in depth (operator R6): an 'uncoded' row (statement captured, no score) never carries
 * its quote, speaker or links into the /nai payload (RSC or API JSON). The country page ledger shows the
 * public posture_evidence rows separately.
 */
export function stripUncodedEvidence(r: PostureView): PostureView {
  return r.stance === 'uncoded' && r.method === POSTURE_V2_METHOD ? { ...r, evidence: null, evidence_date: null } : r;
}

export const POSTURE_V2_DAYS_RPC = 'posture_v2_days';
/**
 * Every War Posture v2 coding day the public board can show, ascending (public.posture_v2_days(), migration
 * 20261014090000; viewer_posture_v2 publication rules). null when the RPC fails or is not applied yet
 * (PGRST202 / 42883): callers then fall back to the days on the board's own rows.
 */
export async function readPostureV2Days(supabase: Sb): Promise<number[] | null> {
  try {
    const { data, error } = await supabase.rpc(POSTURE_V2_DAYS_RPC);
    if (error || !Array.isArray(data)) return null;
    const days = data
      .map((d) => (typeof d === 'number' ? d : isObjDay(d) ? Number(d.posture_v2_days) : NaN))
      .filter((d) => Number.isInteger(d) && d > 0);
    return [...new Set(days)].sort((a, b) => a - b);
  } catch {
    return null;
  }
}
const isObjDay = (d: unknown): d is { posture_v2_days: unknown } => typeof d === 'object' && d !== null && 'posture_v2_days' in d;

export function currentConflictDayUtc(now = new Date()): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - Date.UTC(2026, 1, 28)) / 86_400_000) + 1;
}

/**
 * The /nai board. v2 when viewer_posture_v2 exists AND has rows. Every rule is per LINE = country x actor
 * (one line per country, two for YE: government and de facto authority — never merged). The frozen v1 row
 * (one number per country) belongs to the line V1_FALLBACK_ACTOR names (YE: government). A line "has v2"
 * only with a CODED v2 row (any stance but 'uncoded'; EG / AE / SA rows are always 'withheld', so they
 * always do):
 *   - coded           -> all its v2 rows (incl. 'uncoded' ones on other conflicts), never v1;
 *   - only 'uncoded'  -> its latest v1 row on or before the day (frozen, own day) with v2UncodedConflicts
 *                        set, replacing those uncoded rows; if it has no v1 row, its uncoded rows stay;
 *   - no v2 row       -> its latest v1 row on or before the day (frozen, own day);
 *   - EG / AE / SA with no v2 row -> withheldPolicyRow (never v1, never "nothing on record").
 * Otherwise v1 (nai_scores_v2) for its latest day (or `day`). `v1Loader` lets a browser caller replace
 * the v1 day read (see /warroom); the frozen fallback reads the tier-gated RPC only (never the table from
 * a browser), and uses `v1Loader` only if that RPC is missing.
 */
export async function getPostureBoard(
  supabase: Sb,
  {
    day = null,
    access,
    v1Loader,
    withDays = false,
  }: {
    day?: number | null;
    access: Access;
    v1Loader?: (day: number) => Promise<NaiV2View[]>;
    /** /nai and /api/viewer/posture only: also read the v2 coding days (one posture_v2_days call) for the stepper. */
    withDays?: boolean;
  },
): Promise<PostureBoard> {
  const today = currentConflictDayUtc();
  const [v2, conflicts, days] = await Promise.all([
    readPostureV2(supabase, { day: day ?? today }),
    getConflicts(supabase),
    withDays ? readPostureV2Days(supabase) : Promise.resolve(null),
  ]);
  if (!v2.missing && v2.rows.length > 0) {
    const boardDay = day ?? today;
    const v2All = v2.rows.map((r) => stripUncodedEvidence(fromV2Row(r, access)));
    // Every rule below is per LINE = country x actor (a single-actor country has one line = the country;
    // YE has two). A line "has v2" only with a CODED v2 row.
    const lineOf = (r: Pick<PostureView, 'country_code' | 'actor'>) => postureLineKey(r.country_code, r.actor);
    const codedLines = new Set(v2All.filter((r) => r.stance !== 'uncoded').map(lineOf));
    const v2Lines = new Set(v2All.map(lineOf));
    // Frozen v1 fallback for lines not yet coded in v2. When viewer_posture_v2 exists, viewer_nai_v2
    // exists too (same migration chain), so the browser never needs the table read here.
    let fallback = await getNaiV2LatestPerCountry(supabase, boardDay, access, { tableFallback: !v1Loader });
    if (fallback.via === 'missing' && v1Loader) {
      const viaLoader = (await v1Loader(boardDay)).filter((v) => v.conflict_day <= boardDay);
      fallback = { rows: viaLoader, via: 'table' };
    }
    const refIso = dayToIsoDate(boardDay);
    const v1Rows = fallback.rows
      // EG / AE / SA: no v1 row at all on a v2 board (their v2 rows, or the policy row, carry them).
      .filter((v) => !v.withheld && !isPostureWithheld(v.country_code))
      // fromV1View files the v1 row under its line (V1_FALLBACK_ACTOR: YE -> government, never the de facto line)
      .map((v) => fromV1View(v, refIso))
      .filter((r) => !r.withheld)
      .filter((r) => !codedLines.has(lineOf(r)))
      // A line whose only v2 rows are 'uncoded' keeps its frozen v1 row only when that row carries a number:
      // a v1 row with no E ("No position coded this day") must never hide the verbatim statement captured under v2.
      .filter((r) => !v2Lines.has(lineOf(r)) || r.stance === 'position')
      .map((r) => ({
        ...r,
        v2UncodedConflicts: v2All
          .filter((x) => lineOf(x) === lineOf(r) && x.stance === 'uncoded' && x.conflict_code !== null)
          .map((x) => x.conflict_code as string),
      }));
    const v1Lines = new Set(v1Rows.map(lineOf));
    // An uncoded-only line with a v1 row shows that v1 row (plus the note) instead of its uncoded v2 rows;
    // the country's OTHER line (YE) is untouched.
    const v2Rows = v2All.filter((r) => codedLines.has(lineOf(r)) || !v1Lines.has(lineOf(r)));
    // Policy row wherever EG / AE / SA have no row on the panel-wide conflict (where "nothing on record" is listed),
    // even if they have withheld evidence on another conflict.
    const onPanel = new Set([...v2Rows, ...v1Rows].filter((r) => r.conflict_code === POSTURE_PANEL_CONFLICT).map((r) => r.country_code));
    const policyRows = POSTURE_WITHHELD_CODES.filter((c) => !onPanel.has(c)).map((c) => withheldPolicyRow(c));
    return {
      schema: 'v2',
      day: boardDay,
      firstDay: NAI_V2_START_DAY,
      latestDay: today,
      conflicts,
      rows: [...v2Rows, ...policyRows, ...v1Rows],
      hasLatentAccess: access.latent,
      hasGapAccess: access.gap,
      // Absent unless asked for and readable: the stepper then uses the board's own rows (lib/posture-board.ts).
      ...(days ? { v2Days: days } : {}),
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

/**
 * Country page posture: the same per-line rule as the /nai board (YE: the government line and the de facto
 * authority line are decided separately; v1 can only stand in for the V1_FALLBACK_ACTOR line). A CODED v2 row (any stance but 'uncoded'; EG /
 * AE / SA rows are always 'withheld') -> the v2 rows. Only 'uncoded' v2 rows -> the latest v1 row (frozen,
 * own day) with v2UncodedConflicts set, unless there is no v1 row (then the uncoded rows) or the country is
 * withheld. No v2 row -> the latest v1 row (withheld for EG / AE / SA by fromV1View). Ledger unchanged.
 */
export async function getCountryPosture(supabase: Sb, code: string, access: Access): Promise<CountryPosture> {
  const cc = code.toUpperCase();
  const [v2, ledger] = await Promise.all([readPostureV2(supabase, { country: cc }), getPositionsLedger(supabase, cc)]);
  const v2Rows = !v2.missing ? v2.rows.map((r) => fromV2Row(r, access)) : [];
  // Same per-LINE rule as the board: the frozen v1 row (one number per country) belongs to one line only
  // (V1_FALLBACK_ACTOR); the country's other line (YE de facto authority) is always its v2 rows.
  const v1Actor = v1ActorFor(cc);
  const lineRows = v2Rows.filter((r) => r.actor === v1Actor);
  const others = v2Rows.filter((r) => r.actor !== v1Actor);
  if (lineRows.some((r) => r.stance !== 'uncoded')) {
    return { schema: 'v2', rows: v2Rows, ledger };
  }
  const latest = await getNaiV2CountryLatest(supabase, cc, access);
  const v1 = latest ? fromV1View(latest, new Date().toISOString().slice(0, 10)) : null;
  if (lineRows.length > 0) {
    // Uncoded-only line: keep the frozen v1 number until a v2 position is coded (never for EG / AE / SA).
    // ...and only a v1 row that carries a number: a no-E v1 row would hide the captured statement.
    if (!v1 || v1.withheld || isPostureWithheld(cc) || v1.stance !== 'position') return { schema: 'v2', rows: v2Rows, ledger };
    const pending = lineRows.map((r) => r.conflict_code).filter((c): c is string => c !== null);
    return { schema: others.length > 0 ? 'v2' : 'v1', rows: [{ ...v1, v2UncodedConflicts: pending }, ...others], ledger };
  }
  return { schema: others.length > 0 ? 'v2' : 'v1', rows: [...(v1 ? [v1] : []), ...others], ledger };
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
    .sort(
      (a, b) =>
        Math.abs(b.delta) - Math.abs(a.delta) ||
        a.row.country_code.localeCompare(b.row.country_code) ||
        // two lines of one country (YE) are two moves, each with its own delta; government first
        Number(a.row.actor !== POSTURE_DEFAULT_ACTOR) - Number(b.row.actor !== POSTURE_DEFAULT_ACTOR),
    );
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
