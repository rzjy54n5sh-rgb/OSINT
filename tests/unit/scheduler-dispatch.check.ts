/**
 * Scheduler Worker dispatch table (workers/scheduler/src/dispatch.ts workflowsFor).
 *
 * The Cloudflare Worker is the clock (GitHub `schedule:` is only a fallback, CLAUDE.md Gotchas):
 *   - every half-hourly firing dispatches collect-markets.yml;
 *   - the :00 firings also dispatch collect-articles.yml;
 *   - the 01:30 UTC firing (hour 1, minute >= 30) also dispatches collect-gdelt.yml, once a day;
 *   - the 05:20 cron dispatches scenario-daily.yml; any other cron dispatches nothing.
 * Fixed clocks only: no assertion reads the wall clock.
 *
 *   npx --yes tsx@4.23.13 tests/unit/scheduler-dispatch.check.ts
 */
import assert from 'node:assert/strict';
import { CRON_HALF_HOURLY, CRON_SCENARIO, workflowsFor } from '../../workers/scheduler/src/dispatch';

const at = (h: number, m: number) => Date.UTC(2026, 10, 4, h, m, 0);

// collect-gdelt.yml: only the 01:30 UTC half-hourly firing
assert.deepEqual(workflowsFor(CRON_HALF_HOURLY, at(1, 30)), ['collect-markets.yml', 'collect-gdelt.yml']);
// a slightly late firing in the same half hour still counts as the 01:30 firing
assert.deepEqual(workflowsFor(CRON_HALF_HOURLY, at(1, 31)), ['collect-markets.yml', 'collect-gdelt.yml']);

let gdelt = 0;
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const wfs = workflowsFor(CRON_HALF_HOURLY, at(h, m));
    if (wfs.includes('collect-gdelt.yml')) {
      gdelt++;
      assert.equal(h, 1, `collect-gdelt.yml dispatched at ${h}:${m}`);
      assert.equal(m, 30, `collect-gdelt.yml dispatched at ${h}:${m}`);
    }
    // unchanged: markets every firing, articles on the :00 firings only
    assert.equal(wfs[0], 'collect-markets.yml');
    assert.equal(wfs.includes('collect-articles.yml'), m < 30, `articles at ${h}:${m}`);
  }
}
assert.equal(gdelt, 1, 'collect-gdelt.yml is dispatched exactly once per UTC day');

assert.deepEqual(workflowsFor(CRON_HALF_HOURLY, at(1, 0)), ['collect-markets.yml', 'collect-articles.yml']);
assert.deepEqual(workflowsFor(CRON_HALF_HOURLY, at(2, 30)), ['collect-markets.yml']);
assert.deepEqual(workflowsFor(CRON_HALF_HOURLY, at(13, 30)), ['collect-markets.yml']);
assert.deepEqual(workflowsFor(CRON_SCENARIO, at(5, 20)), ['scenario-daily.yml']);
assert.deepEqual(workflowsFor('0 0 * * *', at(1, 30)), []);

console.log('scheduler-dispatch: all checks passed');
