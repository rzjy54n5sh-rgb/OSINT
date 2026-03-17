import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getConflictDay } from '@/utils/supabase/server';
import { NaiClient } from '@/components/admin/NaiClient';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';

export default async function AdminNaiPage() {
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
  if (!canAccess('nai', role)) redirect('/admin');

  const currentDay = await getConflictDay();

  const [scoresToday, scoresPrev] = await Promise.all([
    adminClient.from('nai_scores').select('*').eq('conflict_day', currentDay).order('country_code'),
    adminClient.from('nai_scores').select('country_code, expressed_score').eq('conflict_day', Math.max(1, currentDay - 1)),
  ]);

  const prevMap = new Map((scoresPrev.data ?? []).map((r) => [r.country_code, r.expressed_score]));

  const scoresWithVelocity = (scoresToday.data ?? []).map((row) => {
    const prev = prevMap.get(row.country_code);
    const curr = row.expressed_score ?? 0;
    let velocity: 'up' | 'down' | 'stable' = 'stable';
    if (prev != null && curr > prev) velocity = 'up';
    else if (prev != null && curr < prev) velocity = 'down';
    return { ...row, velocity };
  });

  return (
    <NaiClient
      initialConflictDay={currentDay}
      initialScores={scoresWithVelocity as { country_code: string; expressed_score: number; latent_score?: number; gap_size?: number; category?: string; velocity: string }[]}
    />
  );
}
