/**
 * NAI War Posture (C2) — shared constants, wording and read helpers for `nai_scores_v2`.
 *
 * Operator ruling 2026-10-06 (NAI decision memo §2 C2, §3, §5, §6):
 *  - E and the latent band share ONE party-neutral scale (0 = immediate unconditional ceasefire,
 *    50 = conditional/ambivalent, 100 = backs continuing or escalating military action).
 *  - category is GENERATED in Postgres by public.nai_c2_category(E, latent_low, latent_high);
 *    the UI never recomputes it.
 *  - Legacy `nai_scores` (Days 1-35) is archived, a different axis, NOT comparable — it is never
 *    used as a fallback for "current" NAI.
 */
import { postureBandVar, postureScaleVar } from './design-tokens';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NaiCategoryV2, NaiScoreV2, NaiSourceV2 } from '@/types/supabase';
import { rpcWithFallback, type ReadVia } from '@/lib/supabase/rpc-fallback';

export const NAI_V2_TABLE = 'nai_scores_v2';
export const NAI_V2_METHOD = 'war-posture-v1';
export const NAI_V2_START_DAY = 221;
/**
 * Tier-gated read of nai_scores_v2 (migration 20261008090000_security_hardening). It returns the
 * paid columns (latent band, gap, category, L sources) only when the CALLER's JWT has the feature,
 * plus latent_access / gap_access / hidden_latent_source_count. Anonymous = free tier.
 */
export const NAI_V2_RPC = 'viewer_nai_v2';

export const NAI_V2_EMPTY_TEXT = `War Posture index starts Day ${NAI_V2_START_DAY} — no scored rows yet`;
/**
 * UNSCORABLE has TWO causes (nai_c2_category, migration 20261006120000): (a) no admissible latent
 * evidence (band NULL), or (b) a latent band that spans more than one category, so no single
 * category holds across the whole band. Use unscorableReason() to say which one applies; this
 * generic text is only for viewers whose tier cannot see the band.
 */
export const NAI_V2_UNSCORABLE_TEXT =
  'No single category: latent evidence is missing, or its band spans more than one category';
export const NAI_V2_UNSCORABLE_NO_EVIDENCE_TEXT = 'No admissible latent evidence, so no category is assigned';
export const NAI_V2_UNSCORABLE_SPANS_TEXT =
  'The latent band spans more than one category, so no single category is assigned';

/** Which latent evidence the viewer can see for a row. */
export type LatentEvidence = 'band' | 'none' | 'locked';

/** Plain-language reason a row is UNSCORABLE, matching the generated-column rule exactly. */
export function unscorableReason(evidence: LatentEvidence, expressed: number | null = 0): string {
  if (expressed === null) return 'No sourced expressed score, so no category is assigned';
  if (evidence === 'band') return NAI_V2_UNSCORABLE_SPANS_TEXT;
  if (evidence === 'none') return NAI_V2_UNSCORABLE_NO_EVIDENCE_TEXT;
  return NAI_V2_UNSCORABLE_TEXT;
}
export const NAI_ARCHIVE_LABEL = 'Archived — previous method (not comparable)';

/** Grey for UNSCORABLE is deliberate: no category is shown rather than a guessed one. */
export const NAI_V2_COLOR: Record<NaiCategoryV2, string> = {
  ALIGNED: '#4EC98A',
  STABLE: '#4A8FE8',
  TENSION: '#E8C547',
  FRACTURE: '#E8874A',
  INVERSION: '#E05252',
  UNSCORABLE: '#6B7280',
};
/** Marker colour when the viewer's tier cannot see the category (distinct from UNSCORABLE grey). */
export const NAI_V2_LOCKED_COLOR = '#1A2233';
/** Marker colour for a tracked country with no nai_scores_v2 row for the day (distinct from both). */
export const NAI_V2_NODATA_COLOR = '#2E3A4E';

export const NAI_V2_SCALE_TEXT =
  '0 = demands immediate ceasefire · 50 = conditional or ambivalent · 100 = backs continuing or escalating military action (by any party)';

export const NAI_V2_DEFINITION =
  "War Posture: whether a state's official war posture and its society's posture point the same way. Both are scored on one party-neutral scale.";

/** Memo §6 wording. Thresholds 10/20/30 and midpoint 50 are conventions, not empirical findings. */
export const NAI_V2_CATEGORY_DEFS: { category: NaiCategoryV2; text: string }[] = [
  { category: 'ALIGNED', text: 'gap under 10, government and society move together' },
  { category: 'STABLE', text: 'gap 10–19, minor divergence' },
  { category: 'TENSION', text: 'gap 20–29, visible divergence' },
  { category: 'FRACTURE', text: 'gap 30+, same side of the question, very different intensity' },
  { category: 'INVERSION', text: 'gap 30+, government and society on opposite sides of the war question' },
  {
    category: 'UNSCORABLE',
    text: 'no single category: either there is no admissible latent evidence, or the latent band spans more than one category (a category is assigned only when every value in the band gives the same one); no category is shown rather than a guessed one',
  },
];

export const NAI_V2_ARCHIVE_NOTE =
  'Archived Days 1–35 used a different, retired definition and are not comparable.';

/**
 * POSTURE LABEL (official) — derived ONLY from the expressed score E. War Posture v2 (operator-approved
 * redesign 2026-10-08) replaced the adjective labels ("Escalatory", "De-escalatory") with five neutral
 * behavioural labels that say what the government says it wants. The bands are the same as the SQL
 * function public.posture_label_for_score and lib/posture.ts (anchors 0/25/50/75/100 at the centre):
 *
 *   E  0–12  Seeks immediate ceasefire
 *   E 13–37  Conditional de-escalation
 *   E 38–62  Ambivalent
 *   E 63–87  Supports continued pressure
 *   E 88–100 Supports escalation
 *
 * Cut-points are conventions, not empirical findings. Separate from the War Posture category.
 * NULL / non-finite / out-of-range E => no label.
 */
export const NAI_POSTURE_LABELS = [
  'Seeks immediate ceasefire',
  'Conditional de-escalation',
  'Ambivalent',
  'Supports continued pressure',
  'Supports escalation',
] as const;
export type PostureLabel = (typeof NAI_POSTURE_LABELS)[number];

/** Exclusive upper bound of each label's E range, in NAI_POSTURE_LABELS order (last = 100 inclusive). */
export const NAI_POSTURE_CUTS = [13, 38, 63, 88] as const;

/** UI heading for the label. Always shown with this name so it is never confused with the NAI category. */
export const NAI_POSTURE_HEADING = 'Posture (official)';
export const NAI_POSTURE_NOTE =
  'Posture (official) describes what a government says it wants, from its expressed score only: 0–12 Seeks immediate ceasefire, 13–37 Conditional de-escalation, 38–62 Ambivalent, 63–87 Supports continued pressure, 88–100 Supports escalation. The cut-points are conventions, not empirical findings. It is separate from the War Posture category. Egypt, the UAE and Saudi Arabia get no label (stated positions only).';
export const NAI_POSTURE_LEGEND_TEXT = 'Colour = official posture';

/** Swatch colour (theme-aware, never text) of each label's anchor band; same as lib/posture.ts POSTURE_LABELS. */
export const NAI_POSTURE_COLOR: Record<PostureLabel, string> = {
  'Seeks immediate ceasefire': postureBandVar(1),
  'Conditional de-escalation': postureBandVar(1),
  Ambivalent: postureBandVar(2),
  'Supports continued pressure': postureBandVar(3),
  'Supports escalation': postureBandVar(4),
};

export function postureLabel(e: number | null | undefined): PostureLabel | null {
  if (typeof e !== 'number' || !Number.isFinite(e) || e < 0 || e > 100) return null;
  const v = Math.round(e);
  const i = NAI_POSTURE_CUTS.findIndex((cut) => v < cut);
  return NAI_POSTURE_LABELS[i === -1 ? NAI_POSTURE_LABELS.length - 1 : i];
}

/**
 * Swatch colour for a score: its SCORE band (0–30 / 31–60 / 61–80 / 81–100), never the label's anchor.
 * EG / AE / SA (stated positions only) get none, even if a score is passed.
 */
export function postureColor(e: number | null | undefined, countryCode?: string | null): string | null {
  return postureLabel(e) === null ? null : postureScaleVar(e, { countryCode });
}

/**
 * Editorial policy (War Posture v2, red-team cluster 10): no public 0–100 grade, label, band or category
 * for Egypt, the UAE or Saudi Arabia. Mirrors public.posture_publication_policy; applied in toNaiV2View
 * so every consumer withholds them even before the database does.
 */
export const NAI_V2_WITHHELD_CODES = ['EG', 'AE', 'SA'] as const;
export function isNaiV2Withheld(code: string | null | undefined): boolean {
  return !!code && (NAI_V2_WITHHELD_CODES as readonly string[]).includes(code.toUpperCase());
}

const CATEGORIES: readonly NaiCategoryV2[] = ['ALIGNED', 'STABLE', 'TENSION', 'FRACTURE', 'INVERSION', 'UNSCORABLE'];
export function isNaiCategoryV2(x: unknown): x is NaiCategoryV2 {
  return typeof x === 'string' && (CATEGORIES as readonly string[]).includes(x);
}

/** Row as handed to client components — tier-gated fields are nulled SERVER-side, never just hidden. */
export interface NaiV2View {
  country_code: string;
  conflict_day: number;
  as_of: string;
  expressed_score: number | null;
  expressed_basis: string | null;
  /** null when locked for this tier OR when there is no latent evidence (see latentLocked). */
  latent_low: number | null;
  latent_high: number | null;
  latent_basis: string | null;
  latentLocked: boolean;
  /** 'band' = band visible, 'none' = no admissible latent evidence, 'locked' = tier cannot see it. */
  latentEvidence: LatentEvidence;
  gap: number | null;
  gap_size: number | null;
  /** true = the viewer's tier cannot see gap / gap_size (they are null), as opposed to "no gap". */
  gapLocked: boolean;
  /** UNSCORABLE is always disclosed (it is a data-quality statement, not premium content). */
  category: NaiCategoryV2 | null;
  categoryLocked: boolean;
  confidence: NaiScoreV2['confidence'];
  /** E-feeding sources always; L-feeding sources only when the latent band is visible. */
  sources: NaiSourceV2[];
  hiddenLatentSourceCount: number;
  /** E change vs this country's row on `prevDay` (the previous War Posture day present), else null. */
  delta: number | null;
  prevDay: number | null;
  /** Stated-positions-only country (EG / AE / SA): every graded field above is null. */
  withheld: boolean;
}

const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

function cleanSources(raw: unknown): NaiSourceV2[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is NaiSourceV2 =>
      !!s && typeof s === 'object' && typeof (s as NaiSourceV2).url === 'string' && /^https?:\/\//i.test((s as NaiSourceV2).url),
  );
}

export function toNaiV2View(
  row: NaiScoreV2,
  access: { latent: boolean; gap: boolean },
  prev?: { day: number; expressed: number | null } | null,
): NaiV2View {
  // Effective access = what the caller's tier allows AND what the database actually returned.
  // viewer_nai_v2 reports latent_access / gap_access for the calling JWT; a pre-migration table
  // read has neither flag, so only the tier check applies (undefined !== false).
  const latent = access.latent && row.latent_access !== false;
  const gap = access.gap && row.gap_access !== false;
  // Use the RAW category: the RPC returns null for a locked category, which must stay locked and
  // never fall back to UNSCORABLE. UNSCORABLE itself is always disclosed (data-quality statement).
  const rawCategory = isNaiCategoryV2(row.category) ? row.category : null;
  const category: NaiCategoryV2 | null = gap ? (rawCategory ?? 'UNSCORABLE') : rawCategory === 'UNSCORABLE' ? 'UNSCORABLE' : null;
  const sources = cleanSources(row.sources);
  const lSources = sources.filter((s) => s.feeds === 'L');
  if (isNaiV2Withheld(row.country_code)) {
    // Positions-ledger-only policy: keep identity, day, confidence and the E-side cited reporting only.
    return {
      country_code: row.country_code,
      conflict_day: row.conflict_day,
      as_of: row.as_of,
      expressed_score: null,
      expressed_basis: null,
      latent_low: null,
      latent_high: null,
      latent_basis: null,
      latentLocked: false,
      latentEvidence: 'none',
      gap: null,
      gap_size: null,
      gapLocked: false,
      category: null,
      categoryLocked: false,
      confidence: row.confidence,
      sources: sources.filter((s) => s.feeds !== 'L'),
      hiddenLatentSourceCount: 0,
      delta: null,
      prevDay: prev ? prev.day : null,
      withheld: true,
    };
  }
  const e = toNum(row.expressed_score);
  const pe = prev ? toNum(prev.expressed) : null;
  return {
    country_code: row.country_code,
    conflict_day: row.conflict_day,
    as_of: row.as_of,
    expressed_score: e,
    expressed_basis: row.expressed_basis ?? null,
    latent_low: latent ? toNum(row.latent_low) : null,
    latent_high: latent ? toNum(row.latent_high) : null,
    latent_basis: latent ? (row.latent_basis ?? null) : null,
    latentLocked: !latent,
    latentEvidence: !latent ? 'locked' : toNum(row.latent_low) === null ? 'none' : 'band',
    gap: gap ? toNum(row.gap) : null,
    gap_size: gap ? toNum(row.gap_size) : null,
    gapLocked: !gap,
    category,
    categoryLocked: category === null,
    confidence: row.confidence,
    sources: latent ? sources : sources.filter((s) => s.feeds !== 'L'),
    // The RPC has already removed L sources for a locked viewer and reports how many it removed.
    hiddenLatentSourceCount: latent ? 0 : (row.hidden_latent_source_count ?? lSources.length),
    delta: e !== null && pe !== null ? e - pe : null,
    prevDay: prev ? prev.day : null,
    withheld: false,
  };
}

type Sb = Pick<SupabaseClient, 'from' | 'rpc'>;

/** First and latest conflict_day present in nai_scores_v2 for the current method (null = no rows). */
export async function getNaiV2DayRange(supabase: Sb): Promise<{ firstDay: number | null; latestDay: number | null }> {
  const pick = async (ascending: boolean): Promise<number | null> => {
    try {
      const { data } = await supabase
        .from(NAI_V2_TABLE)
        .select('conflict_day')
        .eq('method_version', NAI_V2_METHOD)
        .order('conflict_day', { ascending })
        .limit(1)
        .maybeSingle();
      const d = (data as { conflict_day?: number } | null)?.conflict_day;
      return typeof d === 'number' && Number.isFinite(d) ? d : null;
    } catch {
      return null;
    }
  };
  const [firstDay, latestDay] = await Promise.all([pick(true), pick(false)]);
  return { firstDay, latestDay };
}

/**
 * Rows for one conflict day plus each country's E delta vs the previous War Posture day present
 * (max day < `day`). Never reads legacy nai_scores.
 *
 * Paid fields come from the viewer_nai_v2 RPC, redacted for the CALLER's JWT (a cookie-less public
 * client = anonymous = free tier). Before migration 20261008090000 the RPC does not exist and the
 * old table read runs instead; `access` then does the redaction. `tableFallback: false` returns
 * `via: 'missing'` instead of reading the table (for browser callers that must not receive paid
 * columns, see /warroom).
 */
export async function getNaiV2DayResult(
  supabase: Sb,
  day: number,
  access: { latent: boolean; gap: boolean },
  { tableFallback = true }: { tableFallback?: boolean } = {},
): Promise<{ rows: NaiV2View[]; via: ReadVia }> {
  try {
    // The day's rows and the previous War Posture day are independent: one round trip, not two.
    const [dayRes, { data: prevDayRow }] = await Promise.all([
      rpcWithFallback<NaiScoreV2[]>(
        () => supabase.rpc(NAI_V2_RPC, { p_day: day, p_method: NAI_V2_METHOD }),
        tableFallback
          ? () => supabase.from(NAI_V2_TABLE).select('*').eq('method_version', NAI_V2_METHOD).eq('conflict_day', day)
          : null,
      ),
      // Granted (free) columns only: works before and after the migration.
      supabase
        .from(NAI_V2_TABLE)
        .select('conflict_day')
        .eq('method_version', NAI_V2_METHOD)
        .lt('conflict_day', day)
        .order('conflict_day', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (dayRes.error || !dayRes.data) return { rows: [], via: dayRes.via };
    const rows = dayRes.data;

    const prevDay = (prevDayRow as { conflict_day?: number } | null)?.conflict_day ?? null;
    const prevMap = new Map<string, number | null>();
    if (prevDay != null) {
      const { data: prevRows } = await supabase
        .from(NAI_V2_TABLE)
        .select('country_code, expressed_score')
        .eq('method_version', NAI_V2_METHOD)
        .eq('conflict_day', prevDay);
      for (const r of (prevRows ?? []) as { country_code: string; expressed_score: number | null }[]) {
        prevMap.set(r.country_code, r.expressed_score);
      }
    }

    return {
      via: dayRes.via,
      rows: rows
        .map((r) =>
          toNaiV2View(
            r,
            access,
            prevDay != null && prevMap.has(r.country_code) ? { day: prevDay, expressed: prevMap.get(r.country_code) ?? null } : null,
          ),
        )
        .sort((a, b) => (b.expressed_score ?? -1) - (a.expressed_score ?? -1) || a.country_code.localeCompare(b.country_code)),
    };
  } catch {
    return { rows: [], via: 'rpc' };
  }
}

export async function getNaiV2Day(
  supabase: Sb,
  day: number,
  access: { latent: boolean; gap: boolean },
): Promise<NaiV2View[]> {
  return (await getNaiV2DayResult(supabase, day, access)).rows;
}

/**
 * Latest War Posture row for ONE country (current method), plus its E delta vs that country's
 * previous War Posture row. Never reads legacy nai_scores. Returns null when the country has no row.
 * RPC first (paid fields redacted for the caller's JWT), table read before the migration.
 */
export async function getNaiV2CountryLatest(
  supabase: Sb,
  countryCode: string,
  access: { latent: boolean; gap: boolean },
): Promise<NaiV2View | null> {
  try {
    const code = countryCode.toUpperCase();
    // RPC order: conflict_day DESC (p_ascending defaults to false).
    const { data, error } = await rpcWithFallback<NaiScoreV2[]>(
      () => supabase.rpc(NAI_V2_RPC, { p_country: code, p_limit: 2, p_method: NAI_V2_METHOD }),
      () =>
        supabase
          .from(NAI_V2_TABLE)
          .select('*')
          .eq('method_version', NAI_V2_METHOD)
          .eq('country_code', code)
          .order('conflict_day', { ascending: false })
          .limit(2),
    );
    if (error || !data || data.length === 0) return null;
    const [latest, prev] = data;
    return toNaiV2View(latest!, access, prev ? { day: prev.conflict_day, expressed: prev.expressed_score } : null);
  } catch {
    return null;
  }
}

/**
 * Each country's LATEST War Posture v1 row on or before `onOrBefore` (one row per country, its own
 * conflict_day). War Posture v1 is frozen (no new rows), so this is the per-country fallback the /nai
 * board uses while War Posture v2 is rolled out country by country. No E delta (v1 never drives a move).
 *
 * viewer_nai_v2 (tier-gated for the caller's JWT) has no "on or before" filter, so it returns the whole
 * frozen v1 series (a few hundred rows at most) and the day filter runs here. `tableFallback: false`
 * returns `via: 'missing'` instead of reading the table (browser callers, see getNaiV2DayResult).
 */
export async function getNaiV2LatestPerCountry(
  supabase: Sb,
  onOrBefore: number,
  access: { latent: boolean; gap: boolean },
  { tableFallback = true }: { tableFallback?: boolean } = {},
): Promise<{ rows: NaiV2View[]; via: ReadVia }> {
  try {
    const { data, error, via } = await rpcWithFallback<NaiScoreV2[]>(
      () => supabase.rpc(NAI_V2_RPC, { p_limit: 5000, p_method: NAI_V2_METHOD }),
      tableFallback
        ? () =>
            supabase
              .from(NAI_V2_TABLE)
              .select('*')
              .eq('method_version', NAI_V2_METHOD)
              .lte('conflict_day', onOrBefore)
              .order('conflict_day', { ascending: false })
              .limit(5000)
        : null,
    );
    if (error || !data) return { rows: [], via };
    const latest = new Map<string, NaiScoreV2>();
    for (const r of data) {
      if (typeof r.conflict_day !== 'number' || r.conflict_day > onOrBefore) continue;
      const code = String(r.country_code ?? '').toUpperCase();
      const have = latest.get(code);
      if (!have || r.conflict_day > have.conflict_day) latest.set(code, r);
    }
    return {
      via,
      rows: [...latest.values()]
        .map((r) => toNaiV2View(r, access, null))
        .sort((a, b) => a.country_code.localeCompare(b.country_code)),
    };
  } catch {
    return { rows: [], via: 'rpc' };
  }
}

export function formatBand(lo: number | null, hi: number | null): string {
  if (lo === null || hi === null) return '—';
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

export function formatGap(g: number | null): string {
  if (g === null) return '—';
  const r = Math.round(g * 10) / 10;
  return `${r > 0 ? '+' : ''}${r}`;
}
