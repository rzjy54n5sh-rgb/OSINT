import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';
import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { DisinfoTrackerClient } from '@/components/disinfo/DisinfoTrackerClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';

export const metadata: Metadata = pageMetadata({
  title: 'Disinformation Tracker — MENA Intel Desk',
  description:
    'Claims already circulating publicly, logged with a verdict (false, misleading, true or unverified), the original source and the debunk link where one exists.',
  path: '/disinfo',
});

function verdictToStatus(verdict: string | null | undefined): string {
  switch (verdict?.toUpperCase()) {
    case 'FALSE':
      return 'DEBUNKED';
    case 'MISLEADING':
      return 'CONTESTED';
    case 'TRUE':
      return 'CONFIRMED';
    case 'UNVERIFIED':
      return 'UNVERIFIED';
    default:
      return verdict ?? 'UNVERIFIED';
  }
}

type DisinfoClaimDbRow = {
  id: string;
  claim_text: string;
  verdict: string | null;
  source_url: string | null;
  debunk_url: string | null;
  spread_estimate: string | null;
  published_at: string | null;
  created_at: string;
  scope_status: string;
};

/**
 * disinfo_claims.scope_status (applied live 2026-10-07): 'in_scope' | 'out_of_scope' | 'unreviewed'.
 * Default view = in_scope only; `?scope=all` also includes unreviewed claims (labelled as such).
 * out_of_scope is never shown.
 */
export default async function DisinfoPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const sp = await searchParams;
  const includeUnreviewed = (Array.isArray(sp.scope) ? sp.scope[0] : sp.scope) === 'all';
  const scopes = includeUnreviewed ? ['in_scope', 'unreviewed'] : ['in_scope'];
  const [user, supabase] = await Promise.all([getUser(), createClient()]);

  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const hasFullAccess = tierHasFeature(user?.tier, 'disinformation_full', flags);
  const isFreeUser = !hasFullAccess;

  const { data, count } = await supabase
    .from('disinfo_claims')
    // debunk_url included for DEBUNK link in UI (not in minimal spec but present in DB)
    .select('id, claim_text, verdict, source_url, debunk_url, spread_estimate, published_at, created_at, scope_status', {
      count: 'exact',
    })
    .in('scope_status', scopes)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(isFreeUser ? 5 : 200);

  const rows = (data ?? []) as DisinfoClaimDbRow[];
  const total = count ?? rows.length;

  const mapped = rows.map((row) => {
    const status = verdictToStatus(row.verdict);
    return {
      id: row.id,
      claim: row.claim_text,
      status,
      verdict: status,
      source: row.source_url ?? '',
      spread: row.spread_estimate,
      debunk_url: row.debunk_url ?? undefined,
      spread_estimate: row.spread_estimate,
      published_at: row.published_at,
      created_at: row.created_at,
      unreviewed: row.scope_status === 'unreviewed',
    };
  });

  return (
    <DisinfoTrackerClient
      claims={mapped}
      hasFullAccess={hasFullAccess}
      total={total}
      showing={mapped.length}
      includeUnreviewed={includeUnreviewed}
      conflictDayBadge={<ConflictDayBadge />}
    />
  );
}
