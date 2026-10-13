'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ScenarioProbability } from '@/types/supabase';

/** `enabled = false` skips the read (e.g. Home, whose server render already has the rows). */
export function useScenarios(enabled = true) {
  const [scenarios, setScenarios] = useState<ScenarioProbability[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  return { scenarios, loading, error };
}
