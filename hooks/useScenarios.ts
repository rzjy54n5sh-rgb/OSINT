'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ScenarioProbability } from '@/types/supabase';

export function useScenarios() {
  const [scenarios, setScenarios] = useState<ScenarioProbability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('scenario_probabilities')
      .select('*')
      .order('conflict_day', { ascending: true })
      .then(({ data, error: e }) => {
        setLoading(false);
        if (e) setError(e);
        else setScenarios((data as ScenarioProbability[]) ?? []);
      });
  }, []);

  return { scenarios, loading, error };
}
