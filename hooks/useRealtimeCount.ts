'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { currentConflictDay } from '@/lib/conflict-calendar';

export function useRealtimeCount() {
  const [articleCount, setArticleCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<string>('--:-- UTC');
  const [live, setLive] = useState(false);
  // DAY LOCK: calendar day, never MAX(nai_scores.conflict_day) (nai_scores can be frozen).
  const conflictDay: number = currentConflictDay();

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      try {
        const articlesRes = await supabase.from('articles').select('*', { count: 'exact', head: true });
        if (cancelled) return;
        if (articlesRes.error) {
          setArticleCount(0);
          setLive(false);
        } else {
          setArticleCount(articlesRes.count ?? 0);
          setLastUpdate(new Date().toISOString().slice(11, 16) + ' UTC');
          setLive(true);
        }
      } catch {
        if (!cancelled) {
          setArticleCount(0);
          setLive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { articleCount, lastUpdate, live, conflictDay };
}
