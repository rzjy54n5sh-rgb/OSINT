import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Operator notice on the scenarios surfaces (/scenarios panel, home scenario card line): the
 * public.platform_alerts row with key = 'scenario_notice'. The operator edits the row to tell readers
 * why the scenario model is paused; no code change per notice. RLS lets anon read active rows only.
 *
 * Shown only when is_active and (expires_at is null or expires_at > now). Any read failure, including
 * a timeout, yields null: the pages render without the notice and never throw (a thrown read once
 * caused 500s). Text only: callers render the strings as React text children, never as HTML; bidi
 * override/isolate controls are stripped so a pasted control cannot reorder the surrounding page text.
 * The stamp is updated_at: the admin edit and toggle both move it, activated_at is never set by either.
 */
export const SCENARIO_NOTICE_KEY = 'scenario_notice';

/** Same budget as the home page's per-section reads (app/page.tsx SECTION_TIMEOUT_MS). */
export const SCENARIO_NOTICE_TIMEOUT_MS = 3000;

export type ScenarioNoticeClient = Pick<SupabaseClient, 'from'>;

export type ScenarioNotice = {
  title: string | null;
  message: string | null;
  messageAr: string | null;
  /** updated_at, ISO timestamp as stored, or null. */
  updatedAt: string | null;
};

/** Bidi embedding/override (U+202A–U+202E) and isolate (U+2066–U+2069) controls. LRM/RLM are kept. */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g;

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(BIDI_CONTROLS, '').trim();
  return t !== '' ? t : null;
};

/** Pure: the notice to show for this row at `now`, or null. An unreadable expires_at fails closed. */
/** What a field renders as (null for blank), CRLF folded to LF: the admin "did the English change" test. */
export function noticeComparableText(v: unknown): string | null {
  const t = text(typeof v === 'string' ? v.replace(/\r\n/g, '\n') : v);
  return t;
}

export function scenarioNoticeFromRow(row: unknown, now: Date): ScenarioNotice | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (r.is_active !== true) return null;
  if (r.expires_at != null) {
    const exp = typeof r.expires_at === 'string' ? Date.parse(r.expires_at) : NaN;
    if (Number.isNaN(exp) || exp <= now.getTime()) return null;
  }
  const title = text(r.title);
  const message = text(r.message);
  // Intended: an Arabic-only row shows nothing. English is the publication language; Arabic accompanies it.
  if (!title && !message) return null;
  return {
    title,
    message,
    messageAr: text(r.message_ar),
    updatedAt: typeof r.updated_at === 'string' && !Number.isNaN(Date.parse(r.updated_at)) ? r.updated_at : null,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Updated 4 Nov 2026, 05:10 UTC" (UTC getters, no locale data: identical in Node and Workers). */
export function formatNoticeUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `Updated ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/**
 * Reads the row and applies the visibility rule. Never throws; null on error, timeout or no row.
 * The request carries an AbortSignal that fires at timeoutMs (cancels the fetch); the Promise.race
 * stays as the hard cap in case a client ignores the signal.
 */
export async function getScenarioNotice(
  supabase: ScenarioNoticeClient,
  now: Date,
  { timeoutMs = SCENARIO_NOTICE_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<ScenarioNotice | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.error(`[scenario-notice] read timed out after ${timeoutMs} ms`);
      resolve(null);
    }, timeoutMs);
  });
  const read = (async () => {
    const { data, error } = await supabase
      .from('platform_alerts')
      .select('key, title, message, message_ar, is_active, updated_at, expires_at')
      .eq('key', SCENARIO_NOTICE_KEY)
      .abortSignal(AbortSignal.timeout(timeoutMs))
      .maybeSingle();
    if (error) {
      console.error('[scenario-notice] read failed:', error);
      return null;
    }
    return scenarioNoticeFromRow(data, now);
  })().catch((e: unknown) => {
    console.error('[scenario-notice] read failed:', e);
    return null;
  });
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
