/**
 * Server-side reduction for /markets: raw market_data rows -> one compact view per indicator.
 * Only this compact shape is sent to the client (latest row + one point per day in the latest
 * row's unit), never the ~2,600 raw rows.
 */

/** Written by collect-markets.yml (cron every 30 min). CLAUDE.md "market_data writers". */
export const COLLECTOR_INDICATORS = [
  'Brent Crude Oil',
  'WTI Crude Oil',
  'Gold',
  'Natural Gas',
  'S&P 500',
  'Dow Jones',
  'Energy ETF (XLE)',
  'Oil ETF (USO)',
  'VIX (Fear Index)',
  'EUR/USD',
  'USD/SAR',
  'USD/AED',
  'USD/IQD',
] as const;
const COLLECTOR_SET = new Set<string>(COLLECTOR_INDICATORS);

/** Row as fetched for history (no `source`: that column is fetched only for the latest rows). */
export interface HistoryRow {
  id: string;
  indicator: string | null;
  value: number | string | null;
  change_pct: number | string | null;
  unit: string | null;
  conflict_day: number | null;
  created_at: string | null;
  is_retrospective: boolean | null;
}

export interface IndicatorLatest {
  value: number | null;
  change_pct: number | null;
  unit: string;
  source: string | null;
  conflict_day: number | null;
  created_at: string | null;
  reconstructed: boolean;
}

export interface IndicatorView {
  indicator: string;
  latest: IndicatorLatest;
  /** [conflict_day, value, reconstructed 0|1] — one per day (newest row of the day), latest unit only, ascending. */
  series: [number, number, 0 | 1][];
  /** Earlier rows in other units — never joined to the series. */
  otherUnits: { unit: string; count: number; firstDay: number; lastDay: number }[];
  cadence: string;
  archived: boolean;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Rows from the 2026-10 daily-close backfill (backfill_market_closes.py tags its source). */
export function isReconstructedSource(source: string | null | undefined): boolean {
  return /reconstructed backfill|daily close/i.test(source ?? '');
}

/**
 * @param rows        history rows, NEWEST FIRST by created_at (duplicates by id are ignored)
 * @param reconKeys   `${indicator}|${conflict_day}` of rows whose source marks a reconstructed close
 * @param sourceById  `source` for the latest row of each indicator
 */
export function buildIndicatorViews(
  rows: HistoryRow[],
  reconKeys: Set<string>,
  sourceById: Map<string, string | null>,
): IndicatorView[] {
  const seen = new Set<string>();
  const byIndicator = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const k = r.indicator ?? 'OTHER';
    const list = byIndicator.get(k);
    if (list) list.push(r);
    else byIndicator.set(k, [r]);
  }

  const views: IndicatorView[] = [];
  for (const [indicator, list] of byIndicator) {
    const latestRow = list[0]!; // newest created_at
    const unit = latestRow.unit ?? '';
    const perDay = new Map<number, [number, number, 0 | 1]>();
    const other = new Map<string, { unit: string; count: number; firstDay: number; lastDay: number }>();
    for (const r of list) {
      const v = num(r.value);
      if (r.conflict_day == null || v === null) continue;
      if ((r.unit ?? '') !== unit) {
        const u = r.unit ?? '(no unit)';
        const o = other.get(u) ?? { unit: u, count: 0, firstDay: r.conflict_day, lastDay: r.conflict_day };
        o.count += 1;
        o.firstDay = Math.min(o.firstDay, r.conflict_day);
        o.lastDay = Math.max(o.lastDay, r.conflict_day);
        other.set(u, o);
        continue;
      }
      if (!perDay.has(r.conflict_day)) {
        const recon = r.is_retrospective === true || reconKeys.has(`${indicator}|${r.conflict_day}`);
        perDay.set(r.conflict_day, [r.conflict_day, v, recon ? 1 : 0]);
      }
    }
    const source = sourceById.get(latestRow.id) ?? null;
    const lastDay = latestRow.conflict_day ?? 0;
    const archived = lastDay <= 35;
    views.push({
      indicator,
      latest: {
        value: num(latestRow.value),
        change_pct: num(latestRow.change_pct),
        unit,
        source,
        conflict_day: latestRow.conflict_day,
        created_at: latestRow.created_at,
        reconstructed: latestRow.is_retrospective === true || isReconstructedSource(source),
      },
      series: Array.from(perDay.values()).sort((a, b) => a[0] - b[0]),
      otherUnits: Array.from(other.values()),
      cadence: COLLECTOR_SET.has(indicator)
        ? 'Collector · scheduled every 30 min'
        : archived
          ? `Archived series · no longer collected (last Day ${lastDay})`
          : 'Daily build · once a day, from the cited source',
      archived,
    });
  }
  return views.sort((a, b) => a.indicator.localeCompare(b.indicator));
}
