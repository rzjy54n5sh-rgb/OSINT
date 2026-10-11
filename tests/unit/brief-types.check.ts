/**
 * Checks for lib/brief-types.ts (brief line-up, 2026-10-08) and that lib/site.ts re-exports the same list.
 *   npx --yes tsx tests/unit/brief-types.check.ts
 */
import assert from 'node:assert/strict';
import { ARCHIVE_TYPES, BRIEF_TYPES, CURRENT_LINEUP, ROUTABLE_BRIEF_TYPES, briefTitle, briefTypeMeta, isRoutableBriefType } from '../../lib/brief-types';
import { ROUTABLE_BRIEF_TYPES as SITE_TYPES } from '../../lib/site';

assert.equal(SITE_TYPES, ROUTABLE_BRIEF_TYPES, 'lib/site re-exports the registry list (one source of truth)');
// every legacy URL keeps working
for (const legacy of ['general', 'general_weekly', 'horn', 'egypt', 'uae', 'eschatology', 'business']) {
  assert.ok(isRoutableBriefType(legacy), `legacy type ${legacy} still routable`);
}
assert.ok(isRoutableBriefType('overnight') && isRoutableBriefType('egypt_gulf_economy'), 'new types routable');
assert.ok(!isRoutableBriefType('Egypt') && !isRoutableBriefType('weekly') && !isRoutableBriefType(''), 'case-sensitive, unknown rejected');
assert.deepEqual(CURRENT_LINEUP.map((t) => t.code), ['overnight', 'general', 'general_weekly', 'horn', 'egypt_gulf_economy', 'eschatology']);
assert.deepEqual(ARCHIVE_TYPES.map((t) => t.code), ['egypt', 'uae', 'business']);
assert.equal(new Set(ROUTABLE_BRIEF_TYPES).size, BRIEF_TYPES.length, 'codes unique');
for (const t of BRIEF_TYPES) assert.match(t.code, /^[a-z][a-z0-9_]{1,31}$/, `code ${t.code} matches report_types_code_chk`);
assert.equal(briefTypeMeta('eschatology')!.cadence, 'weekly');
assert.match(briefTitle('eschatology'), /^Religion, Ideology & Mobilisation/);
assert.equal(briefTitle('business'), 'Economic Impact & Market Access Brief');
assert.equal(briefTypeMeta('business')!.formerTitle, 'Business Opportunities Brief');
assert.equal(briefTypeMeta('overnight')!.isNew, true);
assert.equal(briefTypeMeta('egypt_gulf_economy')!.isNew, true);
assert.ok(!briefTypeMeta('general')!.isNew && !briefTypeMeta('egypt')!.isNew, 'only new types get the empty state');
assert.equal(briefTitle('nope'), 'nope', 'unknown code falls back, never throws');
console.log('brief-types.check: all assertions passed');
