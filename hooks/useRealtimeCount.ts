'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeCount() {
  const [articleCount, setArticleCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<string>('--:-- UTC');
  const [live, setLive] = useState(false);
  const [conflictDay, setConflictDay] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      try {
        const [articlesRes, dayRes] = await Promise.all([
          supabase.from('articles').select('*', { count: 'exact', head: true }),
          supabase
            .from('nai_scores')
            .select('conflict_day')
            .order('conflict_day', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        if (articlesRes.error) {
          setArticleCount(0);
          setLive(false);
        } else {
          setArticleCount(articlesRes.count ?? 0);
          setLastUpdate(new Date().toISOString().slice(11, 16) + ' UTC');
          setLive(true);
        }
        if (dayRes.data?.conflict_day != null) setConflictDay(dayRes.data.conflict_day);
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
