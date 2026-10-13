/**
 * Home "Latest intelligence" shows in-scope items only (UX audit 2026-10-13, problem #3):
 *   - articles.content_json.scope.in_scope, when it is a boolean, decides (false = excluded, true = kept,
 *     even for a listed aggregator);
 *   - without a scope flag, only the explicitly listed off-theatre Telegram channels are excluded;
 *   - everything else is kept, order is preserved and the limit applies after filtering.
 *   npx --yes tsx@4.23.13 tests/unit/home-feed-scope.check.ts
 */
import assert from 'node:assert/strict';
import {
  HOME_FEED_EXCLUDED_SOURCES,
  articleScopeFlag,
  filterHomeFeed,
  isHomeFeedEligible,
} from '../../lib/home-feed';

type A = { id: string; source_name: string | null; content_json: Record<string, unknown> | null };
const a = (id: string, source_name: string | null, content_json: Record<string, unknown> | null = null): A => ({ id, source_name, content_json });

// scope flag reading
assert.equal(articleScopeFlag(a('1', 'X', { scope: { in_scope: false } })), false);
assert.equal(articleScopeFlag(a('1', 'X', { scope: { in_scope: true } })), true);
assert.equal(articleScopeFlag(a('1', 'X', null)), null);
assert.equal(articleScopeFlag(a('1', 'X', { scope: null })), null);
assert.equal(articleScopeFlag(a('1', 'X', { scope: { in_scope: 'false' } })), null, 'only a real boolean counts');
assert.equal(articleScopeFlag(a('1', 'X', { src: 'gdelt-gkg' })), null);

// explicit scope wins over the source list
assert.equal(isHomeFeedEligible(a('1', 'Al Jazeera', { scope: { in_scope: false } })), false);
assert.equal(isHomeFeedEligible(a('1', 'Intel Slava', { scope: { in_scope: true } })), true);

// no scope: the documented list only (case/whitespace-insensitive), everything else kept
assert.equal(isHomeFeedEligible(a('1', 'Intel Slava')), false);
assert.equal(isHomeFeedEligible(a('1', '  intel slava (osint) ')), false);
assert.equal(isHomeFeedEligible(a('1', 'Our Wars Today')), false);
assert.equal(isHomeFeedEligible(a('1', 'Rybar (Russian)')), false);
assert.equal(isHomeFeedEligible(a('1', 'Rybar (English)')), false);
assert.equal(isHomeFeedEligible(a('1', 'Middle East Eye')), true);
assert.equal(isHomeFeedEligible(a('1', 'TASS')), true, 'state media is labelled, not hidden');
assert.equal(isHomeFeedEligible(a('1', null)), true);

// every listed source carries a reason (the list is documented, not silent)
assert.ok(HOME_FEED_EXCLUDED_SOURCES.length >= 1);
for (const s of HOME_FEED_EXCLUDED_SOURCES) assert.ok(s.name.trim() && s.reason.trim().length > 20, `reason for ${s.name}`);

// filter + limit after filtering, order kept
const feed = [
  a('s1', 'Intel Slava'),
  a('s2', 'Intel Slava'),
  a('m1', 'Middle East Eye'),
  a('r1', 'Rybar (Russian)'),
  a('f1', 'France24', { scope: { in_scope: false } }),
  a('i1', 'IRNA English'),
  a('s3', 'Intel Slava', { scope: { in_scope: true } }),
  a('e1', 'Egypt Independent'),
];
assert.deepEqual(filterHomeFeed(feed, 3).map((x) => x.id), ['m1', 'i1', 's3']);
assert.deepEqual(filterHomeFeed(feed, 10).map((x) => x.id), ['m1', 'i1', 's3', 'e1']);
assert.deepEqual(filterHomeFeed([], 3), []);

console.log('home-feed-scope.check: all checks passed');
