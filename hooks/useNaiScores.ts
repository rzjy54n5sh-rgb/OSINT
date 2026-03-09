'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { NaiScore } from '@/types/supabase';

export function useNaiScores(conflictDay: number | null) {
  const [scores, setScores] = useState<NaiScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (conflictDay == null) {
      setScores([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    supabase
      .from('nai_scores')
      .select('*')
      .eq('conflict_day', conflictDay)
      .order('expressed_score', { ascending: false })
      .then(({ data, error: e }) => {
        setLoading(false);
        if (e) setError(e);
        else setScores((data as NaiScore[]) ?? []);
      });
  }, [conflictDay]);

  return { scores, loading, error };
}
