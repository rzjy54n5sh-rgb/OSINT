/**
 * Checks for lib/article-count.ts: the header / War Room "articles in DB" figure now comes from
 * PostgREST's `count=estimated` (planner estimate above 1,000 rows) instead of an exact COUNT(*)
 * on every page view, so it must be shown as approximate. Plain assert script:
 *
 *   npx --yes tsx tests/unit/article-count.check.ts
 */
import assert from 'node:assert/strict';
import { formatArticleCount, ARTICLE_COUNT_EXACT_BELOW } from '../../lib/article-count';

let n = 0;
const ok = (label: string, fn: () => void) => {
  fn();
  n++;
  console.log(`PASS ${label}`);
};

ok('null / undefined / negative / NaN: an em dash, never 0', () => {
  assert.equal(formatArticleCount(null), '—');
  assert.equal(formatArticleCount(undefined), '—');
  assert.equal(formatArticleCount(-1), '—');
  assert.equal(formatArticleCount(Number.NaN), '—');
});

ok('PostgREST returns an exact count below its max-rows (1,000): shown as is', () => {
  assert.equal(ARTICLE_COUNT_EXACT_BELOW, 1000);
  assert.equal(formatArticleCount(0), '0');
  assert.equal(formatArticleCount(999), '999');
});

ok('from 1,000 rows the figure is a planner estimate: "≈" and rounded to the nearest 1,000', () => {
  assert.equal(formatArticleCount(1000), '≈1,000');
  assert.equal(formatArticleCount(135952), '≈136,000');
  assert.equal(formatArticleCount(135179), '≈135,000');
  assert.equal(formatArticleCount(1499), '≈1,000');
  assert.equal(formatArticleCount(2_345_678), '≈2,346,000');
});

ok('non-integer input is rounded first', () => {
  assert.equal(formatArticleCount(12.6), '13');
});

console.log(`\n${n} checks passed`);
