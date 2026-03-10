'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeCount() {
  const [articleCount, setArticleCount] = useState<number>(0);
  const [lastUpdate, setLastUpdate] = useState<string>('--:-- UTC');
  const [live, setLive] = useState(false);
  const [conflictDay, setConflictDay] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .then(({ count }) => {
        setArticleCount(count ?? 0);
        setLastUpdate(new Date().toISOString().slice(11, 16) + ' UTC');
        setLive(true);
      });

    supabase
      .from('nai_scores')
      .select('conflict_day')
      .order('conflict_day', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.conflict_day != null) setConflictDay(data.conflict_day);
      });
  }, []);

  return { articleCount, lastUpdate, live, conflictDay };
}
