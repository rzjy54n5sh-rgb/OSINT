'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { NaiScore } from '@/types/supabase';

export function useNaiScores(conflictDay: number | null) {
  const [scores, setScores] = useState<NaiScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (conflictDay == null) {
      setScores([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error: e } = await supabase
          .from('nai_scores')
          .select('*')
          .eq('conflict_day', conflictDay)
          .order('expressed_score', { ascending: false });
        if (cancelled) return;
        if (e) setError(e);
        else setScores((data as NaiScore[]) ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error('Failed to fetch NAI scores'));
        setScores([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conflictDay]);

  return { scores, loading, error };
}
