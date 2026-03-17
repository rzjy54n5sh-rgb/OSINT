import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { PricingClient } from '@/components/admin/PricingClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

const PRICING_KEYS = [
  'price_informed_usd', 'price_informed_aed', 'price_informed_egp',
  'stripe_price_id_informed_usd', 'stripe_price_id_informed_aed', 'stripe_price_id_informed_egp',
  'price_pro_usd', 'price_pro_aed', 'price_pro_egp',
  'stripe_price_id_pro_usd', 'stripe_price_id_pro_aed', 'stripe_price_id_pro_egp',
  'price_report_usd', 'price_report_aed', 'price_report_egp',
  'stripe_price_id_report_usd', 'stripe_price_id_report_aed', 'stripe_price_id_report_egp',
  'trial_days',
];

export default async function AdminPricingPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('pricing', role)) redirect('/admin');

  const { data: rows } = await adminClient.from('platform_config').select('key, value, description, is_sensitive').in('key', PRICING_KEYS);
  const configMap: Record<string, { value: unknown; description?: string; is_sensitive?: boolean }> = {};
  for (const r of rows ?? []) {
    const row = r as { key: string; value: unknown; description?: string; is_sensitive?: boolean };
    configMap[row.key] = { value: row.value, description: row.description, is_sensitive: row.is_sensitive };
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Pricing</h1>
      <div className="rounded border p-4 mb-6 font-mono text-xs" style={{ borderColor: 'var(--accent-gold)', background: 'rgba(232,197,71,0.06)' }}>
        <strong>Warning:</strong> Stripe Price IDs must be created in Stripe Dashboard first. After saving IDs here, test a checkout before switching to live mode.{' '}
        <Link href="/docs/stripe-setup" className="underline" style={{ color: 'var(--accent-gold)' }}>docs/stripe-setup.md</Link>
      </div>
      <PricingClient initialConfig={configMap} />
    </div>
  );
}
