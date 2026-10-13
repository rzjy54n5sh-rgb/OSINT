/**
 * Corridors view-model: is Hormuz / Bab al-Mandeb / Suez open this week?
 *
 * Reads data/chokepoints/latest.json (chokepoints/v1, written weekly by the Chokepoint Weekly
 * routine) and data/chokepoints/history.json (scripts/chokepoints/pw_history.py), both imported at
 * build time. Freshness and validity are decided by the SAME code the daily card uses:
 * scripts/card/lib/gates.mjs `runGates` (imported, never copied, so the site can never call a lane
 * current that the card would refuse). tests/unit/corridors.check.ts asserts the parity.
 *
 *   current  → the file passes every chokepoint gate; statuses are printed as published.
 *   stale    → only staleness failed (as_of > 8 days or the data week ended > 13 days ago);
 *              every lane is UNKNOWN with "Not updated since <date>", last known figures greyed.
 *   withheld → any other gate failed (malformed, inconsistent, future-dated, missing lane);
 *              every lane is UNKNOWN and no number is printed.
 *
 * Pure: no network, no clock (callers pass `now`), no Node-only imports, so it is safe in server
 * and client components alike.
 */
import { runGates, MAX_AGE_DAYS, MAX_WEEK_END_AGE_DAYS, BASELINE_WEEK, chokepointView, type ChokepointViewLane } from './card-gates';
import latestJson from '../data/chokepoints/latest.json';
import historyJson from '../data/chokepoints/history.json';

export type LaneId = 'hormuz' | 'bam_redsea' | 'suez';
export type LaneStatus = 'NORMAL' | 'ELEVATED' | 'DISRUPTED' | 'CLOSED' | 'UNKNOWN';
export type CorridorsState = 'current' | 'stale' | 'withheld';

/** Display order: east to west along the corridor (and the audit's first-screen order). */
export const LANE_ORDER: readonly LaneId[] = ['hormuz', 'bam_redsea', 'suez'];

/** Re-exported from gates.mjs so the page can state the rule it actually applies. */
export const CHOKEPOINT_MAX_AGE_DAYS: number = MAX_AGE_DAYS.chokepoints;
export const CHOKEPOINT_MAX_WEEK_END_AGE_DAYS: number = MAX_WEEK_END_AGE_DAYS;

const BASELINES: Record<LaneId, number> = BASELINE_WEEK;

export const STATUS_GLYPH: Record<LaneStatus, string> = {
  NORMAL: '●',
  ELEVATED: '▲',
  DISRUPTED: '◆',
  CLOSED: '■',
  UNKNOWN: '○',
};

const LANE_META: Record<LaneId, { name: string; short: string; sub: string; portid: string }> = {
  hormuz: { name: 'Strait of Hormuz', short: 'Hormuz', sub: 'Exit of the Gulf', portid: 'chokepoint6' },
  bam_redsea: { name: 'Bab al-Mandeb', short: 'Bab al-Mandeb', sub: 'Southern gate of the Red Sea', portid: 'chokepoint4' },
  suez: { name: 'Suez Canal', short: 'Suez', sub: 'Red Sea to the Mediterranean', portid: 'chokepoint1' },
};

const DEFAULT_CREDIT = 'Transits: IMF PortWatch (UN Global Platform), AIS-based';
const DEFAULT_LICENCE = 'USE-PROVISIONAL (licence_check.md row 4). Do not resell the raw series.';
const DEFAULT_HOME = 'https://portwatch.imf.org';

// ---------------------------------------------------------------------------------------------
// Small pure helpers (exported for tests)
// ---------------------------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** weekly_spec v1: index = transits / baseline week × 100, one decimal. */
export function indexPct(transits: number, baselineWeek: number): number | null {
  if (!fin(transits) || !fin(baselineWeek) || baselineWeek <= 0) return null;
  return Math.round((transits / baselineWeek) * 1000) / 10;
}

/** Week-on-week change. % is rounded like the card (chokepointView.wow); none from a zero week. */
export function wowDelta(
  transits: number | null,
  prev: number | null,
): { abs: number; pct: number | null; text: string } | null {
  if (!Number.isInteger(transits) || !Number.isInteger(prev)) return null;
  const t = transits as number;
  const p = prev as number;
  const abs = t - p;
  const pct = p > 0 ? Math.round((abs / p) * 100) : null;
  if (abs === 0) return { abs, pct: p > 0 ? 0 : null, text: 'No change' };
  const sign = abs > 0 ? '+' : '−';
  const arrow = abs > 0 ? '▲' : '▼';
  const pctTxt = pct === null ? '' : ` (${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%)`;
  return { abs, pct, text: `${arrow} ${sign}${Math.abs(abs)}${pctTxt}` };
}

/** "8 Oct 2026" from an ISO date or datetime, in UTC. */
export function formatDay(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "8 Oct 2026, 10:52 UTC". */
export function formatDayTime(iso: string | null | undefined): string | null {
  const day = formatDay(iso);
  if (!day || typeof iso !== 'string') return null;
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}, ${hh}:${mm} UTC`;
}

/** "28 Sep – 4 Oct 2026", "1–7 Sep 2026", "29 Dec 2025 – 4 Jan 2026". */
export function formatWeek(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!isDate(start) || !isDate(end)) return null;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  const [ad, am, ay] = [a.getUTCDate(), MONTHS[a.getUTCMonth()], a.getUTCFullYear()];
  const [bd, bm, by] = [b.getUTCDate(), MONTHS[b.getUTCMonth()], b.getUTCFullYear()];
  if (ay !== by) return `${ad} ${am} ${ay} – ${bd} ${bm} ${by}`;
  if (am !== bm) return `${ad} ${am} – ${bd} ${bm} ${by}`;
  return `${ad}–${bd} ${bm} ${by}`;
}

/** "28 Sep" (axis labels). */
export function formatShortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const fmtInt = (n: number): string => n.toLocaleString('en-GB');
export const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

/** "PortWatch USE-PROVISIONAL: do not resell the raw series." for the published licence status. */
export function licenceLine(licence: string): string {
  if (/USE-PROVISIONAL/.test(licence)) return 'IMF PortWatch data, licence status USE-PROVISIONAL: do not resell the raw series.';
  return licence;
}

// ---------------------------------------------------------------------------------------------
// Gate (delegates to scripts/card/lib/gates.mjs)
// ---------------------------------------------------------------------------------------------
/**
 * The chokepoint part of the daily card's gate, exactly as scripts/card/check-chokepoints.mjs
 * filters it, but with allowStale so staleness is reported on its own.
 */
export function chokepointGate(chokepoints: unknown, now: Date): { errors: string[]; stale: boolean } {
  const g = runGates({ chokepoints, registry: [], daily: [], brief: null, changes: [] }, { now, allowStale: true });
  return {
    errors: g.errors.filter((e) => e.replace(/^STALE /, '').startsWith('chokepoints')),
    stale: g.stale.chokepoints === true,
  };
}

// ---------------------------------------------------------------------------------------------
// History (data/chokepoints/history.json, chokepoints-history/v1)
// ---------------------------------------------------------------------------------------------
export interface HistoryWeek {
  weekStart: string;
  weekEnd: string;
  transits: number | null;
  index: number | null;
  days: number;
}
export interface ParsedHistory {
  retrievedAt: string | null;
  sourceCredit: string;
  licence: string;
  lanes: Partial<Record<LaneId, HistoryWeek[]>>;
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Validates and normalises history.json. A lane is DROPPED (not repaired) when its baseline is not
 * the frozen weekly_spec value or any printed index does not follow from its counts. A week with a
 * missing day keeps transits/index null: gaps stay gaps. Returns null when nothing usable remains.
 */
export function parseHistory(raw: unknown): ParsedHistory | null {
  if (!raw || typeof raw !== 'object') return null;
  const h = raw as Record<string, unknown>;
  if (h.schema !== 'chokepoints-history/v1' || !Array.isArray(h.lanes)) return null;
  const lanes: Partial<Record<LaneId, HistoryWeek[]>> = {};
  for (const l of h.lanes as Record<string, unknown>[]) {
    const id = l?.lane as LaneId;
    if (!LANE_ORDER.includes(id) || lanes[id]) continue;
    const base = l.baseline_week;
    if (!fin(base) || Math.abs(base - BASELINES[id]) > 0.5) continue;
    if (!Array.isArray(l.weeks)) continue;
    const weeks: HistoryWeek[] = [];
    let bad = false;
    for (const w of l.weeks as Record<string, unknown>[]) {
      const ws = w?.week_start;
      const we = w?.week_end;
      if (!isDate(ws) || !isDate(we) || addDays(ws, 6) !== we) { bad = true; break; }
      const tr = w.transits;
      const ix = w.index_pct_of_2023;
      const days = Number.isInteger(w.days) ? (w.days as number) : 0;
      if (tr === null || tr === undefined) {
        weeks.push({ weekStart: ws, weekEnd: we, transits: null, index: null, days });
        continue;
      }
      if (!Number.isInteger(tr) || (tr as number) < 0 || !fin(ix)) { bad = true; break; }
      if (Math.abs(((tr as number) / base) * 100 - ix) > 0.15) { bad = true; break; }
      weeks.push({ weekStart: ws, weekEnd: we, transits: tr as number, index: ix, days });
    }
    if (bad || !weeks.length) continue;
    weeks.sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
    if (weeks.some((w, i) => i > 0 && w.weekStart === weeks[i - 1].weekStart)) continue;
    lanes[id] = weeks.slice(-12);
  }
  if (!Object.keys(lanes).length) return null;
  return {
    retrievedAt: typeof h.retrieved_at === 'string' ? h.retrieved_at : null,
    sourceCredit: typeof h.source_credit === 'string' ? h.source_credit : DEFAULT_CREDIT,
    licence: typeof h.licence === 'string' ? h.licence : DEFAULT_LICENCE,
    lanes,
  };
}

// ---------------------------------------------------------------------------------------------
// View-model
// ---------------------------------------------------------------------------------------------
export interface CorridorLane {
  id: LaneId;
  name: string;
  shortName: string;
  sub: string;
  portid: string;
  /** What the page prints. UNKNOWN whenever the block is stale or withheld. */
  status: LaneStatus;
  /** What the file says (null when withheld). Never printed as current when stale. */
  reportedStatus: string | null;
  index: number | null;
  transits: number | null;
  prev: number | null;
  wow: ReturnType<typeof wowDelta>;
  baselineWeek: number;
  weekStart: string | null;
  weekEnd: string | null;
  weekLabel: string | null;
  statusBand: string | null;
  statusDriver: string | null;
  statusSourceUrl: string | null;
  override: string | null;
  sourceUrl: string | null;
  history: HistoryWeek[] | null;
}

export interface CorridorsView {
  state: CorridorsState;
  asOf: string | null;
  asOfLabel: string | null;
  staleMessage: string | null;
  weekLabel: string | null;
  issueLabel: string | null;
  sourceName: string;
  sourceCredit: string;
  sourceHome: string;
  licence: string;
  /** Licence as printed on the page (internal file references stripped). */
  licenceLine: string;
  errors: string[];
  historyRetrievedAt: string | null;
  lanes: CorridorLane[];
}

export function buildCorridors(chokepoints: unknown, historyRaw: unknown, now: Date): CorridorsView {
  const gate = chokepointGate(chokepoints, now);
  const state: CorridorsState = gate.errors.length ? 'withheld' : gate.stale ? 'stale' : 'current';
  const cp = (chokepoints && typeof chokepoints === 'object' ? chokepoints : {}) as Record<string, unknown>;
  const v = chokepointView(chokepoints);
  const hist = parseHistory(historyRaw);
  const showNumbers = state !== 'withheld';

  const lanes: CorridorLane[] = LANE_ORDER.map((id) => {
    const meta = LANE_META[id];
    const l: ChokepointViewLane | undefined = showNumbers ? v.lanes.find((x) => x.id === id) : undefined;
    const transits = l && Number.isInteger(l.transits) ? (l.transits as number) : null;
    const prev = l && Number.isInteger(l.prev) ? (l.prev as number) : null;
    return {
      id,
      name: (l?.name as string) || meta.name,
      shortName: meta.short,
      sub: meta.sub,
      portid: meta.portid,
      status: state === 'current' && l ? (l.status as LaneStatus) : 'UNKNOWN',
      reportedStatus: l?.status ?? null,
      index: l && fin(l.index) ? l.index : null,
      transits,
      prev,
      wow: wowDelta(transits, prev),
      baselineWeek: BASELINES[id],
      weekStart: l?.weekStart ?? null,
      weekEnd: l?.weekEnd ?? null,
      weekLabel: l ? formatWeek(l.weekStart, l.weekEnd) : null,
      statusBand: state === 'current' ? (l?.statusBand ?? null) : null,
      statusDriver: state === 'current' ? (l?.statusDriver ?? null) : null,
      statusSourceUrl: state === 'current' ? (l?.statusSourceUrl ?? null) : null,
      override: state === 'current' ? (l?.override ?? null) : null,
      sourceUrl: l?.sourceUrl ?? null,
      history: hist?.lanes[id] ?? null,
    };
  });

  const asOf = v.asOf;
  return {
    state,
    asOf,
    asOfLabel: formatDayTime(asOf),
    staleMessage:
      state === 'stale'
        ? `Not updated since ${formatDay(asOf) ?? 'the last published week'}`
        : state === 'withheld'
          ? 'Withheld: this week’s corridor file failed its data checks'
          : null,
    weekLabel: showNumbers && v.commonWeek ? formatWeek(v.commonWeek.start, v.commonWeek.end) : null,
    issueLabel: typeof cp.issue_label === 'string' ? cp.issue_label : null,
    sourceName: typeof cp.source_name === 'string' ? cp.source_name : 'IMF PortWatch',
    sourceCredit: typeof cp.source_credit === 'string' ? cp.source_credit : DEFAULT_CREDIT,
    sourceHome: typeof cp.source_home === 'string' ? cp.source_home : DEFAULT_HOME,
    licence: typeof cp.licence === 'string' ? cp.licence : DEFAULT_LICENCE,
    licenceLine: licenceLine(typeof cp.licence === 'string' ? cp.licence : DEFAULT_LICENCE),
    errors: gate.errors,
    historyRetrievedAt: hist?.retrievedAt ?? null,
    lanes,
  };
}

/** The committed files, evaluated at `now` (call at render time; ISR re-renders every 900 s). */
export function getCorridors(now: Date = new Date()): CorridorsView {
  return buildCorridors(latestJson, historyJson, now);
}

const WORDS = ['No', 'One', 'Two', 'Three'];
const SEVERITY: LaneStatus[] = ['CLOSED', 'DISRUPTED', 'ELEVATED', 'NORMAL'];

/** One plain sentence that states the finding, derived only from the view. */
export function corridorHeadline(v: CorridorsView): string {
  if (v.state === 'withheld') return 'This week’s corridor figures failed their data checks, so no status is shown.';
  if (v.state === 'stale') {
    return `${v.staleMessage}. Every lane shows UNKNOWN until the next PortWatch week is published; the last known figures stay visible below, greyed.`;
  }
  const by = (s: LaneStatus) => v.lanes.filter((l) => l.status === s);
  const worst = SEVERITY.find((s) => by(s).length) ?? 'NORMAL';
  const n = by(worst).length;
  const rest = v.lanes.filter((l) => l.status !== worst);
  let first =
    n === v.lanes.length
      ? `All ${WORDS[n]?.toLowerCase() ?? n} lanes are ${worst}`
      : `${WORDS[n] ?? n} of ${WORDS[v.lanes.length]?.toLowerCase() ?? v.lanes.length} lanes ${n === 1 ? 'is' : 'are'} ${worst}`;
  if (rest.length) first += `; ${rest.map((l) => `${l.shortName} is ${l.status}`).join(', ')}`;
  const low = [...v.lanes].filter((l) => l.index !== null && l.transits !== null).sort((a, b) => a.index! - b.index!)[0];
  const second = low
    ? ` ${low.shortName} had ${fmtInt(low.transits!)} transits in a week that averaged ${fmtInt(Math.round(low.baselineWeek))} in 2023.`
    : '';
  return `${first}.${second}`;
}
