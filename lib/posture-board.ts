/**
 * War Posture board v2 (/nai, artboard Posture.dc.html): pure view logic, no React, no I/O.
 * Every number, word and quote comes from the PostureBoard (viewer_posture_v2 / posture_actors / conflicts,
 * frozen v1 rows from nai_scores_v2); this file only decides WHERE each fact is shown. Operator rulings
 * (2026-10-14, R2–R11) enforced here and asserted by tests/unit/posture-board.check.ts:
 *  - R2 the previous-day stepper exists only once a second War Posture v2 coding day is in the data;
 *  - R3 v1 rows (no conflict column) sit in their own "Old method (v1, frozen)" group, never on a conflict
 *    tab, never on a conflict's tile map;
 *  - R4 colour = the score's band (0–30 / 31–60 / 61–80 / 81–100); words = lib/posture.ts labels, unchanged;
 *  - R6 a statement with no coded score (stance 'uncoded') is never shown as a position, and never quoted;
 *  - R9 EG / AE / SA: outline only, no number, band, fill or rank; a quote glyph only with a real statement;
 *  - Yemen: two lines (posture_actors), never merged or averaged.
 */
import { isPostureNoGrade, postureBand, type PostureBand } from './design-tokens';
import { TRACKED_COUNTRY_CODES } from './countries';
import { TRACKED_COUNTRY_NAMES } from './country-names';
import {
  BLENDED_CONFLICT,
  POSTURE_ACTORS,
  POSTURE_V1_METHOD,
  POSTURE_V2_METHOD,
  POSTURE_WITHHELD_CODES,
  V1_FROZEN_CONFLICT,
  dayToIsoDate,
  isPostureWithheld,
  type ConflictDef,
  type PostureActor,
  type PostureBoard,
  type PostureEvidenceView,
  type PostureView,
} from './posture';

/** Server-resolved label of a source URL (lib/posture-outlets.ts): DB outlet name, else the bare host. */
export interface SourceLabel {
  name: string;
  known: boolean;
  party: boolean;
}
export type SourceLabels = Record<string, SourceLabel>;

// ---------------------------------------------------------------------------------------------------
// Tile map: static schematic layout (not data). One tile per government line, placed roughly by
// geography on an 8 x 6 grid; Yemen has one tile per authority.
// ---------------------------------------------------------------------------------------------------
export interface TileDef {
  key: string;
  code: string;
  actor: PostureActor;
  label: string;
  col: number;
  row: number;
  span?: number;
}
const t = (code: string, col: number, row: number, span?: number, actor: PostureActor = 'government', label = code): TileDef => ({
  key: `${code}|${actor}`,
  code,
  actor,
  label,
  col,
  row,
  span,
});
export const TILE_COLS = 8;
export const TILE_ROWS = 6;
export const POSTURE_TILES: readonly TileDef[] = [
  t('TR', 3, 0), t('LB', 2, 1), t('IQ', 4, 1), t('IR', 5, 1, 2),
  t('EG', 1, 2), t('IL', 2, 2), t('JO', 3, 2), t('KW', 4, 2), t('PK', 7, 2),
  t('SA', 3, 3, 2), t('QA', 5, 3), t('AE', 6, 3),
  t('SD', 1, 4), t('ER', 2, 4), t('YE', 3, 4, 1, 'de_facto_authority', 'YE·AA'), t('YE', 4, 4, 1, 'government', 'YE·PLC'),
  t('ET', 2, 5), t('DJ', 3, 5), t('SO', 4, 5),
];
/** Sea labels, as % of the stage (decoration). */
export const MAP_SEAS = [
  { label: 'Red Sea', left: 25.6, top: 53.8, width: 9.6 },
  { label: 'The Gulf', left: 64.1, top: 38.5, width: 22.4 },
  { label: 'Gulf of Aden', left: 64.1, top: 87.2, width: 19.2 },
] as const;
const TILED = new Set(POSTURE_TILES.map((x) => x.code));

export type TileState =
  | { kind: 'position'; score: number; band: PostureBand }
  | { kind: 'stated'; quote: boolean }
  | { kind: 'silence' }
  | { kind: 'none' };

// ---------------------------------------------------------------------------------------------------
// Row predicates
// ---------------------------------------------------------------------------------------------------
const lineKey = (r: Pick<PostureView, 'country_code' | 'actor'>) => `${r.country_code}|${r.actor}`;
const isV2 = (r: PostureView) => r.method === POSTURE_V2_METHOD;
const noGrade = (r: PostureView) => r.withheld || isPostureWithheld(r.country_code) || isPostureNoGrade(r.country_code);

/**
 * A row that may be shown as a scored position: v2, coded 'position', never EG / AE / SA, a 0–100 score,
 * and a verbatim quote with an openable source ("every score rests on a dated quote you can open").
 */
export function isShownPosition(r: PostureView): boolean {
  return (
    isV2(r) &&
    r.stance === 'position' &&
    !noGrade(r) &&
    postureBand(r.expressed_score) !== null &&
    !!r.evidence &&
    /^https?:\/\//i.test(r.evidence.source_url)
  );
}
/** A frozen v1 row that carries a number (v1 rows without one are "no position on record"). */
export function isShownV1(r: PostureView): boolean {
  return r.method === POSTURE_V1_METHOD && !noGrade(r) && postureBand(r.expressed_score) !== null;
}
/** Coded but not a position (deliberate silence, withdrawn): shown with its words, no number. */
const isOtherCoded = (r: PostureView) => isV2(r) && !noGrade(r) && (r.stance === 'deliberate_silence' || r.stance === 'nulled');

/** Score band of a shown row; null for anything else (EG / AE / SA always null). */
export function rowBand(r: PostureView): PostureBand | null {
  if (noGrade(r)) return null;
  return isShownPosition(r) || isShownV1(r) ? postureBand(r.expressed_score) : null;
}

// ---------------------------------------------------------------------------------------------------
// Tabs (conflicts from the DB, all of them, then the v1 group)
// ---------------------------------------------------------------------------------------------------
export interface BoardTab {
  code: string;
  label: string;
  description: string;
  v1: boolean;
}
export function boardTabs(board: PostureBoard): BoardTab[] {
  if (board.schema === 'v1') return [{ code: BLENDED_CONFLICT.conflict_code, label: BLENDED_CONFLICT.short_name, description: BLENDED_CONFLICT.description, v1: true }];
  const tabs: BoardTab[] = [...board.conflicts]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c: ConflictDef) => ({ code: c.conflict_code, label: c.short_name, description: c.description, v1: false }));
  if (board.rows.some(isShownV1)) {
    tabs.push({ code: V1_FROZEN_CONFLICT.conflict_code, label: V1_FROZEN_CONFLICT.short_name, description: V1_FROZEN_CONFLICT.description, v1: true });
  }
  return tabs;
}

// ---------------------------------------------------------------------------------------------------
// One conflict tab
// ---------------------------------------------------------------------------------------------------
export interface YemenLine {
  actor: PostureActor;
  name: string;
  row: PostureView | null;
}
export interface StatedBlock {
  code: string;
  name: string;
  evidence: PostureEvidenceView[];
}
export interface ConflictView {
  /** Scored positions on this front (Yemen's lines are in `yemen`, never here). */
  positions: PostureView[];
  /** Coded non-positions (deliberate silence, withdrawn). */
  others: PostureView[];
  /** Positions on record for the heading: list + Yemen lines. */
  count: number;
  yemen: YemenLine[] | null;
  stated: StatedBlock[];
  /** Countries with a statement captured on this front but not yet coded (no quote, no number). */
  awaiting: string[];
  /** Shown positions with no tile. */
  outside: PostureView[];
  tiles: Record<string, TileState>;
}

export const countryName = (code: string) => TRACKED_COUNTRY_NAMES[code] ?? code;

/** Yemen's two lines, labelled with posture_actors.display_name (from the row when present). */
export function yemenLines(rows: PostureView[]): YemenLine[] {
  return POSTURE_ACTORS.filter((a) => a.country_code === 'YE').map((a) => {
    const row = rows.find((r) => r.country_code === 'YE' && r.actor === a.actor) ?? null;
    return { actor: a.actor, name: row?.actor_display_name ?? a.display_name, row };
  });
}

export function conflictView(board: PostureBoard, conflict: string): ConflictView {
  const v2 = board.schema === 'v2' ? board.rows.filter((r) => isV2(r) && r.conflict_code === conflict) : [];
  const shown = v2.filter(isShownPosition);
  const ye = v2.filter((r) => r.country_code === 'YE');
  const stated = [...POSTURE_WITHHELD_CODES]
    .map((code) => ({
      code,
      name: countryName(code),
      evidence: v2
        .filter((r) => r.country_code === code && r.evidence && r.evidence.kind !== 'silence_trigger')
        .map((r) => r.evidence as PostureEvidenceView),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const awaiting = new Set<string>();
  for (const r of v2) if (r.stance === 'uncoded' && r.country_code !== 'YE' && !noGrade(r)) awaiting.add(r.country_code);
  for (const r of board.rows) if (r.method === POSTURE_V1_METHOD && r.country_code !== 'YE' && r.v2UncodedConflicts.includes(conflict)) awaiting.add(r.country_code);
  const tiles: Record<string, TileState> = {};
  for (const tile of POSTURE_TILES) {
    if (isPostureNoGrade(tile.code)) {
      const s = stated.find((b) => b.code === tile.code);
      tiles[tile.key] = { kind: 'stated', quote: !!s?.evidence.some((e) => e.kind === 'statement') };
      continue;
    }
    const row = v2.find((r) => lineKey(r) === tile.key);
    tiles[tile.key] =
      row && isShownPosition(row)
        ? { kind: 'position', score: Math.round(row.expressed_score as number), band: postureBand(row.expressed_score) as PostureBand }
        : row && row.stance === 'deliberate_silence' && !noGrade(row)
          ? { kind: 'silence' }
          : { kind: 'none' };
  }
  return {
    positions: shown.filter((r) => r.country_code !== 'YE'),
    others: v2.filter((r) => isOtherCoded(r) && r.country_code !== 'YE'),
    count: shown.length,
    yemen: ye.length > 0 ? yemenLines(ye) : null,
    stated,
    awaiting: [...awaiting].sort((a, b) => countryName(a).localeCompare(countryName(b))),
    outside: shown.filter((r) => !TILED.has(r.country_code)),
    tiles,
  };
}

/** Old method (v1, frozen) group: rows that carry a number, Yemen as its two lines. Never per conflict. */
export function v1Group(board: PostureBoard): { rows: PostureView[]; yemen: YemenLine[] | null } {
  const v1 = board.rows.filter(isShownV1);
  const ye = v1.filter((r) => r.country_code === 'YE');
  return {
    rows: v1.filter((r) => r.country_code !== 'YE').sort((a, b) => countryName(a.country_code).localeCompare(countryName(b.country_code))),
    yemen: ye.length > 0 ? yemenLines(ye) : null,
  };
}

/** Tracked countries with nothing on record on any front (v1 rows without a number count as nothing). */
export function noPositionOnRecord(board: PostureBoard): string[] {
  const has = new Set(board.rows.filter((r) => isV2(r) || isShownV1(r)).map((r) => r.country_code));
  return TRACKED_COUNTRY_CODES.filter((c) => !has.has(c)).sort((a, b) => countryName(a).localeCompare(countryName(b)));
}

// ---------------------------------------------------------------------------------------------------
// Day stepper (R2)
// ---------------------------------------------------------------------------------------------------
/**
 * War Posture v2 coding days in the data: the server's list (board.v2Days, public.posture_v2_days: the same
 * whatever day is viewed), else (RPC missing or failed) the viewed rows' score_day / previous_day.
 */
export function v2CodingDays(board: PostureBoard): number[] {
  if (board.schema !== 'v2') return [];
  const days = new Set<number>(board.v2Days ?? []);
  if (!board.v2Days) {
    for (const r of board.rows) {
      if (!isV2(r) || r.withheld || r.stance === 'uncoded') continue;
      if (typeof r.score_day === 'number') days.add(r.score_day);
      if (typeof r.previous_day === 'number') days.add(r.previous_day);
    }
  }
  return [...days].sort((a, b) => a - b);
}
export interface StepperState {
  /** false = one v2 day only: no stepper (earlier days are the old method). */
  show: boolean;
  prev: number | null;
  next: number | null;
}
/**
 * Shown once two v2 coding days exist; steps a day at a time from the earliest v2 day to the latest day
 * (`latestDay`: the server's latest board). On the earliest day Previous is disabled, never hidden.
 */
export function stepperState(board: PostureBoard, latestDay: number | null = board.latestDay): StepperState {
  const days = v2CodingDays(board);
  if (days.length < 2 || board.day == null) return { show: false, prev: null, next: null };
  const prev = board.day - 1 >= days[0] ? board.day - 1 : null;
  const next = latestDay != null && board.day < latestDay ? board.day + 1 : null;
  return { show: true, prev, next };
}

/** true = the board shows a day other than the server's latest board (the page's own day), never board.latestDay. */
export function isHistorical(board: Pick<PostureBoard, 'day'>, latestDay: number | null | undefined): boolean {
  return board.day != null && latestDay != null && board.day !== latestDay;
}

/** A `?day=` value the board accepts: an integer from 1 to the current conflict day, else null (= latest). */
export function parseDayParam(raw: string | null | undefined, today: number): number | null {
  if (!raw || !/^[1-9]\d{0,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= today ? n : null;
}
/** Days 1–35 used the retired (US-referenced) method: archived, never shown on the War Posture page. */
export const ARCHIVED_LAST_DAY = 35;

// ---------------------------------------------------------------------------------------------------
// Sorting and formatting
// ---------------------------------------------------------------------------------------------------
export type SortKey = 'score' | 'date' | 'name';
export const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'date', label: 'Latest evidence' },
  { key: 'name', label: 'Name' },
];
export function rowName(r: Pick<PostureView, 'country_code' | 'actor' | 'actor_display_name'>): string {
  return r.country_code === 'YE' && r.actor_display_name ? r.actor_display_name : countryName(r.country_code);
}
export const evidenceDate = (r: PostureView): string => r.evidence?.stated_at ?? r.evidence?.captured_at ?? r.evidence_date ?? '';
export function sortPositions(rows: PostureView[], key: SortKey): PostureView[] {
  const byName = (a: PostureView, b: PostureView) => rowName(a).localeCompare(rowName(b));
  return [...rows].sort((a, b) =>
    key === 'name'
      ? byName(a, b)
      : key === 'date'
        ? evidenceDate(b).localeCompare(evidenceDate(a)) || byName(a, b)
        : (b.expressed_score ?? -1) - (a.expressed_score ?? -1) || byName(a, b),
  );
}
/** "11 Oct 2026" (UTC). */
export function longDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
/** "Day 229 · 14 Oct". */
export function dayLabel(day: number | null): string {
  if (day == null) return 'Day —';
  const d = longDate(dayToIsoDate(day));
  return `Day ${day}${d ? ` · ${d.replace(/ \d{4}$/, '')}` : ''}`;
}
/** First sentence of a desk basis as stored, else a clip; "…" marks a cut. */
export function basisClip(text: string | null, max = 240): string | null {
  if (!text) return null;
  const m = /^(.{40,}?[.!?])\s/.exec(text);
  const head = m && m[1].length <= max ? m[1] : text.length <= max ? text : text.slice(0, max - 1).trimEnd();
  return head.length < text.length ? `${head} …` : head;
}
/** Bare host of a URL, "www." stripped (shown when the outlet registry has no entry: never a guess). */
export function hostOf(url: string): string {
  const m = /^https?:\/\/([^/:?#\s]+)/i.exec(url);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : url;
}
export function sourceLabel(url: string, labels: SourceLabels, partySource: boolean | null): SourceLabel {
  const hit = labels[url];
  return hit ? { ...hit, party: hit.party || partySource === true } : { name: hostOf(url), known: false, party: partySource === true };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v));
/** Shape check of an /api/viewer/posture body before it replaces the board (a bad body shows the error state). */
export function isBoardPayload(j: unknown): j is PostureBoard & { labels?: SourceLabels } {
  if (!isObj(j) || (j.schema !== 'v1' && j.schema !== 'v2') || !numOrNull(j.day) || !numOrNull(j.latestDay)) return false;
  if (!Array.isArray(j.conflicts) || !j.conflicts.every((c) => isObj(c) && typeof c.conflict_code === 'string' && typeof c.short_name === 'string')) return false;
  if (j.v2Days !== undefined && !(Array.isArray(j.v2Days) && j.v2Days.every((d) => typeof d === 'number'))) return false;
  if (j.labels !== undefined && !isObj(j.labels)) return false;
  return (
    Array.isArray(j.rows) &&
    j.rows.every(
      (r) =>
        isObj(r) &&
        typeof r.country_code === 'string' &&
        (r.method === POSTURE_V2_METHOD || r.method === POSTURE_V1_METHOD) &&
        typeof r.stance === 'string' &&
        typeof r.actor === 'string' &&
        numOrNull(r.expressed_score) &&
        Array.isArray(r.v2UncodedConflicts) &&
        Array.isArray(r.cited) &&
        (r.evidence === null || (isObj(r.evidence) && typeof r.evidence.source_url === 'string' && typeof r.evidence.quote === 'string')),
    )
  );
}
