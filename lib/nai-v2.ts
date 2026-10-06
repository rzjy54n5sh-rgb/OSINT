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
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NaiCategoryV2, NaiScoreV2, NaiSourceV2 } from '@/types/supabase';

export const NAI_V2_TABLE = 'nai_scores_v2';
export const NAI_V2_METHOD = 'war-posture-v1';
export const NAI_V2_START_DAY = 221;

export const NAI_V2_EMPTY_TEXT = `War Posture index starts Day ${NAI_V2_START_DAY} — no scored rows yet`;
export const NAI_V2_UNSCORABLE_TEXT = 'Insufficient evidence for latent position';
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

export const NAI_V2_SCALE_TEXT =
  '0 = demands immediate ceasefire · 50 = conditional or ambivalent · 100 = backs continuing or escalating military action (by any party)';

export const NAI_V2_DEFINITION =
  "Narrative Alignment Index (NAI): whether a state's official war posture and its society's posture point the same way. Both are scored on one party-neutral scale.";

/** Memo §6 wording. Thresholds 10/20/30 and midpoint 50 are conventions, not empirical findings. */
export const NAI_V2_CATEGORY_DEFS: { category: NaiCategoryV2; text: string }[] = [
  { category: 'ALIGNED', text: 'gap under 10, government and society move together' },
  { category: 'STABLE', text: 'gap 10–19, minor divergence' },
  { category: 'TENSION', text: 'gap 20–29, visible divergence' },
  { category: 'FRACTURE', text: 'gap 30+, same side of the question, very different intensity' },
  { category: 'INVERSION', text: 'gap 30+, government and society on opposite sides of the war question' },
  {
    category: 'UNSCORABLE',
    text: 'societal evidence missing or too uncertain (e.g. internet blackout); no category is shown rather than a guessed one',
  },
];

export const NAI_V2_ARCHIVE_NOTE =
  'Archived Days 1–35 used a different, retired definition and are not comparable.';

/**
 * POSTURE LABEL (official) — a display convention derived ONLY from the expressed score E.
 *
 * The cut-points below (25 / 50 / 75) and the four wordings are CONVENTIONS chosen by the operator
 * on 2026-10-06. They are not empirical findings and not a statistical classification.
 * This label is ADDITIONAL to the NAI category (which stays generated in Postgres and is never
 * recomputed or replaced here): it describes the official narrative only and says nothing about
 * society or the gap. It exists so the map is not flat grey when the latent band is missing.
 *
 *   E  0–24  Ceasefire-seeking
 *   E 25–49  De-escalatory
 *   E 50–74  Conditional pressure
 *   E 75–100 Escalatory
 *
 * NULL / non-finite / out-of-range (<0 or >100) E => no label.
 */
export const NAI_POSTURE_LABELS = ['Ceasefire-seeking', 'De-escalatory', 'Conditional pressure', 'Escalatory'] as const;
export type PostureLabel = (typeof NAI_POSTURE_LABELS)[number];

/** Exclusive upper bound of each label's E range, in NAI_POSTURE_LABELS order (last = 100 inclusive). */
export const NAI_POSTURE_CUTS = [25, 50, 75] as const;

/** UI heading for the label. Always shown with this name so it is never confused with the NAI category. */
export const NAI_POSTURE_HEADING = 'Posture (official)';
export const NAI_POSTURE_NOTE =
  'Posture (official) is a display convention derived only from the expressed score (0–24 Ceasefire-seeking, 25–49 De-escalatory, 50–74 Conditional pressure, 75–100 Escalatory). The cut-points are operator conventions (2026-10-06), not empirical findings. It is separate from the NAI category.';
export const NAI_POSTURE_LEGEND_TEXT = 'Colour = official posture (latent evidence insufficient)';

/**
 * Single-hue (violet) ramp, light -> dark = ceasefire-seeking -> escalatory. Deliberately not in the
 * category palette (green/blue/yellow/orange/red/grey). Contrast vs the dark UI surfaces
 * (#070A0F legend / #0C1018 panel): 11.4, 7.4, 4.6, 3.4 : 1; map dots also carry the existing #8A9BB5 stroke.
 */
export const NAI_POSTURE_COLOR: Record<PostureLabel, string> = {
  'Ceasefire-seeking': '#CBBBFF',
  'De-escalatory': '#A98CF8',
  'Conditional pressure': '#8A5FEA',
  Escalatory: '#7048DC',
};

export function postureLabel(e: number | null | undefined): PostureLabel | null {
  if (typeof e !== 'number' || !Number.isFinite(e) || e < 0 || e > 100) return null;
  const i = NAI_POSTURE_CUTS.findIndex((cut) => e < cut);
  return NAI_POSTURE_LABELS[i === -1 ? NAI_POSTURE_LABELS.length - 1 : i];
}

export function postureColor(e: number | null | undefined): string | null {
  const l = postureLabel(e);
  return l === null ? null : NAI_POSTURE_COLOR[l];
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
  gap: number | null;
  gap_size: number | null;
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
  const category = isNaiCategoryV2(row.category) ? row.category : 'UNSCORABLE';
  const sources = cleanSources(row.sources);
  const lSources = sources.filter((s) => s.feeds === 'L');
  const e = toNum(row.expressed_score);
  const pe = prev ? toNum(prev.expressed) : null;
  const categoryVisible = access.gap || category === 'UNSCORABLE';
  return {
    country_code: row.country_code,
    conflict_day: row.conflict_day,
    as_of: row.as_of,
    expressed_score: e,
    expressed_basis: row.expressed_basis ?? null,
    latent_low: access.latent ? toNum(row.latent_low) : null,
    latent_high: access.latent ? toNum(row.latent_high) : null,
    latent_basis: access.latent ? (row.latent_basis ?? null) : null,
    latentLocked: !access.latent,
    gap: access.gap ? toNum(row.gap) : null,
    gap_size: access.gap ? toNum(row.gap_size) : null,
    category: categoryVisible ? category : null,
    categoryLocked: !categoryVisible,
    confidence: row.confidence,
    sources: access.latent ? sources : sources.filter((s) => s.feeds !== 'L'),
    hiddenLatentSourceCount: access.latent ? 0 : lSources.length,
    delta: e !== null && pe !== null ? e - pe : null,
    prevDay: prev ? prev.day : null,
  };
}

type Sb = Pick<SupabaseClient, 'from'>;

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
 */
export async function getNaiV2Day(
  supabase: Sb,
  day: number,
  access: { latent: boolean; gap: boolean },
): Promise<NaiV2View[]> {
  try {
    const { data, error } = await supabase
      .from(NAI_V2_TABLE)
      .select('*')
      .eq('method_version', NAI_V2_METHOD)
      .eq('conflict_day', day);
    if (error || !data) return [];
    const rows = data as NaiScoreV2[];

    const { data: prevDayRow } = await supabase
      .from(NAI_V2_TABLE)
      .select('conflict_day')
      .eq('method_version', NAI_V2_METHOD)
      .lt('conflict_day', day)
      .order('conflict_day', { ascending: false })
      .limit(1)
      .maybeSingle();
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

    return rows
      .map((r) =>
        toNaiV2View(
          r,
          access,
          prevDay != null && prevMap.has(r.country_code) ? { day: prevDay, expressed: prevMap.get(r.country_code) ?? null } : null,
        ),
      )
      .sort((a, b) => (b.expressed_score ?? -1) - (a.expressed_score ?? -1) || a.country_code.localeCompare(b.country_code));
  } catch {
    return [];
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
