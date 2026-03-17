import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { getConflictDay } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { ReportsClient } from '@/components/admin/ReportsClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminReportsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('reports', role)) redirect('/admin');

  const currentDay = await getConflictDay();
  const { data: reports } = await adminClient.from('country_reports').select('country_code, country_name, nai_score, nai_category, content_json, updated_at, conflict_day').eq('conflict_day', currentDay).order('country_code');
  return <ReportsClient initialDay={currentDay} initialReports={(reports ?? []) as { country_code: string; country_name: string | null; nai_score: number | null; nai_category: string | null; content_json: unknown; updated_at: string; conflict_day: number }[]} role={role} />;
}
