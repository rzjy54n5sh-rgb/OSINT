/**
 * Key figures and the chokepoint chart for the brief reader (operator decisions R2, R3, 2026-10-13).
 * Pure: no network, no clock. Every figure comes from a real row; nothing is derived from prose.
 *
 *  - cover_stats: printed only in its stored array shape [{value,label,sub}] (Day 220 briefs). The
 *    older object shape (raw keys such as `brent_oil`) has no labels, so it is not printed.
 *  - corridors:   data/chokepoints/latest.json via getCorridors(), only when the brief cites that same
 *    edition (a "Chokepoint Weekly" source whose published_at equals the file's as_of). A brief from an
 *    earlier week is never drawn with this week's numbers. Only the lanes the citing paragraphs name are
 *    drawn, with the status that edition published (so an archived brief never flips to UNKNOWN).
 *  - market_data: the rows of the collection the brief cites (created in the cited second), and only the
 *    indicators named in the paragraphs that cite it. The page reads the rows live, so a row deleted by a
 *    correction is never printed.
 */
import type { BriefSource } from './briefing-sources';
import { paragraphSources, sourceLookupKey } from './briefing-sources';
import { fmtInt, fmtPct, formatDayTime, type CorridorsView, type CorridorLane, type LaneId, type LaneStatus } from './corridors';

export interface KeyFigure {
  key: string;
  value: string;
  label: string;
  sub: string | null;
  /** [n] of the brief source it rests on (null for cover_stats, which carry no link). */
  src: number | null;
}

export function parseCoverStats(raw: unknown): KeyFigure[] {
  if (!Array.isArray(raw)) return [];
  const out: KeyFigure[] = [];
  raw.forEach((x, i) => {
    if (!x || typeof x !== 'object') return;
    const r = x as Record<string, unknown>;
    const value = typeof r.value === 'string' ? r.value.trim() : typeof r.value === 'number' && Number.isFinite(r.value) ? String(r.value) : '';
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    if (!value || !label) return;
    const sub = typeof r.sub === 'string' && r.sub.trim() ? r.sub.trim() : null;
    out.push({ key: `cs-${i}`, value, label, sub, src: null });
  });
  return out;
}

const CHOKEPOINT_SOURCE = /chokepoint weekly/i;
const MARKET_SOURCE = /\bmarket_data\b/;

/** The brief's citation of the chokepoint edition in `view`, or null (then no chart and no corridor figures). */
export function citedChokepointEdition(sources: BriefSource[], view: CorridorsView): BriefSource | null {
  if (view.state === 'withheld' || !view.asOf) return null;
  const asOf = Date.parse(view.asOf);
  if (Number.isNaN(asOf)) return null;
  return (
    sources.find(
      (s) => CHOKEPOINT_SOURCE.test(s.name) && typeof s.published_at === 'string' && Date.parse(s.published_at) === asOf,
    ) ?? null
  );
}

export interface ChartLane {
  lane: CorridorLane;
  index: number;
  transits: number;
  /** The status this edition PUBLISHED (reportedStatus). The view prints UNKNOWN once the file is stale,
   *  but a brief that cites this edition is drawn as of that edition (the subtitle carries the as-of date). */
  status: LaneStatus;
}

const LANE_STATUS_CODES: readonly string[] = ['NORMAL', 'ELEVATED', 'DISRUPTED', 'CLOSED', 'UNKNOWN'];

/**
 * Fixed spellings that name each lane in a brief (operator list, 2026-10-14). Matching is case-insensitive,
 * whole words only (letters or digits on either side break a match, so "Suezmax" is not Suez), after
 * normalising typographic apostrophes and treating hyphens, dashes and spaces alike.
 */
export const LANE_ALIASES: Record<LaneId, readonly string[]> = {
  hormuz: ['Hormuz', 'Strait of Hormuz', 'هرمز'],
  bam_redsea: ['Bab al-Mandeb', 'Bab el-Mandeb', 'Bab-el-Mandeb', 'Bab al-Mandab', 'Bab el-Mandab', 'باب المندب'],
  suez: ['Suez Canal', 'Suez', 'قناة السويس'],
};

/** Lowercase; every hyphen/dash and run of spaces becomes one space ("Bab-al-Mandeb" = "Bab al Mandeb"). */
const normaliseForMatch = (t: string): string =>
  t
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[-\u2010\u2011\u2012\u2013\u2014\s]+/g, ' ')
    .toLowerCase();

/** True when `text` names the lane by one of its fixed aliases (see LANE_ALIASES). */
export function laneNamed(id: LaneId, text: string): boolean {
  const hay = normaliseForMatch(text);
  return (LANE_ALIASES[id] ?? []).some((alias) =>
    // String-built so the Unicode property escapes need no ES2018 target; `u` flag for Arabic letters.
    new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(normaliseForMatch(alias))}($|[^\\p{L}\\p{N}])`, 'u').test(hay),
  );
}

/**
 * Lanes the brief itself names (any fixed alias in LANE_ALIASES) in the paragraphs that cite the
 * edition, with both numbers, in the corridor display order. A lane the brief never states is not drawn.
 */
export function chartLanes(view: CorridorsView, text: string): ChartLane[] {
  return view.lanes
    .filter((l) => l.index !== null && l.transits !== null)
    .filter((l) => laneNamed(l.id, text))
    .map((l) => ({
      lane: l,
      index: l.index as number,
      transits: l.transits as number,
      status: (typeof l.reportedStatus === 'string' && LANE_STATUS_CODES.includes(l.reportedStatus) ? l.reportedStatus : 'UNKNOWN') as LaneStatus,
    }));
}

/** R3: exact numbers only. "Hormuz at 2.8% of an average 2023 week" (the lowest named lane). */
export function chartTitle(lanes: ChartLane[]): string | null {
  if (!lanes.length) return null;
  const low = [...lanes].sort((a, b) => a.index - b.index)[0];
  return `${low.lane.shortName} at ${fmtPct(low.index)} of an average 2023 week`;
}

export function corridorFigures(view: CorridorsView, cited: BriefSource, lanes: ChartLane[]): KeyFigure[] {
  return lanes.map(({ lane, index, transits }) => ({
    key: `cw-${lane.id}`,
    value: fmtPct(index),
    label: `${lane.name} transits vs an average 2023 week (${fmtInt(transits)} ships)${lane.weekLabel ? `, week ${lane.weekLabel}` : ''}`,
    sub: view.sourceName,
    src: cited.n,
  }));
}

/** Text of every paragraph that cites the source with this dedup key. */
export function citingText(sections: SectionLike[] | null | undefined, key: string): string {
  const texts: string[] = [];
  for (const sec of Array.isArray(sections) ? sections : []) {
    for (const sub of Array.isArray(sec?.subsections) ? sec.subsections : []) {
      for (const p of Array.isArray(sub?.paragraphs) ? sub.paragraphs : []) {
        if (!p || typeof p.text !== 'string') continue;
        if (paragraphSources(p.sources).some((x) => sourceLookupKey(x) === key)) texts.push(p.text);
      }
    }
  }
  return texts.join('\n');
}

export interface MarketCitation {
  source: BriefSource;
  /** Inclusive start / exclusive end of the cited collection second (ISO). */
  from: string;
  to: string;
  /** Text of every paragraph that cites it. */
  text: string;
}

interface SectionLike {
  subsections?: ({ paragraphs?: ({ text?: unknown; sources?: unknown } | null)[] | null } | null)[] | null;
}

/** The market_data collection the brief cites; needs a full timestamp (a date alone names no collection). */
export function citedMarketCollection(sections: SectionLike[] | null | undefined, sources: BriefSource[]): MarketCitation | null {
  const src = sources.find((s) => MARKET_SOURCE.test(s.name) && typeof s.published_at === 'string' && /T\d{2}:\d{2}:\d{2}/.test(s.published_at));
  if (!src) return null;
  const t = Date.parse(src.published_at as string);
  if (Number.isNaN(t)) return null;
  const from = Math.floor(t / 1000) * 1000;
  const text = citingText(sections, src.key);
  if (!text) return null;
  return { source: src, from: new Date(from).toISOString(), to: new Date(from + 1000).toISOString(), text };
}

export interface MarketRow {
  indicator: string;
  value: number | string;
  change_pct: number | string | null;
  unit: string | null;
  source: string | null;
  conflict_day: number | null;
  created_at: string;
}

const num = (x: unknown): number | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "VIX (Fear Index)" is named in prose as "VIX": the part before a trailing parenthesis. */
export function indicatorNamed(indicator: string, text: string): boolean {
  const names = new Set([indicator.trim(), indicator.replace(/\s*\([^)]*\)\s*$/, '').trim()].filter((n) => n.length >= 3));
  return [...names].some((n) => new RegExp(`(^|[^A-Za-z0-9])${escapeRe(n)}($|[^A-Za-z0-9])`).test(text));
}

export function marketFigures(rows: MarketRow[], cite: MarketCitation): KeyFigure[] {
  const from = Date.parse(cite.from);
  const to = Date.parse(cite.to);
  const seen = new Set<string>();
  const out: KeyFigure[] = [];
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    const v = num(r.value);
    if (typeof r.indicator !== 'string' || v === null || Number.isNaN(t) || t < from || t >= to) continue;
    if (seen.has(r.indicator) || !indicatorNamed(r.indicator, cite.text)) continue;
    seen.add(r.indicator);
    const ch = num(r.change_pct);
    const change = ch === null ? '' : ch === 0 ? ', 0%' : `, ${ch > 0 ? '▲' : '▼'} ${Math.abs(ch)}%`;
    // The unit is printed unless the indicator name already says it ("VIX (Fear Index)", unit "index").
    const u = typeof r.unit === 'string' ? r.unit.trim() : '';
    const unit = u && !r.indicator.toLowerCase().includes(u.toLowerCase()) ? ` (${u})` : '';
    const when = formatDayTime(r.created_at);
    out.push({
      key: `md-${r.indicator}`,
      value: v.toLocaleString('en-GB', { maximumFractionDigits: 6 }),
      label: `${r.indicator}${unit}${change}`,
      sub: [r.source, r.conflict_day != null ? `Day ${r.conflict_day}` : null, when ? `collected ${when}` : null].filter(Boolean).join(' · '),
      src: cite.source.n,
    });
  }
  return out;
}
