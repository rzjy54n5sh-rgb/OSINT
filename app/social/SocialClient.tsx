'use client';

import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { formatEngagement } from '@/lib/utils';
import type { SocialTrend } from '@/types/supabase';

interface SocialClientProps {
  initialTrends: SocialTrend[];
}

export default function SocialClient({ initialTrends }: SocialClientProps) {
  const trends = initialTrends;

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
      {trends.length === 0 && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
      {trends.length > 0 && (
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
                  {t.platform ?? '\u2014'}
                </span>
                <p className="font-body text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                  {t.trend ?? '\u2014'}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span style={{ color: 'var(--text-muted)' }} className="font-mono text-xs">
                    {t.region ?? '\u2014'} / {t.country ?? '\u2014'}
                  </span>
                  <span className={sentimentClass(t.sentiment)}>{t.sentiment ?? '\u2014'}</span>
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
