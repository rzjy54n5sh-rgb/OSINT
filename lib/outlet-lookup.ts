/**
 * Outlet registry lookup for source labelling (operator decision R1, 2026-10-13).
 *
 * A cited source is shown as a party/state source when its stored `party_source` is true OR its
 * outlet resolves in public.outlets to party_status `party` / `state_aligned`. Resolution goes through
 * public.outlet_aliases: the URL host first (normalised exactly like public.url_host: lowercase,
 * leading "www." stripped), then the exact source_name. A stored true is never downgraded.
 * Al Jazeera is never upgraded from the registry: its party status depends on the topic
 * (DECISION-002), so its stored per-citation flag stands.
 */
import { createPublicClient } from '@/utils/supabase/server';

export type PartyStatus = 'party' | 'state_aligned' | 'independent' | 'unknown';
export interface OutletEntry {
  name: string;
  party_status: PartyStatus;
}
/** Keys: `host:<host>` and `name:<exact source_name>`. */
export type OutletRegistry = ReadonlyMap<string, OutletEntry>;

export type PartyLabel = 'State-aligned' | 'Party' | 'Party source';
export interface PartyFlag {
  party: boolean;
  label: PartyLabel | null;
}

/** Mirror of public.url_host(u): regexp_replace(lower(substring(u FROM '^https?://([^/:?#[:space:]]+)')), '^www\.', ''). */
export function urlHost(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const m = /^https?:\/\/([^/:?#\s]+)/.exec(u);
  if (!m) return null;
  return m[1].toLowerCase().replace(/^www\./, '');
}

/** Al Jazeera outlets in the registry ("Al Jazeera English", "Al Jazeera Arabic"). */
const AL_JAZEERA_OUTLET = /^al jazeera\b/i;

export function lookupOutlet(src: { url?: string | null; name?: string | null }, reg: OutletRegistry): OutletEntry | null {
  const host = urlHost(src.url);
  if (host) {
    const hit = reg.get(`host:${host}`);
    if (hit) return hit;
  }
  const name = typeof src.name === 'string' ? src.name.trim() : '';
  return name ? (reg.get(`name:${name}`) ?? null) : null;
}

/** The render-time party flag for one source (see the module comment for the rule). */
export function resolveParty(
  src: { url?: string | null; name?: string | null; party_source?: boolean | null },
  reg: OutletRegistry,
): PartyFlag {
  const stored = src.party_source === true;
  const outlet = lookupOutlet(src, reg);
  // The exemption follows the RESOLVED outlet (host or exact alias), never words in the free-text name.
  const status = outlet && !AL_JAZEERA_OUTLET.test(outlet.name) ? outlet.party_status : null;
  if (status === 'party') return { party: true, label: 'Party' };
  if (status === 'state_aligned') return { party: true, label: 'State-aligned' };
  if (stored) return { party: true, label: 'Party source' };
  return { party: false, label: null };
}

/** Exact alias candidates for a set of sources: hosts (url_host-normalised) and trimmed names. */
export function aliasCandidates(sources: { url?: string | null; name?: string | null }[]): string[] {
  const out = new Set<string>();
  for (const s of sources) {
    const h = urlHost(s.url);
    if (h) out.add(h);
    const n = typeof s.name === 'string' ? s.name.trim() : '';
    if (n) out.add(n);
  }
  return [...out].slice(0, 200);
}

const STATUSES: readonly string[] = ['party', 'state_aligned', 'independent', 'unknown'];

/**
 * Reads only the aliases this brief needs (public read policy; cookie-less client, one per call).
 * Never throws: on any error the registry is empty and only stored flags are shown.
 */
export async function fetchOutletRegistry(sources: { url?: string | null; name?: string | null }[]): Promise<OutletRegistry> {
  const reg = new Map<string, OutletEntry>();
  const aliases = aliasCandidates(sources);
  if (!aliases.length) return reg;
  try {
    const sb = createPublicClient();
    const { data, error } = await sb
      .from('outlet_aliases')
      .select('alias_kind, alias, outlets(name, party_status)')
      .in('alias', aliases);
    if (error || !Array.isArray(data)) return reg;
    for (const row of data as unknown as { alias_kind: string; alias: string; outlets: unknown }[]) {
      const o = (Array.isArray(row.outlets) ? row.outlets[0] : row.outlets) as { name?: unknown; party_status?: unknown } | null;
      if (!o || typeof o.name !== 'string' || typeof o.party_status !== 'string' || !STATUSES.includes(o.party_status)) continue;
      const kind = row.alias_kind === 'host' ? 'host' : row.alias_kind === 'source_name' ? 'name' : null;
      if (kind) reg.set(`${kind}:${row.alias}`, { name: o.name, party_status: o.party_status as PartyStatus });
    }
  } catch {
    /* empty registry: stored flags only */
  }
  return reg;
}
