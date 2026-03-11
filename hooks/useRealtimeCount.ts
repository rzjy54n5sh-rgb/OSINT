'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeCount() {
  const [articleCount, setArticleCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<string>('--:-- UTC');
  const [live, setLive] = useState(false);
  const [conflictDay, setConflictDay] = useState<number | null>(null);

  useEffect(() => {
    let isActive = true;
    const supabase = createClient();

    void (async () => {
      try {
        const { count } = await supabase
          .from('articles')
          .select('*', { count: 'exact', head: true });
        if (!isActive) return;
        setArticleCount(count ?? 0);
        setLastUpdate(new Date().toISOString().slice(11, 16) + ' UTC');
        setLive(true);
      } catch {
        if (!isActive) return;
        setArticleCount(0);
        setLive(false);
      }
    })();

    void (async () => {
      try {
        const { data } = await supabase
          .from('nai_scores')
          .select('conflict_day')
          .order('conflict_day', { ascending: false })
          .limit(1)
          .single();
        if (!isActive) return;
        if (data?.conflict_day != null) setConflictDay(data.conflict_day);
      } catch {
        if (!isActive) return;
        setConflictDay(null);
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  return { articleCount, lastUpdate, live, conflictDay };
}
