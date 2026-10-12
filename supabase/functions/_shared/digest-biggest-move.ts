/**
 * Daily-digest "biggest move" selection, kept free of Deno / network APIs so tests/unit can run it under Node
 * (tests/unit/digest-withheld.check.ts). Used by supabase/functions/send-digest.
 *
 * Editorial policy (War Posture v2, public.posture_publication_policy): the governments of Egypt, the UAE and
 * Saudi Arabia are never given a posture number, band, category, label or colour, and are never ranked. The
 * digest reads legacy nai_scores (frozen Days 1-35), which still holds EG / AE / SA rows, so they are removed
 * from the candidates here and the templates refuse to render them as a second line of defence.
 */

/** Mirror of lib/posture.ts POSTURE_WITHHELD_CODES (edge functions cannot import lib/; the unit test checks they match). */
export const WITHHELD_POSTURE_CODES = ["EG", "AE", "SA"] as const;

/** Display names of the withheld countries (lower-case), so a mislabelled code cannot slip a name through. */
const WITHHELD_POSTURE_NAMES = [
  "egypt",
  "arab republic of egypt",
  "uae",
  "united arab emirates",
  "saudi arabia",
  "kingdom of saudi arabia",
  "ksa",
] as const;

export function isWithheldPostureCode(code: unknown): boolean {
  return (
    typeof code === "string" &&
    (WITHHELD_POSTURE_CODES as readonly string[]).includes(code.trim().toUpperCase())
  );
}

/** True when a move names a withheld country by code OR by display name. */
export function isWithheldPostureMove(
  move: { countryCode?: unknown; countryName?: unknown } | null | undefined,
): boolean {
  if (!move) return false;
  if (isWithheldPostureCode(move.countryCode)) return true;
  const name = typeof move.countryName === "string" ? move.countryName.trim().toLowerCase() : "";
  return (WITHHELD_POSTURE_NAMES as readonly string[]).includes(name);
}

export interface NaiMoveRow {
  country_code: unknown;
  conflict_day: unknown;
  expressed_score: unknown;
  category: unknown;
}

export interface BiggestMove {
  countryCode: string;
  countryName: string;
  delta: number;
  newScore: number;
  category: string;
}

export function pickBiggestMove(
  rows: readonly NaiMoveRow[],
  naiDay: number,
  prevDay: number,
  countryNames: Record<string, string>,
): BiggestMove | null {
  // EG / AE / SA are never candidates: never ranked, never given a score or category.
  const candidates = rows.filter((r) => !isWithheldPostureCode(r.country_code));
  const yesterdayMap = new Map<string, { score: number; category: string }>();
  for (const r of candidates) {
    if (r.conflict_day === prevDay) {
      yesterdayMap.set(r.country_code as string, {
        score: Number(r.expressed_score),
        category: String(r.category ?? "STABLE"),
      });
    }
  }
  let best: { code: string; delta: number; newScore: number; category: string } | null = null;
  for (const r of candidates) {
    if (r.conflict_day !== naiDay) continue;
    const code = r.country_code as string;
    const newScore = Number(r.expressed_score);
    const prev = yesterdayMap.get(code);
    if (prev === undefined) continue;
    const delta = Math.round((newScore - prev.score) * 10) / 10;
    const abs = Math.abs(delta);
    if (best == null || abs > Math.abs(best.delta)) {
      best = {
        code,
        delta,
        newScore: Math.round(newScore),
        category: String(r.category ?? prev.category ?? "STABLE"),
      };
    }
  }
  if (!best) return null;
  const move: BiggestMove = {
    countryCode: best.code,
    countryName: countryNames[best.code] ?? best.code,
    delta: best.delta,
    newScore: best.newScore,
    category: best.category,
  };
  return isWithheldPostureMove(move) ? null : move;
}
