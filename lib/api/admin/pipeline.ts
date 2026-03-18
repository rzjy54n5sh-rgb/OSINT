import { adminFetch } from '@/lib/api/admin/client';
import type { PipelineRun } from '@/types';

export type PipelineState = {
  pipelineRuns: PipelineRun[];
  failingSources: { id: string; name: string; display_name: string; health_status: string }[];
  currentConflictDay: number;
};

export async function getPipelineState(token: string): Promise<PipelineState> {
  const data = await adminFetch<PipelineState>('admin-pipeline', { token });
  return {
    pipelineRuns: data?.pipelineRuns ?? [],
    failingSources: data?.failingSources ?? [],
    currentConflictDay: data?.currentConflictDay ?? 0,
  };
}

export async function getPipelineRuns(
  token: string,
  limit?: number
): Promise<PipelineRun[]> {
  const state = await getPipelineState(token);
  const runs = state.pipelineRuns;
  return limit !== undefined ? runs.slice(0, limit) : runs;
}

export async function triggerPipeline(
  stage: string,
  token: string,
  payload?: { conflictDay?: number } & Record<string, unknown>
): Promise<{ runId: string }> {
  return adminFetch<{ runId: string }>('admin-pipeline', {
    method: 'POST',
    token,
    body: { stage, conflictDay: payload?.conflictDay, ...(payload ?? {}) },
  });
}

export async function updatePipelineSchedule(
  cron: string,
  token: string
): Promise<void> {
  await adminFetch('admin-pipeline', {
    method: 'POST',
    token,
    body: { action: 'schedule', cron },
  });
}
