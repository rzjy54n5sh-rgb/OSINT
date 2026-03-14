'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { PageBriefing } from '@/components/PageBriefing';
import { createClient } from '@/lib/supabase/client';
import type { DisinfoClaim } from '@/types/supabase';

const VERDICT_DEFS: Record<string, string> = {
  FALSE: 'Claim has been definitively debunked by primary sources or direct contradiction',
  UNVERIFIED: 'Claim cannot be confirmed or denied with available open-source evidence',
  TRUE: 'Claim corroborated by multiple independent primary sources',
  MISLEADING: 'Claim contains factual elements but is presented in a deceptive context',
};

export default function DisinfoPage() {
  const [claims, setClaims] = useState<DisinfoClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('disinfo_claims')
      .select('*')
      .order('published_at', { ascending: false })
      .then(({ data, error: e }) => {
        setLoading(false);
        if (e) setError(e);
        else setClaims((data as DisinfoClaim[]) ?? []);
      });
  }, []);

  const verdictClass = (v: string | null) => {
    const vv = (v ?? '').toUpperCase();
    if (vv === 'TRUE' || vv === 'CONFIRMED') return 'sentiment-badge positive';
    if (vv === 'FALSE' || vv === 'DEBUNKED') return 'sentiment-badge negative';
    if (vv === 'MISLEADING') return 'sentiment-badge neutral';
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
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        CLAIMS — VERDICT — SPREAD ESTIMATE
      </p>
      {loading && (
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
        </p>
      )}
      {error && (
        <div className="font-mono text-xs py-8 border px-4" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>
          [DATA UNAVAILABLE]
        </div>
      )}
      {!loading && !error && claims.length === 0 && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
      {!loading && !error && claims.length > 0 && (
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
                  {c.claim_text ?? '—'}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <GlossaryTooltip
                    term={c.verdict ?? 'UNVERIFIED'}
                    definition={VERDICT_DEFS[(c.verdict ?? 'UNVERIFIED').toUpperCase()] ?? VERDICT_DEFS.UNVERIFIED}
                  >
                    <span className={`cursor-help ${verdictClass(c.verdict)}`} translate="no">{c.verdict ?? 'UNVERIFIED'}</span>
                  </GlossaryTooltip>
                  {c.spread_estimate != null && (
                    <span
                      className="font-mono text-xs px-2 py-0.5 border rounded-sm"
                      style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                    >
                      📡 {typeof c.spread_estimate === 'string' ? c.spread_estimate : String(c.spread_estimate)}
                    </span>
                  )}
                </div>
                <div className="mt-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {c.source_url && (
                    <a href={c.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>
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
        </div>
      )}
    </div>
  );
}
