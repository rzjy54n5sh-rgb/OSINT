'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function cancelSubscriptionAction(subscriptionId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!adminUser?.id) return { ok: false, error: 'Forbidden' };
  const role = adminUser.role as string;
  if (role !== 'SUPER_ADMIN' && role !== 'USER_MANAGER') return { ok: false, error: 'Forbidden' };

  const { data: sub } = await admin.from('subscriptions').select('*').eq('id', subscriptionId).maybeSingle();
  if (!sub) return { ok: false, error: 'Subscription not found' };

  const { error } = await admin.from('subscriptions').update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('id', subscriptionId);
  if (error) return { ok: false, error: error.message };

  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: role,
    admin_email: adminUser.email ?? user.email,
    action_type: 'SUBSCRIPTION_CANCEL',
    action_summary: `Subscription set to cancel at period end`,
    target_type: 'subscription',
    target_id: subscriptionId,
    after_state: { cancel_at_period_end: true },
  });
  revalidatePath('/admin/subscriptions');
  return { ok: true };
}
