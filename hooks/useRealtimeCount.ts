'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeCount() {
  const [articleCount, setArticleCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('--:-- UTC');
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      console.error('Supabase env vars missing');
      return;
    }
    const supabase = createClient();

    const fetchCount = async () => {
      const { count } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true });
      setArticleCount(count ?? 0);
    };

    fetchCount();

    const channel = supabase
      .channel('articles-count')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'articles' },
        () => {
          setLive(true);
          fetchCount();
          setLastUpdate(
            new Date().toISOString().slice(11, 16) + ' UTC'
          );
          setTimeout(() => setLive(false), 3000);
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      const now = new Date();
      setLastUpdate(now.toISOString().slice(11, 16) + ' UTC');
    }, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  return { articleCount, lastUpdate, live };
}
