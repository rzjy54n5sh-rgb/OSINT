'use client';

import { useState } from 'react';
import { OsintCard } from '@/components/OsintCard';
import { useArticles } from '@/hooks/useArticles';
import { useNaiScores } from '@/hooks/useNaiScores';

const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function TimelinePage() {
  const [selectedDay, setSelectedDay] = useState(10);
  const { articles } = useArticles({ conflict_day: selectedDay }, 100);
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
        DAY 1 → 10 — ARTICLES | NAI AVERAGE | EVENTS
      </p>
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
        {DAYS.map((d) => (
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
      <OsintCard className="scanlines">
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
    </div>
  );
}
