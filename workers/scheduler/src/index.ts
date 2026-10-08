/**
 * mena-intel-scheduler — reliable clock for the GitHub Actions collectors (WS4).
 *
 * Cron Triggers (UTC, wrangler.jsonc) → POST /repos/{owner}/{repo}/actions/workflows/{file}/dispatches
 * (GitHub REST "Create a workflow dispatch event": body {ref}, 204 No Content on success; fine-grained
 * token with repository permission "Actions: Read and write").
 *
 *   "*\/30 * * * *"  → collect-markets.yml every run; collect-articles.yml on the :00 run
 *   "20 5 * * *"     → scenario-daily.yml
 *
 * The GitHub `schedule:` triggers remain as a fallback (each workflow's `gate` job skips a late
 * scheduled run when a dispatched run already covered the slot). Lateness is caught independently
 * by the pg_cron watchdog over public.job_heartbeats (supabase/migrations/20261010090100).
 *
 * Budget per day: 49 invocations, 73 dispatch subrequests (max 2 per invocation, +1 retry each, +1
 * Telegram on failure: ≤ 5 of the 50 allowed), well under 1 ms CPU each.
 */

import { runCron, type SchedulerEnv } from './dispatch';

const handler: ExportedHandler<SchedulerEnv> = {
  async scheduled(controller, env) {
    // Awaited (not waitUntil) so a failed dispatch fails this invocation visibly.
    await runCron(env, controller.cron, controller.scheduledTime);
  },
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};

export default handler;
