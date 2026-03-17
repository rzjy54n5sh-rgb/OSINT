'use server';

import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export type ReportRow = {
  country_code: string;
  country_name: string | null;
  nai_score: number | null;
  nai_category: string | null;
  content_json: unknown;
  updated_at: string;
  conflict_day: number;
};

export async function getReportsForDayAction(conflictDay: number): Promise<ReportRow[]> {
  const user = await getUser();
  if (!user) return [];
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) return [];
  const { data } = await admin
    .from('country_reports')
    .select('country_code, country_name, nai_score, nai_category, content_json, updated_at, conflict_day')
    .eq('conflict_day', conflictDay)
    .order('country_code');
  return (data ?? []) as ReportRow[];
}
