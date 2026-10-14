/**
 * Server-only: outlet names for the War Posture board's source links (R10: the DB outlet name wins).
 * Host of each evidence source_url -> public.outlet_aliases -> public.outlets (lib/outlet-lookup.ts, shared
 * with the brief reader). A host with no registry entry is left out: the board then shows the bare host.
 */
import { fetchOutletRegistry, lookupOutlet, resolveParty } from '@/lib/outlet-lookup';
import type { PostureBoard } from '@/lib/posture';
import type { SourceLabels } from '@/lib/posture-board';

export async function postureSourceLabels(board: PostureBoard): Promise<SourceLabels> {
  const sources = board.rows
    .map((r) => r.evidence)
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .map((e) => ({ url: e.source_url, party_source: e.party_source }));
  const reg = await fetchOutletRegistry(sources);
  const out: SourceLabels = {};
  for (const s of sources) {
    const outlet = lookupOutlet(s, reg);
    if (outlet) out[s.url] = { name: outlet.name, known: true, party: resolveParty(s, reg).party };
  }
  return out;
}
