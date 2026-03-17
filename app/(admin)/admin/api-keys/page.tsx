import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { ApiKeysClient } from '@/components/admin/ApiKeysClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminApiKeysPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('api-keys', role)) redirect('/admin');

  const { data: keys } = await adminClient.from('api_keys').select('id, key_prefix, user_id, name, last_used_at, request_count, is_revoked').order('created_at', { ascending: false });
  const userIds = [...new Set((keys ?? []).map((k) => (k as { user_id: string }).user_id))];
  const { data: users } = userIds.length > 0 ? await adminClient.from('users').select('id, email').in('id', userIds) : { data: [] };
  const emailByUserId: Record<string, string> = {};
  for (const u of users ?? []) emailByUserId[(u as { id: string }).id] = (u as { email: string }).email;

  return (
    <ApiKeysClient
      keys={(keys ?? []) as { id: string; key_prefix: string; user_id: string; name: string; last_used_at: string | null; request_count: number; is_revoked: boolean }[]}
      emailByUserId={emailByUserId}
      role={role}
    />
  );
}
