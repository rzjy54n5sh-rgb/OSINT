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
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.created_at) return;
        setLastNaiUpdate(data.created_at);
        const hoursOld = (Date.now() - new Date(data.created_at).getTime()) / 36e5;
        setStale(hoursOld > 26); // flag if NAI scores are more than 26 hours old
      });
  }, []);

  return { lastNaiUpdate, stale };
}
