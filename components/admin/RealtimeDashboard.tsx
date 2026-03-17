'use client';

import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

type Props = {
  onPipelineUpdate?: () => void;
  onAlertsUpdate?: () => void;
};

export function RealtimeDashboard({ onPipelineUpdate, onAlertsUpdate }: Props) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pipeline_runs' }, () => {
        onPipelineUpdate?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_alerts' }, () => {
        onAlertsUpdate?.();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onPipelineUpdate, onAlertsUpdate]);

  return null;
}
