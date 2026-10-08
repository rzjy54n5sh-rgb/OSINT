#!/usr/bin/env node
/**
 * Post-deploy skew check: fetch each page exactly as a browser would (same URL => same Workers
 * Cache key, so a stale cached copy is what we test), collect every /_next/static .js/.css URL it
 * references and confirm each one answers 200 from the live deployment.
 *
 *   node scripts/check-deployed-assets.mjs [baseUrl] [path ...]
 *
 * Exit 0 = every referenced asset exists; exit 1 = at least one page points at a missing asset
 * (HTML from another build) or a page failed. Used by .github/workflows/deploy.yml after the
 * Workers Cache purge; also handy by hand during an incident. No dependencies (Node >= 18).
 * Cost: ~1 request per page + 1 per distinct asset (~30-60 Worker requests in total).
 */

const DEFAULT_BASE = 'https://mena-intel-desk.mores-cohorts9x.workers.dev';
// Public, cacheable pages (ISR); the fully static ones are the ones that used to get a 1-year TTL.
const DEFAULT_PATHS = [
  '/', '/warroom', '/countries', '/scenarios', '/feed', '/markets', '/nai', '/social',
  '/briefings', '/methodology', '/sources', '/mediaroom', '/contact', '/login',
];
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 mena-deploy-check';

const [baseArg, ...pathArgs] = process.argv.slice(2);
const base = (baseArg || process.env.SITE_URL || DEFAULT_BASE).replace(/\/+$/, '');
const paths = pathArgs.length ? pathArgs : DEFAULT_PATHS;

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'manual' });
  return res;
}

const assetStatus = new Map();
async function checkAsset(path) {
  if (!assetStatus.has(path)) {
    assetStatus.set(
      path,
      get(base + path)
        .then(async (r) => {
          await r.arrayBuffer().catch(() => {});
          return r.status;
        })
        .catch(() => 0)
    );
  }
  return assetStatus.get(path);
}

let failed = 0;
for (const p of paths) {
  let res;
  try {
    res = await get(base + p);
  } catch (err) {
    console.log(`FAIL ${p}: fetch error ${err?.message ?? err}`);
    failed++;
    continue;
  }
  const html = await res.text();
  const cacheStatus = res.headers.get('cf-cache-status') ?? '-';
  const age = res.headers.get('age') ?? '-';
  if (res.status >= 300 && res.status < 400) {
    console.log(`skip ${p}: ${res.status} redirect`);
    continue;
  }
  if (res.status !== 200) {
    console.log(`FAIL ${p}: HTTP ${res.status}`);
    failed++;
    continue;
  }
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+?\.(?:js|css)/g) ?? [])];
  const statuses = await Promise.all(assets.map(async (a) => [a, await checkAsset(a)]));
  const missing = statuses.filter(([, s]) => s !== 200);
  const tag = `${p} (cf-cache-status=${cacheStatus} age=${age} cache-control="${res.headers.get('cache-control') ?? ''}")`;
  if (assets.length === 0) {
    console.log(`FAIL ${tag}: no /_next/static assets found in HTML`);
    failed++;
  } else if (missing.length) {
    console.log(`FAIL ${tag}: ${missing.length}/${assets.length} assets missing`);
    for (const [a, s] of missing) console.log(`     ${s} ${a}`);
    failed++;
  } else {
    console.log(`ok   ${tag}: ${assets.length} assets`);
  }
}

if (failed) {
  console.log(`\n${failed} page(s) reference assets that the live deployment does not serve.`);
  process.exit(1);
}
console.log('\nAll pages reference assets that exist in the live deployment.');
