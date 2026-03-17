'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function revokeApiKeyAction(keyId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!adminUser?.id) return { ok: false, error: 'Forbidden' };
  const role = adminUser.role as string;
  if (role !== 'SUPER_ADMIN' && role !== 'USER_MANAGER') return { ok: false, error: 'Forbidden' };

  const { data: row } = await admin.from('api_keys').select('id, key_prefix').eq('id', keyId).maybeSingle();
  if (!row) return { ok: false, error: 'Key not found' };

  const { error } = await admin.from('api_keys').update({
    is_revoked: true,
    revoked_at: new Date().toISOString(),
    revoke_reason: 'Revoked by admin',
    updated_at: new Date().toISOString(),
  }).eq('id', keyId);
  if (error) return { ok: false, error: error.message };

  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: role,
    admin_email: adminUser.email ?? user.email,
    action_type: 'API_KEY_REVOKE',
    action_summary: `Revoked API key ${(row as { key_prefix: string }).key_prefix}`,
    target_type: 'api_key',
    target_id: keyId,
  });
  revalidatePath('/admin/api-keys');
  return { ok: true };
}
