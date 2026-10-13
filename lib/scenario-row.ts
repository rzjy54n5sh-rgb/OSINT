/**
 * Home first-screen scenario row: a compact read of the SAME registry view /scenarios renders.
 *
 * Every value comes from the functions the /scenarios cards call (lib/scenario-registry.ts:
 * probabilityOn, residualRangeOn, scenarioDisplay, deltaWithinMethod, formatScenarioDelta,
 * unmeasuredFlag) on the registry's latest published day, so the home row can never show a number
 * /scenarios does not. B is its Fréchet range (never the single low-end number); a scenario with no
 * published value, or one the lifecycle view marks unmeasured, reads "Unmeasured".
 * Pure, no I/O. Unit tests: tests/unit/scenario-row.check.ts.
 */
import {
  deltaWithinMethod,
  formatScenarioDelta,
  isResidual,
  probabilityOn,
  residualRangeOn,
  scenarioColor,
  scenarioDisplay,
  unmeasuredFlag,
  type ScenarioRegistryView,
} from '@/lib/scenario-registry';
import { formatRange } from '@/lib/scenario-range';

export interface ScenarioRowItem {
  code: string;
  /** Registry label (scenarios.name_en). */
  name: string;
  kind: 'point' | 'range' | 'unmeasured';
  /** "14%", "61–81%" or "Unmeasured". */
  text: string;
  /** Published point for A/C/D/E (null for B and for unmeasured). */
  p: number | null;
  /** B's range ends (null otherwise). */
  low: number | null;
  high: number | null;
  /** Same text as the /scenarios card's delta line; null for B and unmeasured. */
  deltaText: string | null;
  /** Why it is unmeasured (run flag or null_reason), when known. */
  reason: string | null;
  /** Not part of the core set (E): measured separately, can overlap. */
  independent: boolean;
  color: string;
}

export interface ScenarioRowView {
  day: number | null;
  method: string | null;
  horizon: string | null;
  items: ScenarioRowItem[];
  error: boolean;
}

export function buildScenarioRow(view: ScenarioRegistryView): ScenarioRowView {
  const day = view.latestDay;
  // Same order as /scenarios: core set first, then independent, each in registry display order.
  const visible = view.scenarios.filter((s) => s.status !== 'retired');
  const ordered = [...visible.filter((s) => s.group_code === 'core'), ...visible.filter((s) => s.group_code !== 'core')];

  const items: ScenarioRowItem[] = ordered.map((s, i) => {
    const residual = isResidual(s.code);
    const p = probabilityOn(view.history, s.code, day);
    const range = residual ? residualRangeOn(view, day) : null;
    // The /scenarios card's rule (ScenariosClient ScenarioCard), applied unchanged.
    const unmeasured = p === null || s.measurement_state === 'unmeasured' || (residual && range === null);
    const point = view.history.find((x) => x.code === s.code && x.conflict_day === day);
    const base = { code: s.code, name: s.name_en, independent: s.group_code !== 'core', color: scenarioColor(s.code, i) };
    if (unmeasured) {
      return {
        ...base,
        kind: 'unmeasured',
        text: 'Unmeasured',
        p: null,
        low: null,
        high: null,
        deltaText: null,
        reason: unmeasuredFlag(view.run, s.code) ?? point?.null_reason ?? null,
      };
    }
    const d = scenarioDisplay(view, s.code, day);
    if (residual && range) {
      return { ...base, kind: 'range', text: formatRange(range), p: null, low: range.low, high: range.high, deltaText: null, reason: null };
    }
    const delta = deltaWithinMethod(view.history, s.code, day);
    return {
      ...base,
      kind: 'point',
      text: d.text,
      p,
      low: null,
      high: null,
      deltaText: delta ? formatScenarioDelta(delta) : 'No earlier day under this method',
      reason: null,
    };
  });

  return {
    day,
    method: view.latestMethod,
    horizon: view.run?.horizon_end ?? null,
    items,
    error: view.error != null,
  };
}
