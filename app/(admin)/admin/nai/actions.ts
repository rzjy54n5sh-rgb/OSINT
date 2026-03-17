'use server';

import { revalidatePath } from 'next/cache';
import { getUser, getConflictDay } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function updateNaiScoreAction(payload: {
  countryCode: string;
  conflictDay: number;
  expressedScore?: number;
  latentScore?: number;
  gapSize?: number;
  category?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Unauthorized' };

  const admin = createAdminClient();
  const { data: adminUser } = await admin
    .from('admin_users')
    .select('id, role, is_active')
    .eq('user_id', user.id)
    .single();

  if (!adminUser?.is_active) return { ok: false, error: 'Forbidden' };
  const role = adminUser.role as string;
  if (role !== 'SUPER_ADMIN' && role !== 'INTEL_ANALYST') return { ok: false, error: 'Forbidden' };

  const { countryCode, conflictDay, expressedScore, latentScore, gapSize, category } = payload;

  const { data: existing } = await admin
    .from('nai_scores')
    .select('*')
    .eq('country_code', countryCode)
    .eq('conflict_day', conflictDay)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    ...(existing as Record<string, unknown>),
    country_code: countryCode,
    conflict_day: conflictDay,
    updated_at: new Date().toISOString(),
  };
  if (expressedScore != null) updates.expressed_score = expressedScore;
  if (latentScore != null) updates.latent_score = latentScore;
  if (gapSize != null) updates.gap_size = gapSize;
  if (category != null) updates.category = category;
  if (!existing && expressedScore == null) updates.expressed_score = 0;

  const { error: upsertError } = await admin
    .from('nai_scores')
    .upsert(updates as Record<string, unknown>, { onConflict: 'country_code,conflict_day' });

  if (upsertError) return { ok: false, error: upsertError.message };

  const { data: profile } = await admin.from('admin_users').select('email').eq('id', adminUser.id).single();
  await admin.from('admin_audit_log').insert({
    admin_id: adminUser.id,
    admin_role: role,
    admin_email: (profile as { email?: string })?.email ?? user.email,
    action_type: 'NAI_SCORE_OVERRIDE',
    action_summary: `NAI score updated for ${countryCode} Day ${conflictDay}`,
    target_type: 'nai_score',
    target_id: `${countryCode}-${conflictDay}`,
    target_label: `${countryCode} Day ${conflictDay}`,
    after_state: payload,
  });

  revalidatePath('/admin/nai');
  return { ok: true };
}

export async function getNaiHistoryAction(countryCode: string): Promise<{ conflict_day: number; expressed_score: number; latent_score?: number }[]> {
  const user = await getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) return [];

  const conflictDay = await getConflictDay();
  const fromDay = Math.max(1, conflictDay - 13);
  const { data } = await admin
    .from('nai_scores')
    .select('conflict_day, expressed_score, latent_score')
    .eq('country_code', countryCode)
    .gte('conflict_day', fromDay)
    .lte('conflict_day', conflictDay)
    .order('conflict_day', { ascending: true });
  return (data ?? []) as { conflict_day: number; expressed_score: number; latent_score?: number }[];
}

export async function getNaiScoresForDayAction(conflictDay: number): Promise<{ country_code: string; expressed_score: number; latent_score?: number; gap_size?: number; category?: string; velocity: string }[]> {
  const user = await getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data: adminUser } = await admin.from('admin_users').select('id, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) return [];

  const prevDay = Math.max(1, conflictDay - 1);
  const [todayRes, prevRes] = await Promise.all([
    admin.from('nai_scores').select('*').eq('conflict_day', conflictDay).order('country_code'),
    admin.from('nai_scores').select('country_code, expressed_score').eq('conflict_day', prevDay),
  ]);
  const prevMap = new Map((prevRes.data ?? []).map((r) => [r.country_code, r.expressed_score]));
  return (todayRes.data ?? []).map((row) => {
    const prev = prevMap.get(row.country_code);
    const curr = row.expressed_score ?? 0;
    let velocity: 'up' | 'down' | 'stable' = 'stable';
    if (prev != null && curr > prev) velocity = 'up';
    else if (prev != null && curr < prev) velocity = 'down';
    return { ...row, velocity };
  }) as { country_code: string; expressed_score: number; latent_score?: number; gap_size?: number; category?: string; velocity: string }[];
}
