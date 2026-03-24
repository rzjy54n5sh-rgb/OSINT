import { createClient } from '@/utils/supabase/server';
import { parseEngagementEstimate } from '@/lib/utils';
import type { SocialTrend } from '@/types/supabase';
import SocialClient from './SocialClient';

export default async function SocialPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('social_trends')
    .select('*')
    .order('conflict_day', { ascending: false })
    .order('engagement_estimate', { ascending: false, nullsFirst: false })
    .limit(50);

  let trends: SocialTrend[] = [];
  if (!error && data) {
    trends = (data as SocialTrend[]).sort(
      (a, b) =>
        (parseEngagementEstimate(b.engagement_estimate) ?? -1) -
        (parseEngagementEstimate(a.engagement_estimate) ?? -1)
    );
  }

  return <SocialClient initialTrends={trends} />;
}
