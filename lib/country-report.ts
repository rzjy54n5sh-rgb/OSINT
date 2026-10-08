/**
 * Tier-gated reads of `country_reports` (migration 20261008090000_security_hardening).
 *
 * After the migration anon/authenticated can SELECT only the identity columns of country_reports;
 * the paid narrative (`content_json`) is served by the SECURITY DEFINER RPC
 * `viewer_country_report(p_code)`, which returns it only when the CALLER's JWT has the country's
 * `country_report_*` feature (`has_access`). Anonymous = free tier.
 *
 * Before the migration the RPC does not exist (PGRST202) and the old table read runs instead.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcWithFallback, type ReadVia } from '@/lib/supabase/rpc-fallback';

export const COUNTRY_REPORT_RPC = 'viewer_country_report';

/** Identity columns: granted to anon/authenticated before and after the migration. */
export const COUNTRY_REPORT_FREE_COLUMNS = 'country_code, country_name, conflict_day, updated_at';

export interface ViewerCountryReport {
  country_code: string;
  country_name: string | null;
  conflict_day: number | null;
  updated_at: string | null;
  /** RPC only: whether the CALLER's tier unlocks this country's narrative. Absent on a table read. */
  has_access?: boolean;
  /** null unless unlocked (RPC) or explicitly selected (pre-migration table read). */
  content_json?: unknown;
}

type Sb = Pick<SupabaseClient, 'from' | 'rpc'>;

/**
 * Latest report row for ONE country. `withContent` decides whether the pre-migration fallback
 * may select `content_json` (pass the caller's own access decision; the RPC decides by itself).
 */
export async function getViewerCountryReport(
  supabase: Sb,
  code: string,
  { withContent }: { withContent: boolean },
): Promise<{ data: ViewerCountryReport | null; error: { message: string } | null; via: ReadVia }> {
  const cc = code.toUpperCase();
  return rpcWithFallback<ViewerCountryReport>(
    () => supabase.rpc(COUNTRY_REPORT_RPC, { p_code: cc }).maybeSingle<ViewerCountryReport>(),
    () =>
      supabase
        .from('country_reports')
        .select(withContent ? `${COUNTRY_REPORT_FREE_COLUMNS}, content_json` : COUNTRY_REPORT_FREE_COLUMNS)
        .eq('country_code', cc)
        .order('conflict_day', { ascending: false })
        .limit(1)
        .maybeSingle<ViewerCountryReport>(),
  );
}

/**
 * One row per country (latest), narrative per the caller's tier. The fallback reads identity
 * columns ONLY — it never selects `content_json` — so a browser caller never receives a narrative
 * its tier does not unlock; signed-in visitors unlock it through /api/viewer/country/[code].
 */
export async function getViewerCountryReports(
  supabase: Sb,
): Promise<{ data: ViewerCountryReport[] | null; error: { message: string } | null; via: ReadVia }> {
  return rpcWithFallback<ViewerCountryReport[]>(
    () => supabase.rpc(COUNTRY_REPORT_RPC),
    () => supabase.from('country_reports').select(COUNTRY_REPORT_FREE_COLUMNS),
  );
}

/** Narrative is shown only when BOTH the app's tier check and the database (RPC) agree. */
export function narrativeUnlocked(appHasAccess: boolean, row: ViewerCountryReport | null): boolean {
  return appHasAccess && !!row && row.has_access !== false;
}
