'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export function TimelineClient() {
  const [days, setDays] = useState<{ conflict_day: number; [key: string]: unknown }[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const run = async () => {
      try {
        const { data } = await supabase
          .from('nai_scores')
          .select('conflict_day, expressed_score, latent_score')
          .order('conflict_day', { ascending: true })
          .limit(60);
        const byDay = (data ?? []).reduce<Record<number, { conflict_day: number; [key: string]: unknown }>>((acc, row) => {
          const d = row.conflict_day as number;
          if (!acc[d]) acc[d] = { conflict_day: d };
          acc[d].expressed_score = row.expressed_score;
          acc[d].latent_score = row.latent_score;
          return acc;
        }, {});
        setDays(Object.values(byDay).sort((a, b) => a.conflict_day - b.conflict_day));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  if (loading) {
    return (
      <div className="mt-6 h-48 animate-pulse rounded-lg border border-[var(--border)] bg-bg-card" />
    );
  }

  if (days.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-[var(--border)] bg-bg-card p-12 text-center">
        <p className="font-mono text-sm uppercase tracking-wider text-text-muted">
          Awaiting data feed...
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-[var(--border)] bg-bg-card">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto pb-4 pt-4"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {days.map((d) => (
          <div
            key={d.conflict_day}
            className="flex min-w-[120px] flex-shrink-0 flex-col items-center border-r border-[var(--border)] px-4 py-2 last:border-r-0"
            style={{ scrollSnapAlign: 'start' }}
          >
            <span className="osint-label text-text-muted">DAY {d.conflict_day}</span>
            <span className="mt-1 font-mono text-xs text-accent-gold">
              {d.expressed_score != null ? Number(d.expressed_score).toFixed(1) : '—'}
            </span>
            <span className="font-mono text-[10px] text-text-muted">
              {d.latent_score != null ? Number(d.latent_score).toFixed(1) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
