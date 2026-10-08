/**
 * Scheduling logic for mena-intel-scheduler (imported by index.ts). Kept separate because a
 * Worker entry module may only export handlers.
 */

export interface SchedulerEnv {
  GH_OWNER: string;
  GH_REPO: string;
  GH_REF: string;
  GITHUB_API: string;
  DISPATCH_ENABLED: string;
  GH_DISPATCH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export const CRON_HALF_HOURLY = '*/30 * * * *';
export const CRON_SCENARIO = '20 5 * * *';

/** Workflow files to dispatch for one cron firing. Pure, so it can be unit-tested. */
export function workflowsFor(cron: string, scheduledTime: number): string[] {
  if (cron === CRON_SCENARIO) return ['scenario-daily.yml'];
  if (cron === CRON_HALF_HOURLY) {
    const minute = new Date(scheduledTime).getUTCMinutes();
    return minute < 30 ? ['collect-markets.yml', 'collect-articles.yml'] : ['collect-markets.yml'];
  }
  return [];
}

type Outcome = { workflow: string; status: number; ok: boolean; detail: string };

async function dispatchOnce(env: SchedulerEnv, workflow: string): Promise<Outcome> {
  const url = `${env.GITHUB_API.replace(/\/$/, '')}/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${workflow}/dispatches`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mena-intel-scheduler',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: env.GH_REF }),
    });
    const ok = res.status === 204 || res.status === 200;
    const detail = ok ? '' : (await res.text()).slice(0, 200);
    return { workflow, status: res.status, ok, detail };
  } catch (e) {
    return { workflow, status: 0, ok: false, detail: String(e).slice(0, 200) };
  }
}

async function dispatch(env: SchedulerEnv, workflow: string): Promise<Outcome> {
  const first = await dispatchOnce(env, workflow);
  // One retry for transient failures only (network, 5xx, secondary rate limit); a 401/403/404/422
  // is a configuration error that a retry cannot fix.
  if (first.ok || !(first.status === 0 || first.status >= 500 || first.status === 429)) return first;
  await new Promise((r) => setTimeout(r, 2000));
  return dispatchOnce(env, workflow);
}

async function notifyTelegram(env: SchedulerEnv, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
  } catch {
    // Alerting must never mask the original failure.
  }
}

export async function runCron(env: SchedulerEnv, cron: string, scheduledTime: number): Promise<Outcome[]> {
  const workflows = workflowsFor(cron, scheduledTime);
  const at = new Date(scheduledTime).toISOString();
  if (env.DISPATCH_ENABLED !== 'true') {
    console.log(JSON.stringify({ at, cron, skipped: 'DISPATCH_ENABLED is not "true"', workflows }));
    return [];
  }
  if (!env.GH_DISPATCH_TOKEN) {
    throw new Error('GH_DISPATCH_TOKEN secret is not set; nothing dispatched');
  }
  const outcomes = await Promise.all(workflows.map((w) => dispatch(env, w)));
  for (const o of outcomes) console.log(JSON.stringify({ at, cron, ...o }));
  const failed = outcomes.filter((o) => !o.ok);
  if (failed.length) {
    const summary = failed.map((o) => `${o.workflow}: HTTP ${o.status} ${o.detail}`).join('; ');
    await notifyTelegram(env, `MENA Intel Desk scheduler: dispatch failed at ${at} — ${summary}`);
    // Throwing marks the invocation as failed in the Workers dashboard / logs.
    throw new Error(`dispatch failed: ${summary}`);
  }
  return outcomes;
}
