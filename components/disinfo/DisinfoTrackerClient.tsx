'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { PageBriefing } from '@/components/PageBriefing';
import { DisinfoDisputeForm } from './DisinfoDisputeForm';

const VERDICT_DEFS: Record<string, string> = {
  FALSE: 'Claim has been definitively debunked by primary sources or direct contradiction',
  DEBUNKED: 'Claim has been definitively debunked by primary sources or direct contradiction',
  UNVERIFIED: 'Claim cannot be confirmed or denied with available open-source evidence',
  TRUE: 'Claim corroborated by multiple independent primary sources',
  CONFIRMED: 'Claim corroborated by multiple independent primary sources',
  MISLEADING: 'Claim contains factual elements but is presented in a deceptive context',
  CONTESTED: 'Assessment is disputed; evidence is mixed or interpretation differs across sources',
};

type ClaimRow = {
  id: string;
  conflict_day?: number;
  claim?: string;
  claim_text?: string;
  verdict?: string;
  source?: string;
  source_url?: string;
  debunk_url?: string;
  spread_estimate?: string | number | null;
  created_at?: string;
};

type DisinfoTrackerClientProps = {
  claims: ClaimRow[];
  hasFullAccess: boolean;
  total: number;
  showing: number;
  conflictDayBadge?: ReactNode;
};

export function DisinfoTrackerClient({
  claims,
  hasFullAccess,
  total,
  showing,
  conflictDayBadge,
}: DisinfoTrackerClientProps) {
  const verdictClass = (v: string | null) => {
    const vv = (v ?? '').toUpperCase();
    if (vv === 'TRUE' || vv === 'CONFIRMED') return 'sentiment-badge positive';
    if (vv === 'FALSE' || vv === 'DEBUNKED') return 'sentiment-badge negative';
    if (vv === 'MISLEADING' || vv === 'CONTESTED') return 'sentiment-badge neutral';
    return 'sentiment-badge neutral';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageBriefing
        title="DISINFORMATION TRACKER"
        description="Claims flagged here were already circulating publicly before being logged. We do not originate disinformation claims. Verdicts are assigned based on cross-referencing with primary sources, fact-checking organizations, and satellite or documentary evidence where available."
        note="UNVERIFIED does not mean FALSE — it means the available open-source evidence is insufficient to confirm or deny. Every claim links to its original source and, where available, a debunking source."
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        DISINFORMATION TRACKER
      </h1>
      {conflictDayBadge}
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        CLAIMS — VERDICT — SPREAD ESTIMATE
        {!hasFullAccess && total > 0 && (
          <span className="block mt-1" translate="no">
            Showing {showing} of {total}
          </span>
        )}
      </p>
      {claims.length === 0 && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
      {claims.length > 0 && (
        <div className="space-y-4">
          {claims.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <OsintCard>
                <p className="font-body text-sm" style={{ color: 'var(--text-primary)' }}>
                  {c.claim ?? c.claim_text ?? '—'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <GlossaryTooltip
                    term={c.verdict ?? 'UNVERIFIED'}
                    definition={VERDICT_DEFS[(c.verdict ?? 'UNVERIFIED').toUpperCase()] ?? VERDICT_DEFS.UNVERIFIED}
                  >
                    <span className={`cursor-help ${verdictClass(c.verdict ?? null)}`} translate="no">{c.verdict ?? 'UNVERIFIED'}</span>
                  </GlossaryTooltip>
                  {c.spread_estimate != null && (
                    <span
                      className="font-mono text-xs px-2 py-0.5 border rounded-sm"
                      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                      translate="no"
                    >
                      📡 {typeof c.spread_estimate === 'string' ? c.spread_estimate : String(c.spread_estimate)}
                    </span>
                  )}
                </div>
                <div className="mt-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {(c.source ?? c.source_url) && (
                    <a href={c.source ?? c.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>
                      SOURCE
                    </a>
                  )}
                  {c.debunk_url && (
                    <a href={c.debunk_url} target="_blank" rel="noopener noreferrer" className="ml-3" style={{ color: 'var(--accent-green)' }}>
                      DEBUNK
                    </a>
                  )}
                </div>
              </OsintCard>
            </motion.div>
          ))}
          {!hasFullAccess && total > 5 && (
            <div
              className="font-mono text-sm py-4 px-4 rounded-sm border flex flex-wrap items-center justify-between gap-2"
              style={{
                background: 'rgba(232, 197, 71, 0.05)',
                borderColor: '#E8C547',
                color: '#E2E8F0',
              }}
            >
              <span>
                <span style={{ color: '#E8C547' }}>◆</span>{' '}
                <span translate="no">{total - showing}</span> more entries — Informed plan required
              </span>
              <Link
                href="/pricing"
                className="border px-3 py-1.5 rounded-sm hover:opacity-90 transition-opacity"
                style={{ borderColor: '#E8C547', color: '#E8C547' }}
              >
                Upgrade to see all →
              </Link>
            </div>
          )}
        </div>
      )}

      <DisinfoDisputeForm />
    </div>
  );
}
