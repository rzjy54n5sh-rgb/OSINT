'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Article } from '@/types/database';
import { OSINTCard } from '@/components/OSINTCard';
import { motion, AnimatePresence } from 'framer-motion';

const LIMIT = 50;

export function FeedClient() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<string>('');
  const [sourceType, setSourceType] = useState<string>('');
  const [sentiment, setSentiment] = useState<string>('');

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let query = supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(LIMIT);
    if (region) query = query.eq('region', region);
    if (sourceType) query = query.eq('source_type', sourceType);
    if (sentiment) query = query.eq('sentiment', sentiment);
    query.then(({ data }) => {
      setArticles((data as Article[]) ?? []);
      setLoading(false);
    });
  }, [region, sourceType, sentiment]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    const channel = supabase
      .channel('feed-inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'articles' }, (payload) => {
        setArticles((prev) => [payload.new as Article, ...prev].slice(0, LIMIT));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="osint-card h-48 animate-pulse rounded-lg bg-bg-card" />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-[var(--border)] bg-bg-card p-12 text-center">
        <p className="font-mono text-sm uppercase tracking-wider text-text-muted">
          Awaiting data feed...
        </p>
        <p className="mt-2 text-text-secondary">Articles will appear here when the pipeline populates the database.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded border border-[var(--border)] bg-bg-card px-3 py-1.5 font-mono text-xs text-text-primary"
        >
          <option value="">All regions</option>
          <option value="MENA">MENA</option>
          <option value="GCC">GCC</option>
        </select>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          className="rounded border border-[var(--border)] bg-bg-card px-3 py-1.5 font-mono text-xs text-text-primary"
        >
          <option value="">All sources</option>
          <option value="news">News</option>
          <option value="social">Social</option>
        </select>
        <select
          value={sentiment}
          onChange={(e) => setSentiment(e.target.value)}
          className="rounded border border-[var(--border)] bg-bg-card px-3 py-1.5 font-mono text-xs text-text-primary"
        >
          <option value="">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
      </div>
      <motion.div
        className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        layout
      >
        <AnimatePresence mode="popLayout">
          {articles.map((a) => (
            <motion.div
              key={a.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <OSINTCard
                title={a.title}
                accent="gold"
                sourceStamp={{
                  sourceName: a.source_name,
                  sourceLogoUrl: a.source_logo_url,
                  city: a.country,
                  country: a.region,
                  lat: a.lat,
                  lng: a.lng,
                  publishedAt: a.published_at,
                  url: a.url,
                  confidenceScore: a.confidence_score,
                }}
                confidenceScore={a.confidence_score}
              >
                {a.summary ? <p className="text-sm">{a.summary}</p> : null}
              </OSINTCard>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
