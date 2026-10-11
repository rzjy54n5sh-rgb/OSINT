/**
 * Read side of the trust layer (migration 20261009090000_trust_ledgers.sql): corrections log,
 * forecast ledger + resolutions, chain verification.
 *
 * Every reader returns a result object and NEVER throws: until the migration is applied (or if
 * Supabase is unreachable) the pages render a neutral "not yet available" note instead of crashing.
 * Uses the cookie-less public client (ISR-safe, one client per request).
 */
import { createPublicClient } from '@/utils/supabase/server';

export type LedgerResult<T> =
  | { status: 'ok'; rows: T }
  | { status: 'unavailable'; reason: 'not_deployed' | 'error' };

/** PostgREST / Postgres codes for "this table or function does not exist (yet)". */
const MISSING_CODES = new Set(['PGRST205', 'PGRST202', '42P01', '42883']);

function classify(error: { code?: string; message?: string } | null): 'not_deployed' | 'error' {
  if (error?.code && MISSING_CODES.has(error.code)) return 'not_deployed';
  if (error?.message && /does not exist|Could not find the (table|function)/i.test(error.message)) return 'not_deployed';
  return 'error';
}

function client() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
    return createPublicClient();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- corrections

export interface CorrectionRow {
  id: string;
  created_at: string;
  target_table: string;
  target_id: string;
  conflict_day: number | null;
  report_type: string | null;
  correction_class: 'material' | 'minor' | 'clarification' | 'reply';
  summary: string;
  before_excerpt: string | null;
  after_excerpt: string | null;
}

export async function fetchCorrections(limit = 200): Promise<LedgerResult<CorrectionRow[]>> {
  const sb = client();
  if (!sb) return { status: 'unavailable', reason: 'error' };
  try {
    const { data, error } = await sb
      .from('corrections')
      .select('id, created_at, target_table, target_id, conflict_day, report_type, correction_class, summary, before_excerpt, after_excerpt')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { status: 'unavailable', reason: classify(error) };
    return { status: 'ok', rows: (data as CorrectionRow[] | null) ?? [] };
  } catch {
    return { status: 'unavailable', reason: 'error' };
  }
}

// ---------------------------------------------------------------- forecasts

export interface ForecastRow {
  id: string;
  chain_seq: number;
  question_id: string;
  question_text: string;
  resolution_criteria: string;
  reference_class: string | null;
  horizon_date: string;
  forecaster: string;
  probability: number;
  created_at: string;
  row_hash: string;
}

export interface ResolutionRow {
  id: string;
  question_id: string;
  status: 'resolved' | 'annulled';
  outcome: boolean | null;
  resolved_at: string;
  resolution_source_url: string;
  notes: string | null;
  supersedes: string | null;
}

export interface TrackRecord {
  forecasts: ForecastRow[];
  resolutions: ResolutionRow[];
  /** null = intact; object = first broken row; 'unknown' = verification call failed. */
  chain: Record<string, unknown> | null | 'unknown';
}

/** Paginated read: PostgREST caps a response at 1000 rows (CLAUDE.md gotcha). */
async function readAll<T>(
  sb: NonNullable<ReturnType<typeof client>>,
  table: string,
  columns: string,
  order: string,
): Promise<{ rows: T[]; error: { code?: string; message?: string } | null }> {
  const page = 1000;
  const rows: T[] = [];
  for (let from = 0; from < 20000; from += page) {
    const { data, error } = await sb.from(table).select(columns).order(order, { ascending: true }).range(from, from + page - 1);
    if (error) return { rows, error };
    const batch = (data as T[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return { rows, error: null };
}

export async function fetchTrackRecord(): Promise<LedgerResult<TrackRecord>> {
  const sb = client();
  if (!sb) return { status: 'unavailable', reason: 'error' };
  try {
    const f = await readAll<ForecastRow>(
      sb,
      'forecast_ledger',
      'id, chain_seq, question_id, question_text, resolution_criteria, reference_class, horizon_date, forecaster, probability, created_at, row_hash',
      'chain_seq',
    );
    if (f.error) return { status: 'unavailable', reason: classify(f.error) };
    const r = await readAll<ResolutionRow>(
      sb,
      'forecast_resolutions',
      'id, question_id, status, outcome, resolved_at, resolution_source_url, notes, supersedes',
      'created_at',
    );
    if (r.error) return { status: 'unavailable', reason: classify(r.error) };
    let chain: TrackRecord['chain'] = 'unknown';
    const v = await sb.rpc('verify_forecast_chain');
    if (!v.error) chain = (v.data as Record<string, unknown> | null) ?? null;
    return {
      status: 'ok',
      rows: {
        forecasts: f.rows.map((x) => ({ ...x, probability: Number(x.probability) })),
        resolutions: r.rows,
        chain,
      },
    };
  } catch {
    return { status: 'unavailable', reason: 'error' };
  }
}

// ---------------------------------------------------------------- scoring

/** The resolution in force for each question: the row no other row supersedes. */
export function effectiveResolutions(rows: ResolutionRow[]): Map<string, ResolutionRow> {
  const superseded = new Set(rows.map((r) => r.supersedes).filter((x): x is string => !!x));
  const out = new Map<string, ResolutionRow>();
  for (const r of rows) if (!superseded.has(r.id)) out.set(r.question_id, r);
  return out;
}

export interface ScoredQuestion {
  questionId: string;
  questionText: string;
  forecaster: string;
  probability: number;
  forecastAt: string;
  outcome: boolean;
  resolvedAt: string;
  sourceUrl: string;
  brier: number;
}

export interface ForecasterScore {
  forecaster: string;
  questions: number;
  brier: number;
}

/**
 * Brier score over RESOLVED questions only. For each (forecaster, question) the forecast that counts
 * is the last one recorded before the question resolved. Brier = (p − outcome)², outcome 1 = YES.
 * Annulled and open questions are not scored.
 */
export function scoreForecasts(forecasts: ForecastRow[], resolutions: ResolutionRow[]) {
  const eff = effectiveResolutions(resolutions);
  const latest = new Map<string, ForecastRow>();
  for (const f of forecasts) {
    const res = eff.get(f.question_id);
    if (!res || res.status !== 'resolved' || res.outcome == null) continue;
    if (Date.parse(f.created_at) > Date.parse(res.resolved_at)) continue;
    const key = `${f.forecaster}\u0000${f.question_id}`;
    const prev = latest.get(key);
    if (!prev || prev.chain_seq < f.chain_seq) latest.set(key, f);
  }
  const scored: ScoredQuestion[] = [];
  for (const f of latest.values()) {
    const res = eff.get(f.question_id)!;
    const o = res.outcome ? 1 : 0;
    scored.push({
      questionId: f.question_id,
      questionText: f.question_text,
      forecaster: f.forecaster,
      probability: f.probability,
      forecastAt: f.created_at,
      outcome: !!res.outcome,
      resolvedAt: res.resolved_at,
      sourceUrl: res.resolution_source_url,
      brier: (f.probability - o) ** 2,
    });
  }
  const by = new Map<string, ScoredQuestion[]>();
  for (const s of scored) by.set(s.forecaster, [...(by.get(s.forecaster) ?? []), s]);
  const perForecaster: ForecasterScore[] = [...by.entries()]
    .map(([forecaster, list]) => ({
      forecaster,
      questions: list.length,
      brier: list.reduce((a, s) => a + s.brier, 0) / list.length,
    }))
    .sort((a, b) => a.forecaster.localeCompare(b.forecaster));
  scored.sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt));
  return { scored, perForecaster };
}

export function formatUtc(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

export function formatDate(ts: string): string {
  const d = new Date(ts.length === 10 ? `${ts}T00:00:00Z` : ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Only http(s) links are rendered as links. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}
