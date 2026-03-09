'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { NaiScore } from '@/types/supabase';

export function useNaiScoresAll() {
  const [scores, setScores] = useState<NaiScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('nai_scores')
      .select('*')
      .order('conflict_day', { ascending: true })
      .order('expressed_score', { ascending: false })
      .then(({ data, error: e }) => {
        setLoading(false);
        if (e) setError(e);
        else setScores((data as NaiScore[]) ?? []);
      });
  }, []);

  return { scores, loading, error };
}
