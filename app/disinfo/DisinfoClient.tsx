'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { DisinfoClaim } from '@/types/database';

const VERDICT_STYLES: Record<DisinfoClaim['verdict'], string> = {
  TRUE: 'bg-accent-green/20 text-accent-green border-accent-green/40',
  FALSE: 'bg-accent-red/20 text-accent-red border-accent-red/40',
  MISLEADING: 'bg-accent-orange/20 text-accent-orange border-accent-orange/40',
  UNVERIFIED: 'bg-text-muted/20 text-text-muted border-[var(--border)]',
};

export function DisinfoClient() {
  const [claims, setClaims] = useState<DisinfoClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const run = async () => {
      try {
        const { data } = await supabase
          .from('disinfo_claims')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(50);
        setClaims((data ?? []) as DisinfoClaim[]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  if (loading) {
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="osint-card h-40 animate-pulse rounded-lg bg-bg-card" />
        ))}
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-[var(--border)] bg-bg-card p-12 text-center">
        <p className="font-mono text-sm uppercase tracking-wider text-text-muted">
          Awaiting data feed...
        </p>
        <p className="mt-2 text-sm text-text-secondary">Claims and verdicts will appear here.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {claims.map((c) => (
        <article
          key={c.id}
          className="osint-card rounded-lg bg-bg-card p-4"
        >
          <p className="text-sm text-text-primary">{c.claim_text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${VERDICT_STYLES[c.verdict]}`}
            >
              {c.verdict}
            </span>
            {c.spread_estimate && (
              <span className="osint-label text-text-muted">{c.spread_estimate}</span>
            )}
          </div>
          <div className="mt-2 flex gap-2 font-mono text-[10px]">
            {c.source_url && (
              <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="text-accent-gold hover:underline">
                Source
              </a>
            )}
            {c.debunk_url && (
              <a href={c.debunk_url} target="_blank" rel="noopener noreferrer" className="text-accent-teal hover:underline">
                Debunk
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
