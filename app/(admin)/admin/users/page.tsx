import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { UsersClient } from '@/components/admin/UsersClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminUsersPage() {
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
  if (!canAccess('users', role)) redirect('/admin');

  return <UsersClient />;
}
