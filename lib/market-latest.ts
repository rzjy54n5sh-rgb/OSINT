/**
 * The ONE canonical "latest value" per market indicator (UX audit 2026-10-13, problem #7: Home showed
 * Brent 105.77 while the War Room showed 105.04 on the same day).
 *
 * Canonical = the newest market_data row per indicator by created_at; ties broken by id ascending (the
 * same order as the /markets history query). Home, the War Room and the home client fallback all go
 * through latestPerIndicator() and format with formatMarketValue() / formatChangePct(), and show the
 * row's own created_at via formatMarketStamp().
 */

export interface MarketRowLike {
  id?: string | null;
  indicator: string | null;
  value: number | null;
  change_pct: number | null;
  created_at: string | null;
}

/** Columns every caller selects. */
export const MARKET_LATEST_COLUMNS = 'id, indicator, value, change_pct, unit, source, conflict_day, created_at';
/**
 * Newest rows read (created_at desc). The collector writes ~13 indicators every 30 min and the daily
 * build 4–5 once a day, so 300 rows cover more than a day of collections.
 */
export const MARKET_LATEST_ROWS = 300;

/** Case/whitespace-normalised indicator key ("Brent Crude Oil" -> "brent crude oil"). */
export function indicatorKey(indicator: string | null | undefined): string {
  return (indicator ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function ts(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** created_at descending (undated last), then id ascending. Returns a new array. */
export function sortNewestFirst<T extends MarketRowLike>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const d = ts(b.created_at) - ts(a.created_at);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

/** Newest row per indicator, keyed by indicatorKey(); iteration order is newest first. */
export function latestPerIndicator<T extends MarketRowLike>(rows: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of sortNewestFirst(rows)) {
    const k = indicatorKey(r.indicator);
    if (!k) continue;
    if (!out.has(k)) out.set(k, r);
  }
  return out;
}

/** Fixed decimals for the indicators shown on Home; everything else gets at most 2. */
const DECIMALS: Record<string, number> = {
  'brent crude oil': 2,
  'wti crude oil': 2,
  gold: 0,
  'vix (fear index)': 1,
  's&p 500': 0,
  'dow jones': 0,
};

export function formatMarketValue(indicator: string | null | undefined, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const d = DECIMALS[indicatorKey(indicator)];
  return d === undefined
    ? value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** "+0.6%", "−1.5%" (true minus sign), "0.0%"; "—" when missing. */
export function formatChangePct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = Math.abs(v).toFixed(1);
  if (s === '0.0') return '0.0%';
  return `${v > 0 ? '+' : '−'}${s}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "13 Oct 10:30 UTC" from the row's created_at (never the browser clock); "—" when missing. */
export function formatMarketStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.toISOString().slice(11, 16)} UTC`;
}

export interface HomeMarketMetric {
  label: string;
  value: string;
  change: string;
  up: boolean;
  /** "13 Oct 10:30 UTC": created_at of the row shown. */
  asOf: string;
}

/** Home tiles, in this order, when the indicator has a row. `upIsGood: false` = a fall is shown as good (VIX). */
const HOME_TILES: { key: string; label: string; prefix: string; upIsGood: boolean }[] = [
  { key: 'brent crude oil', label: 'BRENT', prefix: '$', upIsGood: true },
  { key: 'gold', label: 'GOLD', prefix: '$', upIsGood: true },
  { key: 'vix (fear index)', label: 'VIX', prefix: '', upIsGood: false },
  { key: 's&p 500', label: 'S&P 500', prefix: '', upIsGood: true },
];

/** Home market tiles from the canonical newest row per indicator (same values as the War Room). */
export function buildHomeMarketMetrics<T extends MarketRowLike>(rows: readonly T[]): { metrics: HomeMarketMetric[]; latestDay: number | null } {
  const latest = latestPerIndicator(rows);
  const metrics: HomeMarketMetric[] = [];
  let latestDay: number | null = null;
  for (const t of HOME_TILES) {
    const r = latest.get(t.key);
    if (!r) continue;
    const day = (r as { conflict_day?: number | null }).conflict_day ?? null;
    if (day != null && (latestDay === null || day > latestDay)) latestDay = day;
    const v = formatMarketValue(r.indicator, r.value);
    metrics.push({
      label: t.label,
      value: v === '—' ? '--' : `${t.prefix}${v}`,
      change: r.change_pct == null ? '--' : formatChangePct(r.change_pct),
      up: t.upIsGood ? (r.change_pct ?? 0) >= 0 : (r.change_pct ?? 0) < 0,
      asOf: formatMarketStamp(r.created_at),
    });
  }
  return { metrics, latestDay };
}
