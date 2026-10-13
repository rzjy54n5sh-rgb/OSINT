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
  namesTrackedTheatre,
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

// a listed channel's in-theatre post is kept (titles as collected, 12-13 Oct 2026); Ukraine posts stay off
const t = (source_name: string, title: string) => ({ source_name, content_json: null, title, summary: null });
assert.equal(isHomeFeedEligible(t('Intel Slava', '🇾🇪 🇾🇪 ❌ 🇸🇦 — Riyadh, the capital of Saudi Arabia, is under Houthi ballistic missile attack.')), true);
assert.equal(isHomeFeedEligible(t('Rybar (Russian)', 'Медленно, но уверенно о ситуации к югу от Таиза Сегодняшний день принес хуситам ряд новых побед.')), true);
assert.equal(isHomeFeedEligible(t('Our Wars Today', 'Pentagon Finally Counts an Iran War Death')), true);
assert.equal(isHomeFeedEligible(t('Intel Slava', '🇷🇺 🇺🇦 ⚡️ — A large fire broke out near Bucha, Kiev Oblast, following a strike by jet-powered Geran drones.')), false);
assert.equal(isHomeFeedEligible(t('Intel Slava', 'Iranian-made Shahed drones hit Kharkiv overnight')), false, 'Ukraine marker wins');
assert.equal(namesTrackedTheatre(t('Intel Slava', 'Oman')), true);
assert.equal(namesTrackedTheatre(t('Intel Slava', 'Romania summons ambassador')), false, 'word boundary: "oman" inside "Romania"');
assert.equal(namesTrackedTheatre(t('Intel Slava', '')), false);
assert.equal(isHomeFeedEligible({ ...t('Intel Slava', 'Houthis strike Riyadh'), content_json: { scope: { in_scope: false } } }), false, 'scope flag still wins');

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
