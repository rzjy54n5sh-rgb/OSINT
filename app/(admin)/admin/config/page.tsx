import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { ConfigClient } from '@/components/admin/ConfigClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminConfigPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('config', role)) redirect('/admin');

  const { data: rows } = await adminClient.from('platform_config').select('key, value, description, is_sensitive').order('key');
  const config = (rows ?? []).map((r) => ({
    key: (r as { key: string }).key,
    value: (r as { value: unknown }).value,
    description: (r as { description?: string }).description,
    is_sensitive: (r as { is_sensitive?: boolean }).is_sensitive ?? false,
  }));

  return <ConfigClient initialConfig={config} />;
}
