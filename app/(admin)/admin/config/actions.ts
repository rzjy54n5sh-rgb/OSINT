'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function updateConfigAction(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!adminUser?.id) return { ok: false, error: 'Forbidden' };
  if (adminUser.role !== 'SUPER_ADMIN') return { ok: false, error: 'Forbidden' };

  const { data: oldRow } = await admin.from('platform_config').select('value, is_sensitive').eq('key', key).maybeSingle();
  const beforeVal = oldRow?.value;
  const isSensitive = (oldRow as { is_sensitive?: boolean } | null)?.is_sensitive ?? false;

  const { error } = await admin.from('platform_config').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) return { ok: false, error: error.message };

  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: adminUser.role,
    admin_email: adminUser.email ?? user.email,
    action_type: 'PLATFORM_CONFIG_CHANGE',
    action_summary: `Config ${key} updated`,
    target_type: 'platform_config',
    target_id: key,
    before_state: { [key]: isSensitive ? '(sensitive)' : beforeVal },
    after_state: { [key]: isSensitive ? '(sensitive)' : value },
  });
  revalidatePath('/admin/config');
  return { ok: true };
}
