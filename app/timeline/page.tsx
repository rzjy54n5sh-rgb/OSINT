'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { SourceBadge } from '@/components/SourceBadge';
import { SentimentBar } from '@/components/SentimentBar';
import { useArticles } from '@/hooks/useArticles';
import { useNaiScores } from '@/hooks/useNaiScores';
import { useConflictDay } from '@/hooks/useConflictDay';

export default function TimelinePage() {
  const maxDay = useConflictDay() ?? 11;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const [selectedDay, setSelectedDay] = useState(days[days.length - 1] ?? 10);
  const { articles } = useArticles({ conflict_day: selectedDay }, 500);
  const { scores } = useNaiScores(selectedDay);
  const avgNai = scores.length > 0
    ? scores.reduce((a, s) => a + s.expressed_score, 0) / scores.length
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        CONFLICT TIMELINE
      </h1>
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        DAY 1 → {maxDay} — ARTICLES | NAI AVERAGE | EVENTS
      </p>
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setSelectedDay(d)}
            className="flex-shrink-0 font-mono text-xs uppercase px-4 py-2 border rounded-sm transition-colors"
            style={{
              borderColor: selectedDay === d ? 'var(--accent-gold)' : 'var(--border)',
              color: selectedDay === d ? 'var(--accent-gold)' : 'var(--text-secondary)',
              background: selectedDay === d ? 'rgba(232,197,71,0.08)' : 'transparent',
            }}
          >
            DAY {d}
          </button>
        ))}
      </div>
      <OsintCard className="mb-6">
        <div className="grid grid-cols-3 gap-4 font-mono text-sm">
          <div>
            <span style={{ color: 'var(--text-muted)' }}>ARTICLES </span>
            <span style={{ color: 'var(--accent-gold)' }}>{articles.length}</span>
            {articles.length >= 500 && <span style={{ color: 'var(--text-muted)', fontSize: 10 }}> (showing first 500)</span>}
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>NAI AVG </span>
            <span style={{ color: 'var(--accent-gold)' }}>{avgNai != null ? avgNai.toFixed(1) : '—'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>COUNTRIES </span>
            <span style={{ color: 'var(--accent-gold)' }}>{scores.length}</span>
          </div>
        </div>
      </OsintCard>
      <OsintCard className="scanlines mb-6">
        <h2 className="font-display text-lg mb-4">DAY {selectedDay} — SUMMARY</h2>
        {articles.length === 0 && scores.length === 0 ? (
          <p className="redacted">NO INTEL AVAILABLE</p>
        ) : (
          <ul className="space-y-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
            <li>Articles indexed: {articles.length}</li>
            <li>Countries with NAI: {scores.length}</li>
            {avgNai != null && <li>Average NAI: {avgNai.toFixed(2)}</li>}
          </ul>
        )}
      </OsintCard>

      {articles.length > 0 && (
        <>
          <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>
            ARTICLES — DAY {selectedDay}
          </h2>
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
                  <span className="ml-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    {a.region ?? '—'} | DAY {a.conflict_day ?? '—'}
                  </span>
                  <h3 className="font-body text-base mt-2" style={{ color: 'var(--text-primary)' }}>
                    {a.title}
                  </h3>
                  {a.summary && (
                    <p className="font-body text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {a.summary}
                    </p>
                  )}
                  <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                    CONFLICT DAY {a.conflict_day ?? '—'} — {a.published_at ? new Date(a.published_at).toISOString().slice(11, 16) : '--:--'} UTC
                  </p>
                  {a.confidence_score != null && (
                    <SentimentBar value={a.confidence_score} className="mt-2" />
                  )}
                </OsintCard>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
