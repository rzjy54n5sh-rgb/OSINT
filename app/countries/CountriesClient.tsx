'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { CountryFlag } from '@/components/CountryFlag';
import { PageBriefing } from '@/components/PageBriefing';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { NaiV2CategoryBadge } from '@/components/nai/NaiV2CategoryBadge';
import { NaiV2Evidence } from '@/components/nai/NaiV2Evidence';
import { NaiPostureLabel } from '@/components/nai/NaiPostureLabel';
import { NAI_V2_EMPTY_TEXT, NAI_V2_SCALE_TEXT, formatBand, type NaiV2View } from '@/lib/nai-v2';
import { NO_SOURCED_DATA_TEXT, TRACKED_COUNTRY_CODES } from '@/lib/countries';
import { useViewerTier } from '@/hooks/useViewerTier';
import { tierHasFeature, type TierFlags } from '@/lib/tier';

interface CountriesClientProps {
  initialScores: NaiV2View[];
  /** MAX(conflict_day) of nai_scores_v2 — the day the scores below belong to. */
  naiDay: number | null;
  /** Calendar day (DAY LOCK). */
  currentDay: number;
  /** tier_features flags (public config) — decide whether the visitor's tier unlocks more. */
  tierFlags: TierFlags;
  /** Access the server-rendered (shared, edge-cached) scores were built with: anonymous. */
  anonAccess: { latent: boolean; gap: boolean };
}

/**
 * Ruling 2026-10-07 (Omar): the latent band, gap and category are informed-tier features on the
 * list too. The page HTML is cached and built at ANONYMOUS access; a signed-in visitor whose tier
 * unlocks them gets their rows from /api/viewer/nai (session re-checked server-side, private)
 * after hydration — the same pattern as /nai and /countries/[slug].
 */
export default function CountriesClient({ initialScores, naiDay, currentDay, tierFlags, anonAccess }: CountriesClientProps) {
  const tier = useViewerTier();
  const [scores, setScores] = useState<NaiV2View[]>(initialScores);
  const t = tier ?? null;
  const unlocksMore =
    tier != null &&
    naiDay != null &&
    ((!anonAccess.latent && tierHasFeature(t, 'nai_latent_score', tierFlags)) ||
      (!anonAccess.gap && tierHasFeature(t, 'nai_gap_analysis', tierFlags)));

  useEffect(() => {
    if (!unlocksMore) return;
    let cancelled = false;
    fetch(`/api/viewer/nai?day=${naiDay}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ rows?: NaiV2View[] } | null>) : null))
      .then((j) => {
        if (!cancelled && j && Array.isArray(j.rows) && j.rows.length > 0) setScores(j.rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [unlocksMore, naiDay]);
  // Tracked countries (25) the War Posture series has no row for yet: listed, never scored.
  const unscored = scores.length === 0 ? [] : TRACKED_COUNTRY_CODES.filter((c) => !scores.some((s) => s.country_code === c));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="COUNTRY INTELLIGENCE REPORTS"
        description="War Posture for the 25 tracked countries (the original 20 plus the Horn of Africa & Red Sea theatre: Ethiopia, Eritrea, Sudan, Somalia, Djibouti). Each card shows the official (expressed) score on one party-neutral scale — 0 = immediate ceasefire, 100 = continue or escalate — the societal (latent) band where admissible evidence exists, the category, and the cited sources. Click a country for its daily report: assessment, key risks, stabilizers, data-integrity note and sources."
        note="Open-source data only. Scores and report text are written by the daily build from pages that were opened and checked; a claim that could not be confirmed is removed. A tracked country with no War Posture row for the day shows 'No sourced data' rather than a guessed score."
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        COUNTRY INTELLIGENCE
      </h1>
      <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
        CONFLICT DAY {currentDay} — WAR POSTURE BY COUNTRY (AS OF DAY {naiDay ?? '—'})
      </p>
      <DataAsOf section="WAR POSTURE" latestDay={naiDay} currentDay={currentDay} className="mb-8" />
      {scores.length === 0 && (
        <p className="font-mono text-xs border px-3 py-2" style={{ color: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' }} data-testid="nai-v2-empty">
          {NAI_V2_EMPTY_TEXT}
        </p>
      )}
      {scores.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scores.map((s, i) => (
            <motion.div
              key={`${s.country_code}-${s.conflict_day}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <OsintCard className="block hover:border-border-bright">
                <Link prefetch={false} href={`/countries/${s.country_code.toLowerCase()}`} className="block">
                  <CountryFlag code={s.country_code} />
                  <div className="mt-2">
                    <NaiV2CategoryBadge category={s.category} locked={s.categoryLocked} latentEvidence={s.latentEvidence} expressed={s.expressed_score} />
                  </div>
                  <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }} translate="no">
                    <GlossaryTooltip
                      term="EXPRESSED"
                      definition={`Official narrative's position on continuing hostilities (${NAI_V2_SCALE_TEXT}).`}
                    >
                      <span>EXPRESSED {s.expressed_score ?? '—'}</span>
                    </GlossaryTooltip>
                    {' | '}
                    <GlossaryTooltip
                      term="LATENT"
                      definition="Population and non-government elites on the same scale, stored as a low–high band. Empty when there is no evidence."
                    >
                      <span>LATENT {s.latentLocked ? 'Informed tier' : formatBand(s.latent_low, s.latent_high)}</span>
                    </GlossaryTooltip>
                  </p>
                  <div className="mt-1">
                    <NaiPostureLabel expressed={s.expressed_score} />
                  </div>
                </Link>
                <div className="mt-2">
                  <NaiV2Evidence row={s} compact />
                </div>
              </OsintCard>
            </motion.div>
          ))}
          {unscored.map((code) => (
            <OsintCard key={`nodata-${code}`} className="block hover:border-border-bright">
              <Link prefetch={false} href={`/countries/${code.toLowerCase()}`} className="block" data-testid={`country-nodata-${code}`}>
                <CountryFlag code={code} />
                <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  {NO_SOURCED_DATA_TEXT}
                </p>
              </Link>
            </OsintCard>
          ))}
        </div>
      )}
    </div>
  );
}
