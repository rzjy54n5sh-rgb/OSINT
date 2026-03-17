'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function refundPaymentAction(paymentId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, role, email').eq('user_id', user.id).single();
  if (!adminUser?.id) return { ok: false, error: 'Forbidden' };
  const role = adminUser.role as string;
  if (role !== 'SUPER_ADMIN') return { ok: false, error: 'Forbidden' };

  const { data: payment } = await admin.from('payments').select('id, amount, currency, status, stripe_charge_id').eq('id', paymentId).maybeSingle();
  if (!payment) return { ok: false, error: 'Payment not found' };
  if ((payment as { status: string }).status !== 'succeeded') return { ok: false, error: 'Only succeeded payments can be refunded' };

  const stripeChargeId = (payment as { stripe_charge_id: string | null }).stripe_charge_id;
  if (stripeChargeId) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (secret) {
      const body = new URLSearchParams({ charge: stripeChargeId, reason: 'requested_by_customer' });
      if (reason.trim()) body.set('metadata[admin_refund_reason]', reason.slice(0, 500));
      const res = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: (err as { error?: { message?: string } })?.error?.message || res.statusText };
      }
    }
  }

  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: role,
    admin_email: adminUser.email ?? user.email,
    action_type: 'PAYMENT_REFUND_INITIATE',
    action_summary: `Refund initiated for payment ${paymentId}: ${reason.slice(0, 200)}`,
    target_type: 'payment',
    target_id: paymentId,
    after_state: { reason: reason.slice(0, 500), stripe_charge_id: stripeChargeId || null },
  });
  revalidatePath('/admin/payments');
  return { ok: true };
}
