'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { SCENARIO_NOTICE_KEY } from '@/lib/scenario-notice';

export async function toggleAlertAction(key: string, isActive: boolean): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email, is_active').eq('user_id', user.id).single();
  // CLAUDE.md rule 5: every admin action verifies an ACTIVE admin itself (the middleware gate is path-based).
  if (!adminUser?.id || adminUser.is_active !== true) return { ok: false, error: 'Forbidden' };
  const role = adminUser.role as string;
  if (role !== 'SUPER_ADMIN' && role !== 'INTEL_ANALYST') return { ok: false, error: 'Forbidden' };

  const { data: before } = await admin.from('platform_alerts').select('is_active').eq('key', key).maybeSingle();
  const { error } = await admin.from('platform_alerts').update({ is_active: isActive, updated_at: new Date().toISOString(), updated_by: adminUser.id }).eq('key', key);
  if (error) return { ok: false, error: error.message };

  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: role,
    admin_email: adminUser.email ?? user.email,
    action_type: 'ALERT_BANNER_TOGGLE',
    action_summary: `Alert ${key} is_active → ${isActive}`,
    target_type: 'platform_alert',
    target_id: key,
    before_state: before ?? null,
    after_state: { is_active: isActive },
  });
  revalidatePath('/admin/alerts');
  return { ok: true };
}

export async function editAlertAction(key: string, title: string | null, message: string | null): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email, is_active').eq('user_id', user.id).single();
  // CLAUDE.md rule 5: every admin action verifies an ACTIVE admin itself (the middleware gate is path-based).
  if (!adminUser?.id || adminUser.is_active !== true) return { ok: false, error: 'Forbidden' };
  const role = adminUser.role as string;
  if (role !== 'SUPER_ADMIN' && role !== 'INTEL_ANALYST') return { ok: false, error: 'Forbidden' };

  const { data: before } = await admin.from('platform_alerts').select('title, message, message_ar').eq('key', key).maybeSingle();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: adminUser.id };
  if (title !== undefined) updates.title = title;
  if (message !== undefined) updates.message = message;
  // The scenario notice shows message_ar under the English text: when the English actually changes, the old
  // translation is cleared in the same update (a save with unchanged English keeps it; the audit row keeps it).
  if (key === SCENARIO_NOTICE_KEY && (title !== (before?.title ?? null) || message !== (before?.message ?? null))) {
    updates.message_ar = null;
  }
  const { error } = await admin.from('platform_alerts').update(updates).eq('key', key);
  if (error) return { ok: false, error: error.message };

  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: role,
    admin_email: adminUser.email ?? user.email,
    action_type: 'ALERT_BANNER_EDIT',
    action_summary: `Alert ${key} title/message updated`,
    target_type: 'platform_alert',
    target_id: key,
    before_state: before ?? null,
    after_state: updates,
  });
  revalidatePath('/admin/alerts');
  return { ok: true };
}
