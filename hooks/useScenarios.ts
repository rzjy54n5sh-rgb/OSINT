'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ScenarioProbability } from '@/types/supabase';

export function useScenarios() {
  const [scenarios, setScenarios] = useState<ScenarioProbability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isActive = true;
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error: e } = await supabase
          .from('scenario_probabilities')
          .select('*')
          .order('conflict_day', { ascending: true });
        if (!isActive) return;
        setLoading(false);
        if (e) setError(e);
        else setScenarios((data as ScenarioProbability[]) ?? []);
      } catch (e) {
        if (!isActive) return;
        setLoading(false);
        setError(e instanceof Error ? e : new Error('Failed to fetch scenarios'));
        setScenarios([]);
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  return { scenarios, loading, error };
}
