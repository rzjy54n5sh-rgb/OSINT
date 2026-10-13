import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';
import { getCorridors } from '@/lib/corridors';
import { CorridorsPageBody } from '@/components/corridors/CorridorsPageBody';

/**
 * /corridors — is Hormuz, Bab al-Mandeb or Suez open this week? (UX audit 2026-10, problem #1.)
 * Data: data/chokepoints/latest.json and history.json, imported at build time; freshness is
 * re-evaluated on every render with the daily card's own gate (lib/corridors.ts). No cookies,
 * no Supabase, no per-visitor content: the HTML is the same for everyone and cacheable.
 */
export const revalidate = 900;

export const metadata: Metadata = pageMetadata({
  title: 'Corridors — Hormuz, Bab al-Mandeb & Suez this week — MENA Intel Desk',
  description:
    'Weekly status of the Strait of Hormuz, Bab al-Mandeb and the Suez Canal: transits against the 2023 average week from IMF PortWatch (AIS-based), with the rules that set NORMAL, ELEVATED and DISRUPTED.',
  path: '/corridors',
});

export default function CorridorsPage() {
  return <CorridorsPageBody view={getCorridors(new Date())} />;
}
