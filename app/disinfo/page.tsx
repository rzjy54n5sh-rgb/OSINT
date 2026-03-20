import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { DisinfoTrackerClient } from '@/components/disinfo/DisinfoTrackerClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';

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
      return verdict?.trim() ? verdict.toUpperCase() : 'UNVERIFIED';
  }
}

type DisinfoClaimDbRow = {
  id: string;
  claim_text: string;
  verdict: string | null;
  source_url: string | null;
  debunk_url: string | null;
  spread_estimate: string | null;
  created_at: string;
};

export default async function DisinfoPage() {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);

  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const hasFullAccess = tierHasFeature(user?.tier, 'disinformation_full', flags);
  const isFreeUser = !hasFullAccess;

  const { data, error, count } = await supabase
    .from('disinfo_claims')
    .select('id, claim_text, verdict, source_url, debunk_url, spread_estimate, created_at', { count: 'exact' })
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
      debunk_url: row.debunk_url ?? undefined,
      spread_estimate: row.spread_estimate,
      created_at: row.created_at,
    };
  });

  return (
    <DisinfoTrackerClient
      claims={mapped}
      hasFullAccess={hasFullAccess}
      total={total}
      showing={mapped.length}
      conflictDayBadge={<ConflictDayBadge />}
    />
  );
}
