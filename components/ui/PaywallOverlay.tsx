'use client';

import Link from 'next/link';

type PaywallOverlayProps = {
  requiredTier: 'informed' | 'professional';
  featureName: string;
  compact?: boolean;
};

const tierLabel = (t: 'informed' | 'professional') =>
  t === 'professional' ? 'Professional' : 'Informed';

export function PaywallOverlay({
  requiredTier,
  featureName,
  compact = false,
}: PaywallOverlayProps) {
  const tierName = tierLabel(requiredTier);

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-2 font-mono text-xs"
        style={{ color: '#E2E8F0', fontFamily: 'var(--font-mono), "IBM Plex Mono", monospace' }}
      >
        <span style={{ color: '#E8C547' }}>◆</span>
        <span>{tierName} plan required — </span>
        <Link
          href="/pricing"
          className="border px-2 py-0.5 rounded-sm hover:opacity-90 transition-opacity"
          style={{ borderColor: '#E8C547', color: '#E8C547' }}
        >
          Upgrade →
        </Link>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center rounded-sm z-10"
      style={{
        background: 'rgba(7, 10, 15, 0.9)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="osint-card p-6 max-w-sm text-center font-mono"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
          color: '#E2E8F0',
        }}
      >
        <p className="text-lg mb-1" style={{ color: '#E8C547' }}>
          ◆
        </p>
        <p className="text-sm mb-2">
          This content requires the <strong style={{ color: '#E8C547' }}>{tierName}</strong> plan
        </p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Feature: {featureName}
        </p>
        <Link
          href="/pricing"
          className="inline-block border px-4 py-2 text-sm rounded-sm hover:opacity-90 transition-opacity"
          style={{ borderColor: '#E8C547', color: '#E8C547' }}
        >
          View Plans →
        </Link>
      </div>
    </div>
  );
}
