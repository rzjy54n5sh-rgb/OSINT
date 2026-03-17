import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { DisputesClient } from '@/components/admin/DisputesClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminDisputesPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('disputes', role)) redirect('/admin');

  const { data: disputes } = await adminClient.from('disputes').select('id, article_id, article_url, claim_text, source_url, submitted_at, admin_action').is('admin_action', null).order('submitted_at', { ascending: false });

  return (
    <DisputesClient
      disputes={(disputes ?? []) as { id: string; article_id: string; article_url: string | null; claim_text: string; source_url: string; submitted_at: string; admin_action: string | null }[]}
      adminUserId={adminUser.id}
    />
  );
}
