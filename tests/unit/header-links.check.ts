/**
 * Header and footer links (design system v2 header): every href resolves to an existing app route,
 * and every route the old header linked to is still reachable from the header or the footer.
 *
 *   npx --yes tsx tests/unit/header-links.check.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = join(__dirname, '../..');
const app = join(root, 'app');

/** App routes from app/**\/page.tsx and route.ts (route groups "(x)" removed). */
function routes(dir: string, out = new Set<string>()): Set<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (/^(page|route)\.tsx?$/.test(name)) {
      const segs = relative(app, dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s));
      out.add('/' + segs.join('/'));
    }
  }
  return out;
}
const ROUTES = routes(app);
const resolves = (href: string) => {
  const path = href.split('#')[0].split('?')[0] || '/';
  return ROUTES.has(path === '' ? '/' : path);
};

const header = readFileSync(join(root, 'components/CommandHeader.tsx'), 'utf8');
const footer = readFileSync(join(root, 'components/SiteFooter.tsx'), 'utf8') + readFileSync(join(root, 'components/trust/trust-links.ts'), 'utf8');
const hrefs = (src: string) => [...src.matchAll(/href(?:=|:\s*)["']([^"']+)["']/g)].map((m) => m[1]).filter((h) => h.startsWith('/'));

let n = 0;
const headerHrefs = hrefs(header);
assert.ok(headerHrefs.length >= 20, `only ${headerHrefs.length} header hrefs found`);
for (const h of [...headerHrefs, ...hrefs(footer)]) {
  assert.ok(resolves(h), `dead link: ${h}`);
  n++;
}
console.log(`ok   ${n} header/footer hrefs resolve to app routes`);

// Routes the pre-v2 header linked to (CommandHeader NAV_GROUPS + account menu, 2026-10-13).
const BEFORE = [
  '/warroom', '/briefings', '/mediaroom', '/feed', '/nai', '/countries', '/scenarios', '/disinfo', '/markets', '/social',
  '/analytics', '/pricing', '/methodology', '/sources', '/timeline', '/api-docs', '/contact', '/login', '/account', '/admin',
];
const reachable = new Set([...headerHrefs, ...hrefs(footer)].map((h) => h.split('#')[0]));
for (const r of BEFORE) assert.ok(reachable.has(r), `route dropped from the header: ${r}`);
console.log(`ok   all ${BEFORE.length} routes of the previous header are still linked`);
console.log('\nall checks passed');
