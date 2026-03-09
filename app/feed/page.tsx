'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { useArticles } from '@/hooks/useArticles';
import { SourceBadge } from '@/components/SourceBadge';
import { SentimentBar } from '@/components/SentimentBar';

type SentimentFilter = string | null;
type RegionFilter = string | null;

export default function FeedPage() {
  const [region, setRegion] = useState<RegionFilter>(null);
  const [sentiment, setSentiment] = useState<SentimentFilter>(null);
  const [conflictDay, setConflictDay] = useState<number | null>(null);
  const { articles, loading, error } = useArticles(
    { region, sentiment, conflict_day: conflictDay },
    50
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        LIVE INTELLIGENCE FEED
      </h1>
      <p className="font-mono text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        CONFLICT DAY 10 — FILTER BY REGION, SENTIMENT, SOURCE
      </p>

      <div className="flex flex-wrap gap-3 mb-6 font-mono text-xs">
        <select
          value={region ?? ''}
          onChange={(e) => setRegion(e.target.value || null)}
          className="bg-bg-card border px-3 py-1.5 rounded-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="">ALL REGIONS</option>
          <option value="MENA">MENA</option>
          <option value="GCC">GCC</option>
          <option value="Levant">Levant</option>
        </select>
        <select
          value={sentiment ?? ''}
          onChange={(e) => setSentiment(e.target.value || null)}
          className="bg-bg-card border px-3 py-1.5 rounded-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="">ALL SENTIMENT</option>
          <option value="positive">POSITIVE</option>
          <option value="negative">NEGATIVE</option>
          <option value="neutral">NEUTRAL</option>
        </select>
        <select
          value={conflictDay ?? ''}
          onChange={(e) => setConflictDay(e.target.value ? Number(e.target.value) : null)}
          className="bg-bg-card border px-3 py-1.5 rounded-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          <option value="">ALL DAYS</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
            <option key={d} value={d}>DAY {d}</option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          FETCHING INTEL<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
        </p>
      )}
      {error && (
        <div className="font-mono text-xs py-8 border px-4" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>
          [DATA UNAVAILABLE]
        </div>
      )}
      {!loading && !error && articles.length === 0 && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
      {!loading && !error && articles.length > 0 && (
        <ul className="space-y-4">
          {articles.map((a, i) => (
            <motion.li
              key={a.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <OsintCard>
                <SourceBadge
                  name={a.source_name}
                  logoUrl={a.source_logo_url}
                  sourceType={a.source_type}
                />
                <span
                  className="ml-2 font-mono text-xs uppercase"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {a.region ?? '—'} {a.conflict_day != null && `| DAY ${a.conflict_day}`}
                </span>
                <h2 className="font-body text-base mt-2" style={{ color: 'var(--text-primary)' }}>
                  {a.title}
                </h2>
                {a.summary && (
                  <p className="font-body text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {a.summary}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`sentiment-badge ${(a.sentiment ?? 'neutral').toLowerCase()}`}
                  >
                    {a.sentiment ?? '—'}
                  </span>
                  <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    CONFLICT DAY {a.conflict_day ?? '—'} — {a.published_at ? new Date(a.published_at).toISOString().slice(11, 16) : '--:--'} UTC
                  </span>
                </div>
                {a.confidence_score != null && (
                  <SentimentBar value={a.confidence_score} className="mt-2" />
                )}
              </OsintCard>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
