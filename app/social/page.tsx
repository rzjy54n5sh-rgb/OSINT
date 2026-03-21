'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { createClient } from '@/lib/supabase/client';
import { formatEngagement, parseEngagementEstimate } from '@/lib/utils';
import type { SocialTrend } from '@/types/supabase';

export default function SocialPage() {
  const [trends, setTrends] = useState<SocialTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error: e } = await supabase
          .from('social_trends')
          .select('*')
          .order('conflict_day', { ascending: false })
          .order('created_at', { ascending: false });
        if (cancelled) return;
        setLoading(false);
        if (e) {
          setError(e);
          setTrends([]);
          return;
        }
        const rows = ((data as SocialTrend[]) ?? []).sort(
          (a, b) =>
            (parseEngagementEstimate(b.engagement_estimate) ?? -1) -
            (parseEngagementEstimate(a.engagement_estimate) ?? -1)
        );
        setTrends(rows);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err : new Error('Failed to load'));
        setTrends([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sentimentClass = (s: string | null) => {
    const v = (s ?? '').toLowerCase();
    if (v === 'anti_war') return 'sentiment-badge positive';
    if (v === 'pro_war' || v === 'fearful') return 'sentiment-badge negative';
    if (v === 'positive') return 'sentiment-badge positive';
    if (v === 'negative') return 'sentiment-badge negative';
    return 'sentiment-badge neutral';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="SOCIAL MEDIA TREND MONITOR"
        description="Regional social media trend data showing the dominant public narratives in each country. Trends are collected from public trend APIs and represent what large numbers of people are actively discussing — not what governments are saying officially."
        note="Social data should be read alongside NAI scores, not in isolation. A country with a high NAI score but an anti-war trending topic has a measurable gap between official posture and public sentiment."
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        SOCIAL TRENDS
      </h1>
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        REGIONAL BREAKDOWN — PLATFORM — SENTIMENT
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
      {!loading && !error && trends.length === 0 && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
      {!loading && !error && trends.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trends.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <OsintCard>
                <span className="font-mono text-xs uppercase" style={{ color: 'var(--accent-gold)' }}>
                  {t.platform ?? '—'}
                </span>
                <p className="font-body text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                  {t.trend ?? '—'}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span style={{ color: 'var(--text-muted)' }} className="font-mono text-xs">
                    {t.region ?? '—'} / {t.country ?? '—'}
                  </span>
                  <span className={sentimentClass(t.sentiment)}>{t.sentiment ?? '—'}</span>
                  {t.engagement_estimate != null && (
                    <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                      ENG: {formatEngagement(t.engagement_estimate)}
                    </span>
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
