/**
 * Client safety net for "HTML from build A, assets from build B" (deployment skew).
 *
 * Incident 2026-10-08: Workers Cache served /warroom HTML written by the previous Worker
 * version. Its /_next/static chunk URLs no longer existed in the current version's assets
 * (each Worker version serves only its own asset manifest), so the page rendered unstyled or
 * fell into app/global-error.tsx ("Something went wrong").
 *
 * Recovery: when a /_next/static script or stylesheet fails to load, or a ChunkLoadError
 * surfaces, do ONE hard reload of the same URL with a cache-busting `__v` query param. The
 * Workers Cache key is path + query string, so the reload is a cache MISS and the current
 * Worker version renders fresh HTML that matches its own assets.
 *
 * Loop guards (any one stops a reload):
 *   1. the URL already carries `__v` (this load IS the retry);
 *   2. a recovery reload happened in this tab in the last 10 minutes (sessionStorage).
 * After a clean load the `__v` param is removed from the address bar (history.replaceState
 * keeps Next's router state), so shared links stay clean.
 *
 * Written as plain ES5 and inlined in <head> (app/layout.tsx); it does not depend on any chunk.
 * CSP already allows inline scripts (see lib/security-headers.ts). React hoists stylesheets and
 * async chunk <script>s ABOVE it, so their error events can fire before this listener exists;
 * the `load` handler therefore re-checks: stylesheets whose `sheet` is null, a webpack runtime
 * that never initialised (its file is replaced whenever the chunk map changes), and Resource
 * Timing `responseStatus` >= 400 where the browser exposes it. Page/layout chunks are also
 * re-requested by webpack itself (a fresh <script> whose error this listener does see), and
 * ChunkLoadErrors that React catches are routed here by app/global-error.tsx.
 */

export const STALE_BUILD_PARAM = '__v';

/** window global that app/global-error.tsx calls for ChunkLoadErrors caught by React. */
export const STALE_BUILD_RECOVER_GLOBAL = '__menaRecoverStaleBuild';

export const STALE_BUILD_RECOVERY_SCRIPT = `(function(){
var P=${JSON.stringify(STALE_BUILD_PARAM)},K='mena-stale-build-reload',W=600000,done=false,seen=false;
function chunkErr(x){if(!x)return false;var n=x.name||'',m=String(x.message||x);
return n==='ChunkLoadError'||/Loading (CSS )?chunk [^ ]+ failed/i.test(m)||/Failed to fetch dynamically imported module/i.test(m);}
function recover(reason){seen=true;if(done)return false;var u;
try{u=new URL(location.href);}catch(e){return false;}
if(u.searchParams.has(P))return false;
try{var last=+(sessionStorage.getItem(K)||0);if(Date.now()-last<W)return false;sessionStorage.setItem(K,String(Date.now()));}catch(e){}
done=true;u.searchParams.set(P,Date.now().toString(36));
try{console.warn('[stale-build] '+reason+': reloading once from a fresh cache key');}catch(e){}
location.replace(u.toString());return true;}
window[${JSON.stringify(STALE_BUILD_RECOVER_GLOBAL)}]=recover;
function isBuildAsset(t){if(!t||!t.tagName)return'';var tag=t.tagName,url='';
if(tag==='SCRIPT')url=t.src||'';
else if(tag==='LINK'&&(/stylesheet/i.test(t.rel)||(/preload/i.test(t.rel)&&/^(script|style)$/i.test(t.as||''))))url=t.href||'';
return url.indexOf('/_next/static/')>-1?url:'';}
addEventListener('error',function(e){var t=e.target;
if(t&&t!==window){var url=isBuildAsset(t);if(url)recover('asset failed to load '+url);return;}
if(chunkErr(e.error||e.message))recover('ChunkLoadError');},true);
addEventListener('unhandledrejection',function(e){if(chunkErr(e.reason))recover('ChunkLoadError');});
addEventListener('load',function(){
try{var ls=document.querySelectorAll('link[rel="stylesheet"][href*="/_next/static/"]');for(var j=0;j<ls.length;j++){if(!ls[j].sheet){recover('stylesheet failed '+ls[j].href);return;}}}catch(e){}
try{var q=self.webpackChunk_N_E;if(document.querySelector('script[src*="/_next/static/chunks/webpack-"]')&&(!q||q.push===Array.prototype.push)){recover('webpack runtime missing');return;}}catch(e){}
try{var es=performance.getEntriesByType('resource');for(var i=0;i<es.length;i++){var r=es[i];if(r.responseStatus>=400&&r.name.indexOf('/_next/static/')>-1&&/\\.(js|css)(\\?|$)/.test(r.name)){recover('asset HTTP '+r.responseStatus+' '+r.name);return;}}}catch(e){}
setTimeout(function(){if(seen||done)return;try{var u=new URL(location.href);if(!u.searchParams.has(P))return;u.searchParams.delete(P);history.replaceState(history.state,'',u.pathname+u.search+u.hash);}catch(e){}},1500);
});
})();`;

/** For React error boundaries: is this the error webpack throws when a chunk 404s? */
export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  const msg = typeof message === 'string' ? message : '';
  return (
    name === 'ChunkLoadError' ||
    /Loading (CSS )?chunk [^ ]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg)
  );
}

/** Calls the inline recovery (same loop guards). Returns true when a reload was started. */
export function recoverFromStaleBuild(reason: string): boolean {
  if (typeof window === 'undefined') return false;
  const fn = (window as unknown as Record<string, unknown>)[STALE_BUILD_RECOVER_GLOBAL];
  return typeof fn === 'function' ? Boolean((fn as (r: string) => boolean)(reason)) : false;
}
