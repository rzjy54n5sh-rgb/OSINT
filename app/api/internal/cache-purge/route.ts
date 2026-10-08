/**
 * POST /api/internal/cache-purge — purge this Worker's Workers Cache (purgeEverything).
 *
 * Called by .github/workflows/deploy.yml right after `wrangler deploy`. Workers Cache has no
 * REST/zone purge (the cache belongs to the Worker, workers.dev is zoneless): the documented way
 * is `ctx.cache.purge()` from inside the Worker, and the docs suggest exactly this pattern —
 * "after each deploy, hit a small Worker endpoint from your CI that calls
 * ctx.cache.purge({ purgeEverything: true })".
 * https://developers.cloudflare.com/workers/cache/cache-keys/#purge-everything-after-deploy
 * https://developers.cloudflare.com/workers/cache/purge/
 *
 * Why it is needed even though the Worker version is part of the cache key by default:
 * on 2026-10-08 /warroom HTML produced by the previous version was written to the cache 5 s
 * after the new version went live and was then served by the new version (whose assets no
 * longer contain that HTML's chunks). Purging after the rollout has settled removes any such
 * entry.
 *
 * Auth: `Authorization: Bearer <CACHE_PURGE_SECRET>`. The secret is generated per deploy run and
 * uploaded with that deployment (`wrangler deploy --secrets-file`), so there is nothing to set up
 * by hand. Requests with an Authorization header and POST requests are never cached.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

type PurgeOptions = { purgeEverything: true } | { tags?: string[]; pathPrefixes?: string[] };
type PurgeResult = { success?: boolean; errors?: { code?: number; message?: string }[] };
type WorkersCacheCtx = { cache?: { purge(options: PurgeOptions): Promise<PurgeResult | undefined> } };

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function configuredSecret(): string {
  try {
    const { env } = getCloudflareContext();
    const fromBinding = (env as unknown as Record<string, unknown>).CACHE_PURGE_SECRET;
    if (typeof fromBinding === 'string' && fromBinding) return fromBinding;
  } catch {
    // not running on Workers (next dev / next start)
  }
  return process.env.CACHE_PURGE_SECRET ?? '';
}

export async function POST(request: Request) {
  const secret = configuredSecret();
  // Short secrets are refused so an empty/placeholder value can never authorise a purge.
  if (secret.length < 32) {
    return Response.json({ ok: false, error: 'purge not configured' }, { status: 503, headers: NO_STORE });
  }
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!timingSafeEqual(token, secret)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }

  let ctx: WorkersCacheCtx | undefined;
  try {
    ctx = getCloudflareContext().ctx as unknown as WorkersCacheCtx;
  } catch {
    ctx = undefined;
  }
  if (!ctx?.cache || typeof ctx.cache.purge !== 'function') {
    return Response.json(
      { ok: false, error: 'ctx.cache.purge unavailable (Workers Cache disabled or not on Workers)' },
      { status: 501, headers: NO_STORE }
    );
  }

  try {
    // Result shape: https://developers.cloudflare.com/workers/cache/purge/#return-value
    // (rate limits are always the Free-tier purge limits; a rate-limited purge has success=false).
    const result = await ctx.cache.purge({ purgeEverything: true });
    if (!result?.success) {
      return Response.json({ ok: false, errors: result?.errors ?? [] }, { status: 502, headers: NO_STORE });
    }
    return Response.json({ ok: true, purged: 'everything' }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 502, headers: NO_STORE });
  }
}
