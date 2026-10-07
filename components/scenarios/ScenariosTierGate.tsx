'use client';

import type { ComponentProps } from 'react';
import { ScenariosClient } from '@/components/scenarios/ScenariosClient';
import { useViewerTier } from '@/hooks/useViewerTier';
import { tierHasFeature, type TierFlags } from '@/lib/tier';

/**
 * /scenarios is cached and rendered for an anonymous visitor. `scenario_detail` only switches
 * what the method panel DISPLAYS (the run inputs are part of the public registry payload either
 * way), so it is resolved here from the visitor's tier after hydration.
 */
export function ScenariosTierGate({
  tierFlags,
  ...props
}: Omit<ComponentProps<typeof ScenariosClient>, 'hasDetailAccess'> & { tierFlags: TierFlags }) {
  const tier = useViewerTier();
  const hasDetailAccess = tierHasFeature(tier ?? null, 'scenario_detail', tierFlags);
  return <ScenariosClient {...props} hasDetailAccess={hasDetailAccess} />;
}
