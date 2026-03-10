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
    const supabase = createClient();
    supabase
      .from('nai_scores')
      .select('conflict_day')
      .order('conflict_day', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.conflict_day != null) setConflictDay(data.conflict_day);
      });
  }, []);

  return conflictDay;
}
