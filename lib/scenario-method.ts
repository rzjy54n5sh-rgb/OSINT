/**
 * Scenario series method by conflict day. scenario_probabilities holds two incompatible series:
 *  - Days 1-35:   legacy desk estimates (method legacy-desk-v0, retired)
 *  - Day 221+:    deterministic market-anchored-v1 (scenario_daily registry)
 * They must never be drawn as one continuous line. Boundaries mirror the registry
 * (scenario_daily.method_version); Days 36-220 have no row.
 */
export const LEGACY_DESK_LAST_DAY = 35;
export const MARKET_ANCHORED_FIRST_DAY = 221;

export type ScenarioMethod = 'legacy-desk-v0' | 'market-anchored-v1' | 'unrecorded';

export function scenarioMethodForDay(day: number): ScenarioMethod {
  if (day <= LEGACY_DESK_LAST_DAY) return 'legacy-desk-v0';
  if (day >= MARKET_ANCHORED_FIRST_DAY) return 'market-anchored-v1';
  return 'unrecorded';
}

export function scenarioMethodNote(m: ScenarioMethod): string {
  if (m === 'legacy-desk-v0') return 'legacy desk estimate, retired method';
  if (m === 'market-anchored-v1') return 'market-anchored-v1';
  return 'method unrecorded';
}
