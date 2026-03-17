import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { SubscriptionsClient } from '@/components/admin/SubscriptionsClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminSubscriptionsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('subscriptions', role)) redirect('/admin');

  const { data: subs } = await adminClient.from('subscriptions').select('id, user_id, plan, status, currency, amount, current_period_end, stripe_subscription_id').in('status', ['active', 'trialing', 'past_due', 'canceled']).order('created_at', { ascending: false });
  const userIds = [...new Set((subs ?? []).map((s) => (s as { user_id: string }).user_id))];
  const { data: users } = userIds.length > 0 ? await adminClient.from('users').select('id, email').in('id', userIds) : { data: [] };
  const emailByUserId: Record<string, string> = {};
  for (const u of users ?? []) emailByUserId[(u as { id: string }).id] = (u as { email: string }).email;

  const STRIPE_DASH = process.env.NEXT_PUBLIC_STRIPE_DASHBOARD_URL || 'https://dashboard.stripe.com';
  return (
    <SubscriptionsClient
      subscriptions={(subs ?? []) as { id: string; user_id: string; plan: string; status: string; currency: string; amount?: number; current_period_end?: string; stripe_subscription_id?: string }[]}
      emailByUserId={emailByUserId}
      role={role}
      stripeDashboardUrl={STRIPE_DASH}
    />
  );
}
