'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { currentConflictDay } from '@/lib/conflict-calendar';
import { fetchDataFreshness, formatUtcStamp } from '@/lib/data-freshness';

/**
 * One article-count read per page load, shared by the header and the home status line (both call
 * this hook). `count: 'estimated'`, not 'exact': an exact COUNT(*) over the whole articles table on
 * every page view cost the database for a figure shown only as a rough total (UX audit 2026-10-13).
 * Display it with formatArticleCount() (lib/article-count.ts), which marks it as approximate.
 */
const COUNT_CACHE_MS = 60_000;
let countCache: { at: number; promise: Promise<{ count: number | null; error: boolean }> } | null = null;
function fetchArticleCountEstimate(): Promise<{ count: number | null; error: boolean }> {
  if (countCache && Date.now() - countCache.at < COUNT_CACHE_MS) return countCache.promise;
  const promise = (async () => {
    const { count, error } = await createClient().from('articles').select('id', { count: 'estimated', head: true });
    return { count: error ? null : count ?? null, error: !!error };
  })().catch(() => ({ count: null, error: true }));
  countCache = { at: Date.now(), promise };
  return promise;
}

export function useRealtimeCount() {
  // null until read (shown as an em dash, never as 0).
  const [articleCount, setArticleCount] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('--:-- UTC');
  const [live, setLive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // DAY LOCK: calendar day, never MAX(nai_scores.conflict_day) (nai_scores can be frozen).
  const conflictDay: number = currentConflictDay();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [articlesRes, freshness] = await Promise.all([fetchArticleCountEstimate(), fetchDataFreshness()]);
        if (cancelled) return;
        setLoaded(true);
        if (articlesRes.error) {
          setArticleCount(null);
          setLive(false);
        } else {
          setArticleCount(articlesRes.count);
          // Real timestamp of the newest article in the DB — never the visitor's clock.
          setLastUpdate(formatUtcStamp(freshness.lastUpdateAt));
          // LIVE only while article ingestion is actually fresh.
          setLive(freshness.loaded ? freshness.pipelineActive : false);
        }
      } catch {
        if (!cancelled) {
          setLoaded(true);
          setArticleCount(null);
          setLive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { articleCount, lastUpdate, live, conflictDay, loaded };
}
