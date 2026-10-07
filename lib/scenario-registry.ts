/**
 * Scenario registry read model (migration 20261007100000 + 100100 + 100500).
 *
 * Names, definitions and status come from `scenarios`; measurement state from `v_scenario_lifecycle`;
 * published probabilities (one row per scenario per day, each stamped with its method) from
 * `scenario_daily`; the inputs, horizon, computed values and flags of a day from `scenario_runs`.
 * Nothing here is hard-coded scenario copy: if the registry changes (a scenario is born, fades or
 * retires), the pages follow it.
 *
 * Method rule for the UI: series of DIFFERENT methods are never joined. Days 1-35 are
 * `legacy-desk-v0` (inputs not stored, cannot be reproduced); Day 221+ are `market-anchored-v1`.
 * `seriesByMethod()` splits the history so charts and deltas only compare like with like.
 *
 * Safe on server and client (takes the caller's Supabase client; no global client).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type Sb = Pick<SupabaseClient, 'from'>;

export const CURRENT_SCENARIO_METHOD = 'market-anchored-v1';
export const LEGACY_SCENARIO_METHOD = 'legacy-desk-v0';

export interface RegistryScenario {
  id: string;
  code: string;
  group_code: string;
  name_en: string;
  definition_en: string;
  status: string;
  display_order: number;
  born_day: number | null;
  fading_since_day: number | null;
  retired_day: number | null;
  /** v_scenario_lifecycle.measurement_state ('measured' | 'unmeasured' | …); null if the view has no row. */
  measurement_state: string | null;
  latest_probability: number | null;
  as_of_day: number | null;
  days_below_threshold: number | null;
}

export interface ScenarioPoint {
  code: string;
  conflict_day: number;
  method_version: string;
  probability: number | null;
  null_reason: string | null;
  provenance: string | null;
  run_id: string | null;
}

export interface RunInput {
  venue: string;
  question: string;
  url: string;
  probability: number | null;
  yes_bid: number | null;
  yes_ask: number | null;
  liquidity: string | null;
  scenario_class: string;
  used: boolean;
  excluded_reason: string | null;
  transform: string | null;
  read_at: string | null;
  resolution_date: string | null;
}

export interface ScenarioRun {
  id: string;
  conflict_day: number;
  method_version: string;
  horizon_end: string | null;
  verdict: string;
  flags: string[];
  inputs: RunInput[];
  hormuz_gate_rule: string | null;
  raw_percent: Record<string, number> | null;
  provenance: string | null;
  recorded_at: string | null;
}

export interface ScenarioMethod {
  method_version: string;
  description: string;
}

export interface ScenarioGroup {
  code: string;
  name_en: string;
  kind: string;
  sum_target: number | null;
  fade_threshold_pct: number;
  fade_consecutive_days: number;
}

export interface ScenarioRegistryView {
  scenarios: RegistryScenario[];
  /** Published points, ascending by day. */
  history: ScenarioPoint[];
  /** Latest published day (any method) and its method. */
  latestDay: number | null;
  latestMethod: string | null;
  /** Run that produced the latest published day (null for legacy days, which have no run). */
  run: ScenarioRun | null;
  methods: ScenarioMethod[];
  groups: ScenarioGroup[];
  error: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function parseInputs(raw: unknown): RunInput[] {
  if (!Array.isArray(raw)) return [];
  const out: RunInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const url = str(o.url);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    out.push({
      venue: str(o.venue) ?? '—',
      question: str(o.question) ?? url,
      url,
      probability: num(o.probability),
      yes_bid: num(o.yes_bid),
      yes_ask: num(o.yes_ask),
      liquidity: str(o.liquidity),
      scenario_class: str(o.scenario_class) ?? '—',
      used: o.used === true,
      excluded_reason: str(o.excluded_reason),
      transform: str(o.transform),
      read_at: str(o.read_at),
      resolution_date: str(o.resolution_date),
    });
  }
  return out;
}

function parseRun(row: Record<string, unknown> | null): ScenarioRun | null {
  if (!row) return null;
  const computed = (row.computed && typeof row.computed === 'object' ? row.computed : {}) as Record<string, unknown>;
  const gate = (computed.hormuz_gate && typeof computed.hormuz_gate === 'object' ? computed.hormuz_gate : {}) as Record<
    string,
    unknown
  >;
  const rawPct = computed.raw_percent && typeof computed.raw_percent === 'object' ? computed.raw_percent : null;
  const raw_percent = rawPct
    ? Object.fromEntries(
        Object.entries(rawPct as Record<string, unknown>)
          .map(([k, v]) => [k, num(v)] as const)
          .filter((e): e is readonly [string, number] => e[1] !== null),
      )
    : null;
  return {
    id: String(row.id),
    conflict_day: Number(row.conflict_day),
    method_version: String(row.method_version),
    horizon_end: str(row.horizon_end),
    verdict: String(row.verdict ?? ''),
    flags: Array.isArray(row.flags) ? (row.flags as unknown[]).filter((f): f is string => typeof f === 'string') : [],
    inputs: parseInputs(row.inputs),
    hormuz_gate_rule: str(gate.rule),
    raw_percent,
    provenance: str(row.provenance),
    recorded_at: str(row.recorded_at),
  };
}

export async function getScenarioRegistryView(supabase: Sb): Promise<ScenarioRegistryView> {
  const empty: ScenarioRegistryView = {
    scenarios: [],
    history: [],
    latestDay: null,
    latestMethod: null,
    run: null,
    methods: [],
    groups: [],
    error: null,
  };
  try {
    const [sc, lc, daily, methods, groups] = await Promise.all([
      supabase
        .from('scenarios')
        .select('id, code, group_code, name_en, definition_en, status, display_order, born_day, fading_since_day, retired_day')
        .order('display_order', { ascending: true }),
      supabase
        .from('v_scenario_lifecycle')
        .select('code, measurement_state, latest_probability, as_of_day, days_below_threshold'),
      // Newest first so the 1000-row PostgREST cap can only ever drop the OLDEST rows.
      supabase
        .from('scenario_daily')
        .select('scenario_id, conflict_day, method_version, probability, null_reason, provenance, run_id')
        .eq('is_published', true)
        .order('conflict_day', { ascending: false })
        .limit(1000),
      supabase.from('scenario_methods').select('method_version, description'),
      supabase
        .from('scenario_groups')
        .select('code, name_en, kind, sum_target, fade_threshold_pct, fade_consecutive_days'),
    ]);
    const err = sc.error?.message ?? daily.error?.message ?? null;
    if (err) return { ...empty, error: err };

    const lifecycle = new Map<string, Record<string, unknown>>();
    for (const r of (lc.data ?? []) as Record<string, unknown>[]) lifecycle.set(String(r.code), r);

    const scenarios: RegistryScenario[] = ((sc.data ?? []) as Record<string, unknown>[]).map((r) => {
      const l = lifecycle.get(String(r.code));
      return {
        id: String(r.id),
        code: String(r.code),
        group_code: String(r.group_code),
        name_en: String(r.name_en),
        definition_en: String(r.definition_en),
        status: String(r.status),
        display_order: Number(r.display_order ?? 100),
        born_day: num(r.born_day),
        fading_since_day: num(r.fading_since_day),
        retired_day: num(r.retired_day),
        measurement_state: l ? str(l.measurement_state) : null,
        latest_probability: l ? num(l.latest_probability) : null,
        as_of_day: l ? num(l.as_of_day) : null,
        days_below_threshold: l ? num(l.days_below_threshold) : null,
      };
    });
    const codeById = new Map(scenarios.map((s) => [s.id, s.code]));

    const history: ScenarioPoint[] = ((daily.data ?? []) as Record<string, unknown>[])
      .filter((r) => codeById.has(String(r.scenario_id)))
      .map((r) => ({
        code: codeById.get(String(r.scenario_id))!,
        conflict_day: Number(r.conflict_day),
        method_version: String(r.method_version),
        probability: num(r.probability),
        null_reason: str(r.null_reason),
        provenance: str(r.provenance),
        run_id: str(r.run_id),
      }))
      .sort((a, b) => a.conflict_day - b.conflict_day || a.code.localeCompare(b.code));

    const last = history.at(-1) ?? null;
    const latestDay = last?.conflict_day ?? null;
    const latestMethod = last?.method_version ?? null;
    const runId = history.filter((p) => p.conflict_day === latestDay).find((p) => p.run_id)?.run_id ?? null;

    let run: ScenarioRun | null = null;
    if (runId) {
      const { data } = await supabase
        .from('scenario_runs')
        .select('id, conflict_day, method_version, horizon_end, verdict, flags, inputs, computed, provenance, recorded_at')
        .eq('id', runId)
        .maybeSingle();
      run = parseRun((data as Record<string, unknown> | null) ?? null);
    }

    return {
      scenarios,
      history,
      latestDay,
      latestMethod,
      run,
      methods: ((methods.data ?? []) as Record<string, unknown>[]).map((m) => ({
        method_version: String(m.method_version),
        description: String(m.description ?? ''),
      })),
      groups: ((groups.data ?? []) as Record<string, unknown>[]).map((g) => ({
        code: String(g.code),
        name_en: String(g.name_en),
        kind: String(g.kind),
        sum_target: num(g.sum_target),
        fade_threshold_pct: num(g.fade_threshold_pct) ?? 10,
        fade_consecutive_days: num(g.fade_consecutive_days) ?? 14,
      })),
      error: null,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'Failed to load scenario registry' };
  }
}

/** One chart row per day: { day, [code]: probability | null }. */
export type ScenarioChartRow = { day: number } & Record<string, number | null>;

/** Split published history into one series per method (never joined across methods). */
export function seriesByMethod(history: ScenarioPoint[]): { method: string; firstDay: number; lastDay: number; rows: ScenarioChartRow[] }[] {
  const byMethod = new Map<string, Map<number, ScenarioChartRow>>();
  for (const p of history) {
    let days = byMethod.get(p.method_version);
    if (!days) byMethod.set(p.method_version, (days = new Map()));
    let row = days.get(p.conflict_day);
    if (!row) days.set(p.conflict_day, (row = { day: p.conflict_day } as ScenarioChartRow));
    row[p.code] = p.probability;
  }
  return Array.from(byMethod.entries())
    .map(([method, days]) => {
      const rows = Array.from(days.values()).sort((a, b) => a.day - b.day);
      return { method, firstDay: rows[0]!.day, lastDay: rows.at(-1)!.day, rows };
    })
    .sort((a, b) => a.firstDay - b.firstDay);
}

/** Probability of `code` on `day` (null when not published / unmeasured). */
export function probabilityOn(history: ScenarioPoint[], code: string, day: number | null): number | null {
  if (day == null) return null;
  return history.find((p) => p.code === code && p.conflict_day === day)?.probability ?? null;
}

/**
 * Change of `code` since the FIRST day of the SAME method as `day` (never across methods).
 * Returns null when there is no earlier day in that method.
 */
export function deltaWithinMethod(
  history: ScenarioPoint[],
  code: string,
  day: number | null,
): { delta: number; sinceDay: number; method: string } | null {
  if (day == null) return null;
  const cur = history.find((p) => p.code === code && p.conflict_day === day);
  if (!cur || cur.probability === null) return null;
  const first = history.find(
    (p) => p.code === code && p.method_version === cur.method_version && p.probability !== null && p.conflict_day < day,
  );
  if (!first || first.probability === null) return null;
  return { delta: cur.probability - first.probability, sinceDay: first.conflict_day, method: cur.method_version };
}

export const SCENARIO_COLORS: Record<string, string> = {
  A: '#4EC98A',
  B: '#E8C547',
  C: '#4A8FE8',
  D: '#E05252',
  E: '#B78CF5',
};
const FALLBACK_COLORS = ['#3FC1C9', '#F08A5D', '#9BE15D', '#E86ED0'];
export function scenarioColor(code: string, i = 0): string {
  return SCENARIO_COLORS[code] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]!;
}

/** "the run's flag text" for E-style unmeasured scenarios: the flag that starts with "<code> NULL:". */
export function unmeasuredFlag(run: ScenarioRun | null, code: string): string | null {
  if (!run) return null;
  const f = run.flags.find((x) => x.startsWith(`${code} NULL:`));
  return f ? f.slice(`${code} NULL:`.length).trim() : null;
}
