/**
 * Typed re-export of the daily card's data-quality gate and chokepoint model
 * (scripts/card/lib/gates.mjs, scripts/card/lib/model.mjs). Those files are human-owned and are
 * imported as-is, never copied: the same function objects run here and in the card.
 * TypeScript infers loose types from the plain .mjs, so the signatures are stated once here.
 */
import * as gates from '../scripts/card/lib/gates.mjs';
import * as model from '../scripts/card/lib/model.mjs';

export interface GateBundle {
  chokepoints: unknown;
  registry: unknown[];
  daily: unknown[];
  brief: unknown;
  changes: unknown[];
}
export interface GateResult {
  ok: boolean;
  errors: string[];
  stale: { chokepoints: boolean; scenarios: boolean; brief: boolean };
  notes: string[];
}
export interface ChokepointViewLane {
  id: string;
  name?: string;
  subname?: string | null;
  status?: string;
  index?: number;
  transits?: number;
  prev?: number | null;
  wow?: number | null;
  weekStart?: string;
  weekEnd?: string;
  asOf?: string;
  sourceUrl?: string;
  override?: string | null;
  statusBand?: string | null;
  statusDriver?: string | null;
  statusSourceUrl?: string | null;
}
export interface ChokepointView {
  asOf: string | null;
  commonWeek: { start: string; end: string } | null;
  lanes: ChokepointViewLane[];
}

export const runGates = gates.runGates as unknown as (
  bundle: GateBundle,
  opts: { now: Date; allowStale?: boolean },
) => GateResult;
export const MAX_AGE_DAYS = gates.MAX_AGE_DAYS as { chokepoints: number; scenarios: number; brief: number };
export const MAX_WEEK_END_AGE_DAYS = gates.MAX_WEEK_END_AGE_DAYS as number;

export const BASELINE_WEEK = model.BASELINE_WEEK as Record<'suez' | 'bam_redsea' | 'hormuz', number>;
export const chokepointView = model.chokepointView as unknown as (cp: unknown) => ChokepointView;
