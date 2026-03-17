import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { TierFeaturesClient } from '@/components/admin/TierFeaturesClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';
import type { TierFeature } from '@/types';

export default async function AdminTierFeaturesPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('tier-features', role)) redirect('/admin');

  const { data: features } = await adminClient.from('tier_features').select('feature_key, description, free_access, informed_access, pro_access').order('feature_key');
  const list = (features ?? []) as TierFeature[];

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Tier Features</h1>
      <TierFeaturesClient initialFeatures={list} />
      <p className="font-mono text-[10px] mt-6" style={{ color: 'var(--text-muted)' }}>
        Changes take effect immediately for new page loads. Active sessions refresh on next auth token refresh.
      </p>
    </div>
  );
}
