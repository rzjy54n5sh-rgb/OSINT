'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function flagArticleForReviewAction(articleId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!adminUser?.id) return { ok: false, error: 'Forbidden' };
  const role = adminUser.role as string;
  if (role !== 'SUPER_ADMIN' && role !== 'INTEL_ANALYST') return { ok: false, error: 'Forbidden' };

  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: role,
    admin_email: adminUser.email ?? user.email,
    action_type: 'ARTICLE_FLAGGED_FOR_REVIEW',
    action_summary: `Article ${articleId} flagged for review`,
    target_type: 'article',
    target_id: articleId,
  });
  revalidatePath('/admin/feed');
  return { ok: true };
}
