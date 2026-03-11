'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Returns the latest conflict_day from Supabase (nai_scores).
 * Used so the platform shows the current day after pipeline updates.
 */
export function useConflictDay(): number | null {
  const [conflictDay, setConflictDay] = useState<number | null>(null);

  useEffect(() => {
    let isActive = true;
    const supabase = createClient();
    void (async () => {
      try {
        const { data } = await supabase
          .from('nai_scores')
          .select('conflict_day')
          .order('conflict_day', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!isActive) return;
        if (data?.conflict_day != null) setConflictDay(data.conflict_day);
      } catch {
        if (!isActive) return;
        setConflictDay(null);
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  return conflictDay;
}
