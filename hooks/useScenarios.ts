'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ScenarioProbability } from '@/types/supabase';

export function useScenarios() {
  const [scenarios, setScenarios] = useState<ScenarioProbability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error: e } = await supabase
          .from('scenario_probabilities')
          .select('*')
          .order('conflict_day', { ascending: true });
        if (cancelled) return;
        if (e) setError(e);
        else setScenarios((data as ScenarioProbability[]) ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error('Failed to fetch scenarios'));
        setScenarios([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { scenarios, loading, error };
}
