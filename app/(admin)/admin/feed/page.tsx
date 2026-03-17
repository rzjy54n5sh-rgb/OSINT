import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { FeedClient } from '@/components/admin/FeedClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminFeedPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('feed', role)) redirect('/admin');

  const { data: sources } = await adminClient.from('article_sources').select('id, name, display_name, language, category').eq('is_active', true).order('display_name');
  return <FeedClient role={role} sources={(sources ?? []) as { id: string; name: string; display_name: string; language: string; category: string }[]} />;
}
