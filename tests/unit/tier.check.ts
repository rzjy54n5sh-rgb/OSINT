/**
 * tierHasFeature() fails closed: only 'professional' gets pro_access; null/undefined/unknown = free.
 *   npx --yes tsx tests/unit/tier.check.ts
 */
import assert from 'node:assert/strict';
import { tierHasFeature, type TierFlags } from '../../lib/tier';
import type { UserTier } from '../../types';

const flags: TierFlags = {
  pro_only: { free_access: false, informed_access: false, pro_access: true },
  informed_up: { free_access: false, informed_access: true, pro_access: true },
  free_all: { free_access: true, informed_access: true, pro_access: true },
};
assert.equal(tierHasFeature('professional', 'pro_only', flags), true);
assert.equal(tierHasFeature('informed', 'pro_only', flags), false);
assert.equal(tierHasFeature('informed', 'informed_up', flags), true);
assert.equal(tierHasFeature('free', 'informed_up', flags), false);
assert.equal(tierHasFeature(null, 'informed_up', flags), false);
assert.equal(tierHasFeature(undefined, 'free_all', flags), true);
// unknown tier strings (bad data / future enum value) must not unlock paid features
assert.equal(tierHasFeature('enterprise' as unknown as UserTier, 'pro_only', flags), false);
assert.equal(tierHasFeature('' as unknown as UserTier, 'informed_up', flags), false);
assert.equal(tierHasFeature('enterprise' as unknown as UserTier, 'free_all', flags), true);
assert.equal(tierHasFeature('professional', 'missing_feature', flags), false);
console.log('tier.check: all 10 checks passed');
