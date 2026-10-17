import { pageMetadata } from '@/lib/site';
import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import HomeDashboard, { type HomeServerData } from './HomeDashboard';
import { ScenarioRow } from '@/components/home/ScenarioRow';
import { CorridorStrip } from '@/components/corridors/CorridorStrip';
import { getCorridors } from '@/lib/corridors';
import { reliefLaneStyles } from '@/components/home/relief/model';
import { getScenarioRegistryView } from '@/lib/scenario-registry';
import { buildScenarioRow } from '@/lib/scenario-row';
import { getPostureBoard, type PostureBoard } from '@/lib/posture';
import { postureSourceLabels } from '@/lib/posture-outlets';
import type { SourceLabels } from '@/lib/posture-board';
import { briefSectionAnchor, changesSectionIndex, homePosture, overnightItems, shownOvernightItems, type HomeTrust } from '@/lib/home-v2';
import { fetchOutletRegistry, type OutletRegistry } from '@/lib/outlet-lookup';
import { effectiveResolutions, fetchCorrections, fetchTrackRecord } from '@/lib/trust-ledgers';
import type { Metadata } from 'next';
import type { MarketData } from '@/types/supabase';
import { buildHomeMarketMetrics, MARKET_LATEST_COLUMNS, MARKET_LATEST_ROWS } from '@/lib/market-latest';

/**
 * ISR: public, tier-agnostic data (collectors run every 30 min – 6 h, briefs daily). The HTML is
 * served with `s-maxage=300` (Next also appends stale-while-revalidate, which Cloudflare ignores
 * when s-maxage is present) so the edge cache answers repeat visits without running the Worker (Cloudflare 1102 under load). Nothing here depends on the visitor.
 */
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: 'MENA Intel Desk — Live Conflict & Corridor Risk Dashboard',
  description:
    "Today's sourced brief, War Posture by country, market-anchored scenario probabilities and shipping-sensitive market indicators for the US–Iran conflict, the Red Sea and the Horn of Africa.",
  path: '/',
});

/**
 * A read that takes longer than `ms` resolves to `fallback`, so one hung Supabase call cannot hold the
 * uncached home render (the section then shows its "not available just now" state).
 */
const SECTION_TIMEOUT_MS = 3000;
function withTimeout<T>(p: Promise<T>, fallback: T, label: string, ms = SECTION_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.error(`[home] ${label} timed out after ${ms} ms`);
      resolve(fallback);
    }, ms);
  });
  return Promise.race([p.catch(() => fallback), t]).finally(() => clearTimeout(timer));
}

/** War Posture board (expressed side only, every tier) + outlet names; null when it cannot be read. */
async function readPosture(supabase: ReturnType<typeof createPublicClient>): Promise<{ board: PostureBoard | null; labels: SourceLabels }> {
  // Each read has its own timeout: a hung outlet lookup loses only the outlet names, never the board.
  const board = await withTimeout<PostureBoard | null>(
    getPostureBoard(supabase, { access: { latent: false, gap: false } }),
    null,
    'posture board',
  );
  if (!board) return { board: null, labels: {} };
  const labels = await withTimeout<SourceLabels>(postureSourceLabels(board), {}, 'posture outlet labels');
  return { board, labels };
}

/** Trust strip meta: newest published correction and the forecast ledger's counts (undefined = unreadable). */
async function readTrust(): Promise<HomeTrust> {
  // In parallel, each with its own timeout: a hung corrections read never blanks the track record (or back).
  const unavailable = { status: 'unavailable' as const, reason: 'error' as const };
  const [corr, track] = await Promise.all([
    withTimeout<Awaited<ReturnType<typeof fetchCorrections>>>(fetchCorrections(1), unavailable, 'corrections'),
    withTimeout<Awaited<ReturnType<typeof fetchTrackRecord>>>(fetchTrackRecord(), unavailable, 'track record'),
  ]);
  const trust: HomeTrust = {};
  if (corr.status === 'ok') trust.latestCorrection = corr.rows[0]?.created_at ?? null;
  if (track.status === 'ok') {
    const { forecasts, resolutions, chain } = track.rows;
    const questions = new Set(forecasts.map((f) => f.question_id));
    const eff = effectiveResolutions(resolutions);
    const closed = [...questions].filter((q) => eff.has(q));
    trust.forecasts = {
      open: questions.size - closed.length,
      resolved: closed.filter((q) => eff.get(q)!.status === 'resolved').length,
      chainVerified: chain === null ? true : chain === 'unknown' ? null : false,
    };
  }
  return trust;
}

export default async function Page() {
  const supabase = createPublicClient();
  const conflictDay = await getConflictDay();

  // Parallel server-side fetches — data baked into HTML, no loading states
  const [briefingRes, overnightRes, marketRes, recentTypesRes, registry, posture, trust] = await Promise.all([
    // Latest general briefing by daily_briefings' OWN max day (not the nai_scores day, not
    // "exactly today"). Its day is passed through and labelled against the calendar day.
    supabase
      .from('daily_briefings')
      .select('lead, conflict_day')
      .eq('report_type', 'general')
      .order('conflict_day', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // "Since yesterday": the latest overnight brief by its own max day; the home shows its first ranked changes.
    supabase
      .from('daily_briefings')
      .select('conflict_day, generated_at, sections')
      .eq('report_type', 'overnight')
      .order('conflict_day', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Canonical newest row per indicator (lib/market-latest.ts) — the same read and rule as the War Room.
    supabase
      .from('market_data')
      .select(MARKET_LATEST_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(MARKET_LATEST_ROWS),
    // Which brief types exist on the latest days (the "Also today" links name only what was published).
    supabase.from('daily_briefings').select('conflict_day, report_type').order('conflict_day', { ascending: false }).limit(40),
    // The scenario row reads the SAME registry view /scenarios renders (never the legacy table).
    getScenarioRegistryView(supabase),
    readPosture(supabase),
    readTrust(),
  ]);
  if (registry.error) console.error('[home] scenario registry read failed:', registry.error);
  const scenarioRow = buildScenarioRow(registry);

  const briefingRow = briefingRes.data as { lead?: string | null; conflict_day?: number | null } | null;
  const brief = briefingRow?.conflict_day != null ? { day: briefingRow.conflict_day, lead: briefingRow.lead ?? null } : null;
  const briefTypes = ((recentTypesRes.data ?? []) as { conflict_day: number; report_type: string }[])
    .filter((r) => r.conflict_day === brief?.day)
    .map((r) => r.report_type);
  const ov = overnightRes.data as { conflict_day?: number | null; generated_at?: string | null; sections?: unknown } | null;
  // Overnight sources get the brief reader's party labels: the outlet registry first, then the stored flag.
  const rawItems = ov?.conflict_day != null ? overnightItems(ov.sections, 3) : [];
  const outlets = await withTimeout<OutletRegistry>(
    fetchOutletRegistry(rawItems.flatMap((it) => it.sources)).catch(() => new Map()),
    new Map(),
    'outlet registry',
  );
  const changesAt = changesSectionIndex(ov?.sections);
  const overnight =
    ov?.conflict_day != null
      ? {
          day: ov.conflict_day,
          generatedAt: ov.generated_at ?? null,
          items: shownOvernightItems(rawItems, outlets),
          anchor: briefSectionAnchor(ov.sections, changesAt),
        }
      : null;

  // Market tiles: newest row per indicator by created_at, one rounding rule, each with its own timestamp.
  const { metrics: marketMetrics, latestDay } = buildHomeMarketMetrics((marketRes.data ?? []) as MarketData[]);

  // Corridors: ONE view per render, shared by the strip (text), the headline and the relief (lane colours),
  // so the relief can never show a status the strip does not print (stale / withheld → UNKNOWN in both).
  const corridorsView = getCorridors(new Date());

  const serverData: HomeServerData = {
    conflictDay,
    corridorsView,
    brief,
    briefTypes,
    overnight,
    posture: homePosture(posture.board),
    postureConflicts: posture.board?.conflicts ?? [],
    postureLabels: posture.labels,
    marketMetrics,
    marketDay: latestDay ?? null,
    trust,
  };

  return (
    <HomeDashboard
      serverData={serverData}
      corridors={<CorridorStrip view={corridorsView} headingId="home-corridor-strip-h" compact headless />}
      reliefLanes={reliefLaneStyles(corridorsView)}
      scenarioRow={<ScenarioRow row={scenarioRow} currentDay={conflictDay} />}
    />
  );
}
