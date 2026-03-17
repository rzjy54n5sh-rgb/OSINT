import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { PipelineClient } from '@/components/admin/PipelineClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminPipelinePage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient
    .from('admin_users')
    .select('id, role, is_active')
    .eq('user_id', user.id)
    .single();

  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('pipeline', role)) redirect('/admin');

  const { data: cronRow } = await adminClient
    .from('platform_config')
    .select('value')
    .eq('key', 'pipeline_cron')
    .maybeSingle();

  const initialCron = (cronRow?.value as string)?.replace(/^"|"$/g, '') ?? '0 6 * * *';

  return <PipelineClient initialCron={initialCron} />;
}
