import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { DashboardClient } from '@/components/admin/DashboardClient';
import type { AdminRole } from '@/types';

export default async function AdminDashboardPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient
    .from('admin_users')
    .select('id, role, is_active')
    .eq('user_id', user.id)
    .single();

  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;

  const [
    conflictDayResult,
    usersByTier,
    subsResult,
    latestRun,
    disputesCount,
    alertsResult,
    scenarioResult,
    auditResult,
    failingSourcesResult,
  ] = await Promise.all([
    adminClient.rpc('get_current_conflict_day'),
    adminClient.from('users').select('tier').eq('is_suspended', false),
    adminClient
      .from('subscriptions')
      .select('currency, amount, status')
      .in('status', ['active', 'trialing']),
    adminClient
      .from('pipeline_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminClient.from('disputes').select('id', { count: 'exact', head: true }).is('admin_action', null),
    adminClient.from('platform_alerts').select('key, title, message, is_active').eq('is_active', true),
    adminClient.rpc('get_current_conflict_day').then(async (dayRes) => {
      const cd = Array.isArray(dayRes.data) ? dayRes.data[0] : dayRes.data;
      const day = typeof cd === 'number' ? cd : 0;
      const { data } = await adminClient
        .from('scenario_probabilities')
        .select('*')
        .eq('conflict_day', day)
        .maybeSingle();
      return data;
    }),
    role === 'SUPER_ADMIN'
      ? adminClient
          .from('admin_audit_log')
          .select('id, admin_id, admin_role, action_type, action_summary, created_at, is_ai_request')
          .order('created_at', { ascending: false })
          .limit(10)
          .then((r) => r.data ?? [])
      : adminClient
          .from('admin_audit_log')
          .select('id, admin_id, admin_role, action_type, action_summary, created_at, is_ai_request')
          .eq('admin_id', adminUser.id)
          .order('created_at', { ascending: false })
          .limit(10)
          .then((r) => r.data ?? []),
    adminClient
      .from('article_sources')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .in('health_status', ['failing', 'timeout', 'blocked']),
  ]);

  const conflictDay = Array.isArray(conflictDayResult.data) ? conflictDayResult.data[0] : conflictDayResult.data;
  const conflictDayNum = typeof conflictDay === 'number' ? conflictDay : 0;

  const tierCounts = { free: 0, informed: 0, professional: 0 };
  for (const r of usersByTier.data ?? []) {
    const t = (r as { tier: string }).tier;
    if (t in tierCounts) (tierCounts as Record<string, number>)[t]++;
  }

  const mrrByCurrency: Record<string, number> = {};
  for (const s of subsResult.data ?? []) {
    const cur = (s as { currency: string }).currency?.toLowerCase() || 'usd';
    const amt = (s as { amount?: number }).amount ?? 0;
    mrrByCurrency[cur] = (mrrByCurrency[cur] || 0) + (typeof amt === 'number' ? amt : 0);
  }

  const pricingSnapshot = await adminClient
    .from('platform_config')
    .select('key, value')
    .like('key', 'price_%')
    .in('key', ['price_informed_usd', 'price_pro_usd', 'price_report_usd']);

  const recentUsers = await adminClient
    .from('users')
    .select('id, email, display_name, tier, created_at')
    .order('created_at', { ascending: false })
    .limit(4);

  return (
    <DashboardClient
      role={role}
      conflictDay={conflictDayNum}
      tierCounts={tierCounts}
      mrrByCurrency={mrrByCurrency}
      latestRun={latestRun.data as import('@/types').PipelineRun | null}
      openDisputesCount={disputesCount.count ?? 0}
      alerts={(alertsResult.data ?? []) as import('@/types').PlatformAlert[]}
      scenarioProbabilities={scenarioResult as { scenario_a?: number; scenario_b?: number; scenario_c?: number } | null}
      auditEntries={(auditResult as unknown) as { id: string; action_type: string; action_summary: string; created_at: string; is_ai_request?: boolean }[]}
      failingSourcesCount={failingSourcesResult.count ?? 0}
      pricingSnapshot={(pricingSnapshot.data ?? []) as { key: string; value: unknown }[]}
      recentUsers={(recentUsers.data ?? []) as { id: string; email: string; display_name?: string; tier: string; created_at: string }[]}
    />
  );
}
