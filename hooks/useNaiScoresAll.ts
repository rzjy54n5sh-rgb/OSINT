'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { NaiScore } from '@/types/supabase';

export function useNaiScoresAll() {
  const [scores, setScores] = useState<NaiScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isActive = true;
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error: e } = await supabase
          .from('nai_scores')
          .select('*')
          .order('conflict_day', { ascending: true })
          .order('expressed_score', { ascending: false });
        if (!isActive) return;
        setLoading(false);
        if (e) setError(e);
        else setScores((data as NaiScore[]) ?? []);
      } catch (e) {
        if (!isActive) return;
        setLoading(false);
        setError(e instanceof Error ? e : new Error('Failed to fetch NAI scores'));
        setScores([]);
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  return { scores, loading, error };
}
