'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function resolveDisputeAction(disputeId: string, action: 'accepted' | 'rejected'): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!adminUser?.id) return { ok: false, error: 'Forbidden' };
  const role = adminUser.role as string;
  if (role !== 'SUPER_ADMIN' && role !== 'USER_MANAGER') return { ok: false, error: 'Forbidden' };

  const { data: row } = await admin.from('disputes').select('id, article_id').eq('id', disputeId).maybeSingle();
  if (!row) return { ok: false, error: 'Dispute not found' };

  const { error } = await admin.from('disputes').update({
    admin_action: action,
    admin_action_at: new Date().toISOString(),
    admin_id: adminUser.id,
    updated_at: new Date().toISOString(),
  }).eq('id', disputeId);
  if (error) return { ok: false, error: error.message };

  const actionType = action === 'accepted' ? 'DISPUTE_ACCEPT' : 'DISPUTE_REJECT';
  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: role,
    admin_email: adminUser.email ?? user.email,
    action_type: actionType,
    action_summary: `${action === 'accepted' ? 'Accepted' : 'Rejected'} dispute for article`,
    target_type: 'dispute',
    target_id: disputeId,
    after_state: { article_id: (row as { article_id: string }).article_id, admin_action: action },
  });
  revalidatePath('/admin/disputes');
  return { ok: true };
}
