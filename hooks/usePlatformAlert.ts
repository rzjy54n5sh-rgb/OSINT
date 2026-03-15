'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ScenarioAlert {
  active: boolean;
  conflict_day?: number;
  label?: string;
  name?: string;
  description?: string;
  probability?: number;
}

export function useNewScenarioAlert() {
  const [alert, setAlert] = useState<ScenarioAlert | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from('platform_alerts')
        .select('value')
        .eq('key', 'new_scenario_alert')
        .single();
      if (data?.value) {
        const parsed = data.value as ScenarioAlert;
        if (parsed.active) setAlert(parsed);
      }
    })();
  }, []);

  return alert;
}
