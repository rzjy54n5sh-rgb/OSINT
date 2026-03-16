'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useDataFreshness() {
  const [lastNaiUpdate, setLastNaiUpdate] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('nai_scores')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.updated_at) return;
        setLastNaiUpdate(data.updated_at);
        const hoursOld = (Date.now() - new Date(data.updated_at).getTime()) / 36e5;
        setStale(hoursOld > 26); // flag if NAI scores are more than 26 hours old
      });
  }, []);

  return { lastNaiUpdate, stale };
}
