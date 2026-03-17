'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { AdminRole } from '@/types';

const ALLOWED_ROLES: AdminRole[] = ['INTEL_ANALYST', 'USER_MANAGER', 'FINANCE_MANAGER', 'CONTENT_REVIEWER'];

export async function addAdminAction(email: string, role: AdminRole): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!adminUser?.id || (adminUser.role as string) !== 'SUPER_ADMIN') return { ok: false, error: 'Forbidden' };
  if (!ALLOWED_ROLES.includes(role)) return { ok: false, error: 'Cannot assign SUPER_ADMIN via UI' };

  const { data: platformUser } = await admin.from('users').select('id').eq('email', email.trim()).maybeSingle();
  if (!platformUser) return { ok: false, error: 'No platform user with this email' };

  const { error } = await admin.from('admin_users').insert({
    user_id: platformUser.id,
    email: email.trim(),
    display_name: email.trim(),
    role,
    is_active: true,
    created_by: adminUser.id,
  });
  if (error) return { ok: false, error: error.message };

  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: 'SUPER_ADMIN',
    admin_email: adminUser.email ?? user.email,
    action_type: 'ADMIN_USER_CREATE',
    action_summary: `Admin added: ${email} as ${role}`,
    target_type: 'admin_user',
    after_state: { email: email.trim(), role },
  });
  revalidatePath('/admin/admins');
  return { ok: true };
}

export async function deactivateAdminAction(adminUserId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: me } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!me || (me.role as string) !== 'SUPER_ADMIN') return { ok: false, error: 'Forbidden' };
  if (me.id === adminUserId) return { ok: false, error: 'Cannot deactivate yourself' };

  const { data: target } = await admin.from('admin_users').select('email, display_name').eq('id', adminUserId).maybeSingle();
  if (!target) return { ok: false, error: 'Admin not found' };

  const { error } = await admin.from('admin_users').update({ is_active: false, deactivated_at: new Date().toISOString(), deactivated_by: me.id }).eq('id', adminUserId);
  if (error) return { ok: false, error: error.message };

  await admin.from('admin_audit_log').insert({
    admin_id: me.id,
    admin_role: 'SUPER_ADMIN',
    admin_email: me.email ?? user.email,
    action_type: 'ADMIN_USER_DEACTIVATE',
    action_summary: `Admin deactivated: ${(target as { email: string }).email}`,
    target_type: 'admin_user',
    target_id: adminUserId,
  });
  revalidatePath('/admin/admins');
  return { ok: true };
}

export async function changeAdminRoleAction(adminUserId: string, newRole: AdminRole): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: me } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!me || (me.role as string) !== 'SUPER_ADMIN') return { ok: false, error: 'Forbidden' };
  if (me.id === adminUserId) return { ok: false, error: 'Cannot change your own role' };
  if (!ALLOWED_ROLES.includes(newRole)) return { ok: false, error: 'Cannot assign SUPER_ADMIN via UI' };

  const { data: target } = await admin.from('admin_users').select('role').eq('id', adminUserId).maybeSingle();
  if (!target) return { ok: false, error: 'Admin not found' };
  const beforeRole = (target as { role: string }).role;

  const { error } = await admin.from('admin_users').update({ role: newRole }).eq('id', adminUserId);
  if (error) return { ok: false, error: error.message };

  await admin.from('admin_audit_log').insert({
    admin_id: me.id,
    admin_role: 'SUPER_ADMIN',
    admin_email: me.email ?? user.email,
    action_type: 'ADMIN_ROLE_ASSIGN',
    action_summary: `Admin role ${beforeRole} → ${newRole}`,
    target_type: 'admin_user',
    target_id: adminUserId,
    before_state: { role: beforeRole },
    after_state: { role: newRole },
  });
  revalidatePath('/admin/admins');
  return { ok: true };
}
