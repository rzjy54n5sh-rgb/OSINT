'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Article } from '@/types/supabase';

export interface UseArticlesFilters {
  region?: string | null;
  sentiment?: string | null;
  source_type?: string | null;
  conflict_day?: number | null;
}

export function useArticles(filters: UseArticlesFilters = {}, pageSize = 20) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let isActive = true;
    setLoading(true);
    setError(null);
    const supabase = createClient();
    let q = supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (filters.region) q = q.eq('region', filters.region);
    if (filters.sentiment) q = q.eq('sentiment', filters.sentiment);
    if (filters.source_type) q = q.eq('source_type', filters.source_type);
    if (filters.conflict_day != null) q = q.eq('conflict_day', filters.conflict_day);
    void (async () => {
      try {
        const { data, error: e } = await q;
        if (!isActive) return;
        setLoading(false);
        if (e) setError(e);
        else setArticles((data as Article[]) ?? []);
      } catch (e) {
        if (!isActive) return;
        setLoading(false);
        setError(e instanceof Error ? e : new Error('Failed to fetch articles'));
        setArticles([]);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [filters.region, filters.sentiment, filters.source_type, filters.conflict_day, page, pageSize]);

  return { articles, loading, error, page, setPage };
}
