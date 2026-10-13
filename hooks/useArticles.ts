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

/** `enabled = false` skips the read (e.g. Home, whose server render already has the rows). */
export function useArticles(filters: UseArticlesFilters = {}, pageSize = 20, enabled = true) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
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
        if (cancelled) return;
        if (e) setError(e);
        else setArticles((data as Article[]) ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error('Failed to fetch articles'));
        setArticles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.region, filters.sentiment, filters.source_type, filters.conflict_day, page, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { articles, loading, error, page, setPage };
}
