'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { currentConflictDay } from '@/lib/conflict-calendar';
import { fetchDataFreshness, formatUtcStamp } from '@/lib/data-freshness';

export function useRealtimeCount() {
  const [articleCount, setArticleCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<string>('--:-- UTC');
  const [live, setLive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // DAY LOCK: calendar day, never MAX(nai_scores.conflict_day) (nai_scores can be frozen).
  const conflictDay: number = currentConflictDay();

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      try {
        const [articlesRes, freshness] = await Promise.all([
          supabase.from('articles').select('*', { count: 'exact', head: true }),
          fetchDataFreshness(),
        ]);
        if (cancelled) return;
        setLoaded(true);
        if (articlesRes.error) {
          setArticleCount(0);
          setLive(false);
        } else {
          setArticleCount(articlesRes.count ?? 0);
          // Real timestamp of the newest article / brief in the DB — never the visitor's clock.
          setLastUpdate(formatUtcStamp(freshness.lastUpdateAt));
          // LIVE only while article ingestion is actually fresh.
          setLive(freshness.loaded ? freshness.pipelineActive : false);
        }
      } catch {
        if (!cancelled) {
          setLoaded(true);
          setArticleCount(0);
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
