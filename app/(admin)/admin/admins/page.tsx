import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { AdminsClient } from '@/components/admin/AdminsClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminAdminsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('admins', role)) redirect('/admin');

  const { data: admins } = await adminClient.from('admin_users').select('id, email, display_name, role, is_active, created_by, created_at').order('created_at', { ascending: false });
  const createdByLookup: Record<string, string> = {};
  const ids = (admins ?? []).map((a) => (a as { created_by?: string }).created_by).filter(Boolean) as string[];
  if (ids.length > 0) {
    const { data: creators } = await adminClient.from('admin_users').select('id, display_name').in('id', ids);
    for (const r of creators ?? []) createdByLookup[(r as { id: string }).id] = (r as { display_name: string }).display_name ?? '';
  }

  return (
    <AdminsClient
      admins={(admins ?? []) as { id: string; email: string; display_name: string; role: string; is_active: boolean; created_by?: string; created_at: string }[]}
      createdByLookup={createdByLookup}
      currentAdminId={adminUser.id}
    />
  );
}
