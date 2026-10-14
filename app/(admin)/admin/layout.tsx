import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import AgentPanel from '@/components/admin/AgentPanel';
import { AdminNotificationBanner } from '@/components/admin/AdminNotificationBanner';
import { AdminThemeLock } from '@/components/admin/AdminThemeLock';
import type { AdminRole } from '@/types';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirect=/admin');

  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient
    .from('admin_users')
    .select('id, role, is_active')
    .eq('user_id', user.id)
    .single();

  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;

  const [disputesRes, sourcesRes] = await Promise.all([
    adminClient.from('disputes').select('id', { count: 'exact', head: true }).is('admin_action', null),
    adminClient
      .from('article_sources')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .in('health_status', ['failing', 'timeout', 'blocked']),
  ]);

  const disputeCount = disputesRes.count ?? 0;
  const failingSourcesCount = sourcesRes.count ?? 0;

  return (
    // Forced dark: the admin panel is not converted to the light theme (see AdminThemeLock).
    <div data-theme="dark" className="flex h-screen" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <AdminThemeLock />
      <AdminSidebar role={role} disputeCount={disputeCount} failingSourcesCount={failingSourcesCount} />
      <main className="flex-1 overflow-auto">
        <div style={{ position: 'fixed', top: 8, right: 80, zIndex: 50 }}>
          <AdminNotificationBanner />
        </div>
        {children}
      </main>
      <AgentPanel role={role} />
    </div>
  );
}
