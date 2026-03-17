import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { PaymentsClient } from '@/components/admin/PaymentsClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminPaymentsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('payments', role)) redirect('/admin');

  // MRR: sum of subscription amount per currency (active + trialing only), NOT converted
  const { data: mrrRows } = await adminClient.from('subscriptions').select('currency, amount').in('status', ['active', 'trialing']);
  const mrrUsd = (mrrRows ?? []).filter((r) => (r as { currency: string }).currency === 'usd').reduce((s, r) => s + ((r as { amount: number | null }).amount ?? 0), 0);
  const mrrAed = (mrrRows ?? []).filter((r) => (r as { currency: string }).currency === 'aed').reduce((s, r) => s + ((r as { amount: number | null }).amount ?? 0), 0);
  const mrrEgp = (mrrRows ?? []).filter((r) => (r as { currency: string }).currency === 'egp').reduce((s, r) => s + ((r as { amount: number | null }).amount ?? 0), 0);

  const { data: payments } = await adminClient.from('payments').select('id, user_id, type, amount, currency, status, description, stripe_payment_intent_id, stripe_charge_id, created_at').order('created_at', { ascending: false }).limit(500);
  const userIds = [...new Set((payments ?? []).map((p) => (p as { user_id: string }).user_id))];
  const { data: users } = userIds.length > 0 ? await adminClient.from('users').select('id, email').in('id', userIds) : { data: [] };
  const emailByUserId: Record<string, string> = {};
  for (const u of users ?? []) emailByUserId[(u as { id: string }).id] = (u as { email: string }).email;

  const STRIPE_DASH = process.env.NEXT_PUBLIC_STRIPE_DASHBOARD_URL || 'https://dashboard.stripe.com';

  return (
    <PaymentsClient
      mrr={{ usd: mrrUsd, aed: mrrAed, egp: mrrEgp }}
      payments={(payments ?? []) as { id: string; user_id: string; type: string; amount: number; currency: string; status: string; description: string | null; stripe_payment_intent_id: string | null; stripe_charge_id: string | null; created_at: string }[]}
      emailByUserId={emailByUserId}
      role={role}
      stripeDashboardUrl={STRIPE_DASH}
    />
  );
}
