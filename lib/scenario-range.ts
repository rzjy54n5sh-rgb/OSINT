/**
 * Honest arithmetic for the scenario panel (strategy agreed with the operator 2026-10-08).
 *
 * 1. B is a RANGE, not a point. A, C and D are each measured by their own markets and can happen in
 *    the same window (a strike in week 1 and a deal in week 3 count for both D and A). B is
 *    "none of them", so P(B) = 1 − P(A ∪ C ∪ D). The Fréchet bounds on a union give
 *        max(P(A), P(C), P(D))  ≤  P(A ∪ C ∪ D)  ≤  min(1, P(A) + P(C) + P(D))
 *    hence, in percent,
 *        B ∈ [ max(0, 100 − (A + C + D)) ,  100 − max(A, C, D) ].
 *    The single published B (100 − A − C − D) is the LOW end: it is right only if the events never
 *    co-occur, which their definitions do not guarantee.
 *
 * 2. A fixed 30-day reading. A "by 31 October" price falls every day nothing happens (time decay,
 *    not news). Assuming a constant hazard over the market's remaining life τ days,
 *        p30 = 1 − (1 − p)^(30 / τ).
 *    It is a conversion of the market price, not a market price, and is labelled as such.
 *
 * Pure functions, no I/O; safe on server and client. Unit tests: tests/unit/scenario-range.check.ts.
 */

export interface ResidualRange {
  /** Low end in the same unit as the inputs (percent by default). */
  low: number;
  /** High end. */
  high: number;
  /** true when low === high (one component, or every component but one is zero). */
  exact: boolean;
  /** Component codes that were null / not finite: their value is unknown, so the bounds are widened. */
  missing: string[];
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Fréchet range of the residual "none of the components" for components measured in [0, total].
 *
 *  - Values are clamped into [0, total].
 *  - A null / non-finite component is UNKNOWN (anywhere in [0, total]): the low end drops to 0 and only
 *    the known components bound the high end. Its code is listed in `missing`.
 *  - No known component at all → null (nothing to bound; the caller shows "unmeasured").
 *  - Sum above `total` → low end clamps at 0.
 *  - One component → low = high = total − value (exact).
 */
export function residualRange(
  components: Record<string, number | null | undefined>,
  total = 100,
): ResidualRange | null {
  const known: number[] = [];
  const missing: string[] = [];
  for (const [code, v] of Object.entries(components)) {
    if (finite(v)) known.push(Math.min(total, Math.max(0, v)));
    else missing.push(code);
  }
  if (known.length === 0) return null;
  const sum = known.reduce((a, b) => a + b, 0);
  const max = Math.max(...known);
  const high = total - max;
  const low = missing.length > 0 ? 0 : Math.max(0, total - sum);
  return { low, high, exact: low === high, missing };
}

/** "60–78%" (en dash), "80%" when exact. Values are rounded to whole numbers for display. */
export function formatRange(r: ResidualRange, unit = '%'): string {
  const lo = Math.round(r.low);
  const hi = Math.round(r.high);
  return lo === hi ? `${lo}${unit}` : `${lo}–${hi}${unit}`;
}

/** Days between two instants (fractional); null when either is missing / unparseable. */
export function daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number | null {
  if (!fromIso || !toIso) return null;
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / 86_400_000;
}

/**
 * Constant-hazard conversion of a probability `p` (0–1) over `daysToHorizon` days to a fixed horizon
 * (default 30 days): 1 − (1 − p)^(horizon / daysToHorizon).
 * Returns null for a missing / non-finite p or a non-positive / non-finite days value.
 */
export function constantHorizonProbability(
  p: number | null | undefined,
  daysToHorizon: number | null | undefined,
  horizonDays = 30,
): number | null {
  if (!finite(p) || !finite(daysToHorizon) || daysToHorizon <= 0 || !finite(horizonDays) || horizonDays <= 0) return null;
  const q = Math.min(1, Math.max(0, p));
  if (q === 0) return 0;
  if (q === 1) return 1;
  return 1 - Math.pow(1 - q, horizonDays / daysToHorizon);
}
