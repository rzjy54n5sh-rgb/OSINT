/**
 * Scenario series method by conflict day. scenario_probabilities holds two incompatible series:
 *  - Days 1-35:   legacy desk estimates (method legacy-desk-v0, retired)
 *  - Days 221-249: deterministic market-anchored-v1 (scenario_daily registry)
 *  - Day 250+:    market-anchored-v2 (ruling A-01, 2026-11-22: the US-Iran ceasefire link ended; D measured as D-prime)
 * They must never be drawn as one continuous line. Boundaries mirror the registry
 * (scenario_daily.method_version); Days 36-220 have no row.
 */
export const LEGACY_DESK_LAST_DAY = 35;
export const MARKET_ANCHORED_FIRST_DAY = 221;
export const MARKET_ANCHORED_V2_FIRST_DAY = 250;

export type ScenarioMethod = 'legacy-desk-v0' | 'market-anchored-v1' | 'market-anchored-v2' | 'unrecorded';

export function scenarioMethodForDay(day: number): ScenarioMethod {
  if (day <= LEGACY_DESK_LAST_DAY) return 'legacy-desk-v0';
  if (day >= MARKET_ANCHORED_V2_FIRST_DAY) return 'market-anchored-v2';
  if (day >= MARKET_ANCHORED_FIRST_DAY) return 'market-anchored-v1';
  return 'unrecorded';
}

export function scenarioMethodNote(m: ScenarioMethod): string {
  if (m === 'legacy-desk-v0') return 'legacy desk estimate \u2014 retired method, cannot be scored';
  if (m === 'market-anchored-v1' || m === 'market-anchored-v2') return m;
  return 'method unrecorded';
}
