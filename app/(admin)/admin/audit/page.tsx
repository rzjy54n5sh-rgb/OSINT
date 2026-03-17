import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { AuditClient } from '@/components/admin/AuditClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

const AUDIT_ACTION_TYPES = [
  'PIPELINE_TRIGGER', 'PIPELINE_SCHEDULE_CHANGE', 'NAI_SCORE_OVERRIDE', 'COUNTRY_REPORT_REGEN',
  'RSS_SOURCE_ADD', 'RSS_SOURCE_EDIT', 'RSS_SOURCE_TOGGLE', 'RSS_SOURCE_DELETE',
  'ALERT_BANNER_TOGGLE', 'ALERT_BANNER_EDIT', 'USER_TIER_OVERRIDE', 'USER_SUSPEND', 'USER_UNSUSPEND',
  'SUBSCRIPTION_CANCEL', 'SUBSCRIPTION_PAUSE', 'SUBSCRIPTION_REFUND', 'API_KEY_REVOKE', 'API_KEY_GENERATE_TEST',
  'DISPUTE_ACCEPT', 'DISPUTE_REJECT', 'PRICING_CONFIG_CHANGE', 'TIER_FEATURE_TOGGLE', 'PAYMENT_REFUND_INITIATE',
  'PLATFORM_CONFIG_CHANGE', 'ADMIN_USER_CREATE', 'ADMIN_USER_DEACTIVATE', 'ADMIN_ROLE_ASSIGN', 'ADMIN_ROLE_REVOKE',
  'AI_AGENT_REQUEST', 'AI_AGENT_CONFIRMED', 'AI_AGENT_REJECTED', 'ARTICLE_FLAGGED_FOR_REVIEW',
];

export default async function AdminAuditPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('audit', role)) redirect('/admin');

  return (
    <AuditClient
      role={role}
      actionTypes={AUDIT_ACTION_TYPES}
    />
  );
}
