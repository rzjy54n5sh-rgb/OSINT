import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { DisinfoTrackerClient } from '@/components/disinfo/DisinfoTrackerClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';

type DisinfoRow = {
  id: string;
  conflict_day?: number;
  claim?: string;
  verdict?: string;
  source?: string;
  debunk_url?: string;
  spread_estimate?: string | number | null;
  created_at?: string;
};

function mapDisinfoRecord(r: Record<string, unknown>): DisinfoRow {
  const verdictRaw = String(r.status ?? r.verdict ?? 'UNVERIFIED').toUpperCase();
  return {
    id: String(r.id),
    conflict_day: typeof r.conflict_day === 'number' ? r.conflict_day : undefined,
    claim: String(r.claim_text ?? r.claim ?? ''),
    verdict: verdictRaw,
    source: String(r.source_url ?? r.source ?? ''),
    debunk_url: r.debunk_url != null ? String(r.debunk_url) : undefined,
    spread_estimate: r.spread_estimate as string | number | null | undefined,
    created_at: r.created_at != null ? String(r.created_at) : undefined,
  };
}

export default async function DisinfoPage() {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);

  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const hasFullAccess = tierHasFeature(user?.tier, 'disinformation_full', flags);

  let rawRows: Record<string, unknown>[] | null = null;
  let totalCount: number | null = null;

  const primary = await supabase
    .from('disinformation_tracker')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (!primary.error && primary.data) {
    rawRows = primary.data as Record<string, unknown>[];
    totalCount = primary.count;
  } else {
    const fallback = await supabase
      .from('disinfo_claims')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    if (!fallback.error && fallback.data) {
      rawRows = fallback.data as Record<string, unknown>[];
      totalCount = fallback.count;
    }
  }

  const mapped = (rawRows ?? []).map(mapDisinfoRecord);
  const limit = hasFullAccess ? 500 : 5;
  const data = mapped.slice(0, limit);
  const total = totalCount ?? mapped.length;
  const showing = data.length;

  return (
    <DisinfoTrackerClient
      claims={data}
      hasFullAccess={hasFullAccess}
      total={total}
      showing={showing}
      conflictDayBadge={<ConflictDayBadge />}
    />
  );
}
