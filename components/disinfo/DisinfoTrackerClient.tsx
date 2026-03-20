'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { PageBriefing } from '@/components/PageBriefing';
import { DisinfoDisputeForm } from './DisinfoDisputeForm';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';

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
  status?: string;
  verdict?: string;
  source?: string;
  source_url?: string;
  debunk_url?: string;
  /** Alias for spread_estimate from server map */
  spread?: string | number | null;
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
  /** Badge styles: DEBUNKED / CONTESTED / CONFIRMED / UNVERIFIED (+ legacy DB verdicts). */
  const verdictBadgeClass = (v: string | null | undefined) => {
    const vv = (v ?? 'UNVERIFIED').toUpperCase();
    if (vv === 'DEBUNKED' || vv === 'FALSE')
      return 'inline-block rounded-sm border px-2 py-0.5 font-mono text-xs bg-red-900/30 text-red-400 border-red-700';
    if (vv === 'CONTESTED' || vv === 'MISLEADING')
      return 'inline-block rounded-sm border px-2 py-0.5 font-mono text-xs bg-amber-900/30 text-amber-400 border-amber-700';
    if (vv === 'CONFIRMED' || vv === 'TRUE')
      return 'inline-block rounded-sm border px-2 py-0.5 font-mono text-xs bg-green-900/30 text-green-400 border-green-700';
    return 'inline-block rounded-sm border px-2 py-0.5 font-mono text-xs bg-white/5 text-white/40 border-white/20';
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
                    term={c.verdict ?? c.status ?? 'UNVERIFIED'}
                    definition={
                      VERDICT_DEFS[(c.verdict ?? c.status ?? 'UNVERIFIED').toUpperCase()] ?? VERDICT_DEFS.UNVERIFIED
                    }
                  >
                    <span
                      className={`cursor-help ${verdictBadgeClass(c.verdict ?? c.status ?? null)}`}
                      translate="no"
                    >
                      {c.verdict ?? c.status ?? 'UNVERIFIED'}
                    </span>
                  </GlossaryTooltip>
                  {(c.spread ?? c.spread_estimate) != null && (
                    <span
                      className="font-mono text-xs px-2 py-0.5 border rounded-sm"
                      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                      translate="no"
                    >
                      📡{' '}
                      {typeof (c.spread ?? c.spread_estimate) === 'string'
                        ? (c.spread ?? c.spread_estimate)
                        : String(c.spread ?? c.spread_estimate)}
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
          {!hasFullAccess && total > showing && (
            <div
              className="font-mono text-sm py-4 px-4 rounded-sm border flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
              style={{
                background: 'rgba(232, 197, 71, 0.05)',
                borderColor: '#E8C547',
                color: '#E2E8F0',
              }}
            >
              <span translate="no">
                <span style={{ color: '#E8C547' }}>◆</span> {total - showing} more claims locked
              </span>
              <div className="flex flex-col gap-2 sm:items-end">
                <p className="font-mono text-xs text-white/70">Upgrade to Informed for full access</p>
                <PaywallOverlay requiredTier="informed" featureName="Disinformation tracker" compact />
              </div>
            </div>
          )}
        </div>
      )}

      <DisinfoDisputeForm />
    </div>
  );
}
