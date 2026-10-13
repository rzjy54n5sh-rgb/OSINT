'use client';

import Link from 'next/link';
import { FOUNDING_ACCESS_HREF, FOUNDING_ACCESS_LABEL, FOUNDING_ACCESS_SHORT } from '@/lib/access-cta';

type PaywallOverlayProps = {
  /** Tier the server gates on (kept for data attributes; not shown — no plan is on sale during launch). */
  requiredTier: 'informed' | 'professional';
  featureName: string;
  /** One line on what is behind the lock (full variant). */
  description?: string;
  compact?: boolean;
};

/**
 * Lock card. During the launch period /pricing sells no plan, so every lock points to the one call to
 * action it offers — founding access — with the same wording (lib/access-cta.ts).
 *
 * The full variant is an in-flow card (not an absolute overlay): it can never spill over the panels
 * around it (UX audit 2026-10-13: the old overlay covered the War Posture panel on /countries/ir and /eg).
 */
export function PaywallOverlay({ requiredTier, featureName, description, compact = false }: PaywallOverlayProps) {
  if (compact) {
    return (
      <span
        className="inline-flex flex-wrap items-center gap-2 font-mono text-xs"
        style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono), "IBM Plex Mono", monospace' }}
        data-locked-tier={requiredTier}
        data-testid="paywall-compact"
      >
        <span style={{ color: '#E8C547' }} aria-hidden="true">◆</span>
        <span>Locked during launch —</span>
        <Link
          prefetch={false}
          href={FOUNDING_ACCESS_HREF}
          className="border px-2 py-1 rounded-sm hover:opacity-90 transition-opacity inline-flex items-center min-h-[24px]"
          style={{ borderColor: '#E8C547', color: '#E8C547' }}
        >
          {FOUNDING_ACCESS_SHORT} →<span className="sr-only"> (unlocks: {featureName})</span>
        </Link>
      </span>
    );
  }

  return (
    <div
      className="osint-card p-5 font-mono"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: '#E2E8F0' }}
      data-locked-tier={requiredTier}
      data-testid="paywall-card"
      role="group"
      aria-label={`${featureName}: locked`}
    >
      <p className="text-xs mb-2 uppercase" style={{ color: '#E8C547', letterSpacing: '1.5px' }}>
        <span aria-hidden="true">◆ </span>
        {featureName} · locked during launch
      </p>
      {description && (
        <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      )}
      <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        There is nothing to buy yet. Join founding access and we will email you when access opens.
      </p>
      <Link
        prefetch={false}
        href={FOUNDING_ACCESS_HREF}
        className="inline-flex items-center min-h-[44px] border px-4 py-2 text-sm rounded-sm hover:opacity-90 transition-opacity"
        style={{ borderColor: '#E8C547', color: '#E8C547' }}
      >
        {FOUNDING_ACCESS_LABEL} →
      </Link>
    </div>
  );
}
