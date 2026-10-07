'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CountryReportClient, type CountryReportView } from './CountryReportClient';
import { useViewerTier } from '@/hooks/useViewerTier';
import { tierHasFeature, type TierFlags } from '@/lib/tier';
import type { NaiV2View } from '@/lib/nai-v2';
import type { CountryNarrative } from '@/lib/country-narrative';

type Unlocked = {
  hasAccess: boolean;
  narrative: CountryNarrative | null;
  posture: NaiV2View | null;
};

/**
 * The page HTML is cached and rendered for an anonymous visitor: summary only, no narrative, and
 * the War Posture row without the latent band / gap / category (informed-tier features). When the
 * signed-in visitor's tier unlocks any of these, they are fetched from
 * /api/viewer/country/[code], which re-checks the session server-side. Anonymous visitors make no
 * extra request.
 */
export function CountryReportGate({
  report,
  posture,
  featureKey,
  requiredTier,
  tierFlags,
  anonHasAccess,
  anonPostureAccess,
  conflictDayBadge,
}: {
  report: CountryReportView;
  posture: NaiV2View | null;
  featureKey: string;
  requiredTier: 'informed' | 'professional';
  tierFlags: TierFlags;
  anonHasAccess: boolean;
  anonPostureAccess: { latent: boolean; gap: boolean };
  conflictDayBadge?: ReactNode;
}) {
  const tier = useViewerTier();
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);
  const t = tier ?? null;
  const unlocksNarrative = !anonHasAccess && tierHasFeature(t, featureKey, tierFlags);
  const unlocksPosture =
    (!anonPostureAccess.latent && tierHasFeature(t, 'nai_latent_score', tierFlags)) ||
    (!anonPostureAccess.gap && tierHasFeature(t, 'nai_gap_analysis', tierFlags));
  const mayUnlock = tier != null && (unlocksNarrative || unlocksPosture);

  useEffect(() => {
    if (!mayUnlock) return;
    let cancelled = false;
    fetch(`/api/viewer/country/${encodeURIComponent(report.country_code)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Partial<Unlocked> | null>) : null))
      .then((j) => {
        if (cancelled || !j) return;
        setUnlocked({ hasAccess: !!j.hasAccess, narrative: j.narrative ?? null, posture: j.posture ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mayUnlock, report.country_code]);

  const hasAccess = unlocked?.hasAccess || anonHasAccess;
  return (
    <CountryReportClient
      report={unlocked?.hasAccess ? { ...report, narrative: unlocked.narrative } : report}
      posture={unlocked?.posture ?? posture}
      hasAccess={hasAccess}
      requiredTier={requiredTier}
      summaryOnly={!hasAccess}
      conflictDayBadge={conflictDayBadge}
    />
  );
}
