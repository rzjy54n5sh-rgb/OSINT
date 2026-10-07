'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CountryReportClient, type CountryReportView } from './CountryReportClient';
import { useViewerTier } from '@/hooks/useViewerTier';
import { tierHasFeature, type TierFlags } from '@/lib/tier';
import type { NaiV2View } from '@/lib/nai-v2';
import type { CountryNarrative } from '@/lib/country-narrative';

/**
 * The page HTML is cached and rendered for an anonymous visitor (summary only, no narrative).
 * When the signed-in visitor's tier unlocks the narrative, it is fetched from
 * /api/viewer/country/[code], which re-checks the session server-side. Anonymous visitors make
 * no extra request.
 */
export function CountryReportGate({
  report,
  posture,
  featureKey,
  requiredTier,
  tierFlags,
  anonHasAccess,
  conflictDayBadge,
}: {
  report: CountryReportView;
  posture: NaiV2View | null;
  featureKey: string;
  requiredTier: 'informed' | 'professional';
  tierFlags: TierFlags;
  anonHasAccess: boolean;
  conflictDayBadge?: ReactNode;
}) {
  const tier = useViewerTier();
  const [unlocked, setUnlocked] = useState<{ hasAccess: boolean; narrative: CountryNarrative | null } | null>(null);
  const mayUnlock = !anonHasAccess && tier != null && tierHasFeature(tier, featureKey, tierFlags);

  useEffect(() => {
    if (!mayUnlock) return;
    let cancelled = false;
    fetch(`/api/viewer/country/${encodeURIComponent(report.country_code)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ hasAccess?: boolean; narrative?: CountryNarrative | null } | null>) : null))
      .then((j: { hasAccess?: boolean; narrative?: CountryNarrative | null } | null) => {
        if (!cancelled && j?.hasAccess) setUnlocked({ hasAccess: true, narrative: j.narrative ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mayUnlock, report.country_code]);

  const hasAccess = unlocked?.hasAccess ?? anonHasAccess;
  return (
    <CountryReportClient
      report={unlocked ? { ...report, narrative: unlocked.narrative } : report}
      posture={posture}
      hasAccess={hasAccess}
      requiredTier={requiredTier}
      summaryOnly={!hasAccess}
      conflictDayBadge={conflictDayBadge}
    />
  );
}
