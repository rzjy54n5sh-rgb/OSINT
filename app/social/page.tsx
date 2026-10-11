import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';
import { createPublicClient } from '@/utils/supabase/server';
import { parseEngagementEstimate } from '@/lib/utils';
import type { SocialTrend } from '@/types/supabase';
import SocialClient from './SocialClient';

export const metadata: Metadata = pageMetadata({
  title: 'Social Media Trend Monitor — MENA Intel Desk',
  description:
    'Regional social media trends by country and platform, collected from public trend sources: what people are discussing, shown apart from what governments say officially.',
  path: '/social',
});

/** ISR: social trends are collected every 12 h. */
export const revalidate = 900;

export default async function SocialPage() {
  const supabase = createPublicClient();

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
