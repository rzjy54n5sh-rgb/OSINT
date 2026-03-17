import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { AlertsClient } from '@/components/admin/AlertsClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminAlertsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('alerts', role)) redirect('/admin');

  const { data: alerts } = await adminClient.from('platform_alerts').select('key, title, message, alert_type, is_active, priority, updated_at, activated_at').order('priority', { ascending: false });
  return <AlertsClient alerts={(alerts ?? []) as { key: string; title: string | null; message: string | null; alert_type: string; is_active: boolean; priority: number; updated_at: string; activated_at: string | null }[]} />;
}
