/**
 * DataAsOf overnight window (components/ui/DataAsOf.tsx + lib/conflict-calendar.ts sectionFreshness).
 *
 * The conflict day rolls over at 00:00 UTC; the daily build writes the new day's briefs ~01:56–02:10 UTC.
 * Between the two, yesterday's data is the expected publishing schedule, not a failure:
 *   - latest = N−1 before the publish deadline (04:00 UTC)  → data-freshness="pending", a muted note that
 *     says "publishes around" (never "published"), no warning chip;
 *   - latest = N−1 at/after the deadline (build failed/late) → "stale", the Stale chip (status-elevated);
 *   - latest = N−2 or older at any time                      → "stale";
 *   - latest = N                                             → "current".
 * Per-section schedules: scenarios (~10:00, deadline 14:00), social (~04:00, deadline 07:00); the feed has no
 * daily publish and is judged by the age of its newest article (12 h), never "publishes around".
 * A currentDay from a render cached before midnight is never judged earlier than the clock's day.
 * Hydration: the first paint judges at the server render time (RenderClock), not the client clock.
 * Every rendered state is emoji-free. Fixed clocks only: no assertion reads the wall clock.
 *
 *   npx --yes tsx@4.23.13 tests/unit/data-as-of-schedule.check.ts
 */
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import {
  BRIEF_PUBLISH_DEADLINE_UTC,
  currentConflictDay,
  freshnessLabel,
  SCENARIO_SCHEDULE,
  SOCIAL_SCHEDULE,
  sectionFreshness,
} from '../../lib/conflict-calendar';

// tsconfig has jsx: "preserve", so tsx compiles JSX with the classic runtime: expose React first.
(globalThis as { React?: typeof React }).React = React;
const { DataAsOf } = require('../../components/ui/DataAsOf') as typeof import('../../components/ui/DataAsOf');
const { RenderClockProvider, initialJudgeTime } = require('../../components/ui/RenderClock') as typeof import('../../components/ui/RenderClock');

let n = 0;
const ok = (label: string, fn: () => void) => {
  fn();
  n++;
  console.log(`PASS ${label}`);
};

// Day 232 = Saturday 17 October 2026 (UTC). Day 231 = 16 Oct, Day 230 = 15 Oct.
const N = 232;
const at = (hhmm: string, date = '2026-10-17') => new Date(`${date}T${hhmm}:00Z`);
assert.equal(currentConflictDay(at('00:30')), N, 'fixture: 17 Oct 2026 is Day 232');
assert.equal(currentConflictDay(at('23:59', '2026-10-16')), N - 1, 'fixture: 16 Oct 2026 is Day 231');

const render = (props: Parameters<typeof DataAsOf>[0]) => renderToStaticMarkup(React.createElement(DataAsOf, props));
const freshness = (html: string) => /data-freshness="([a-z]+)"/.exec(html)?.[1];
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
// Emoji: any pictographic code point (⚠ U+26A0 is one) or the emoji variation selector.
const EMOJI = /\p{Extended_Pictographic}|\u{FE0F}/u;
const rendered: string[] = [];
const brief = (latestDay: number | null, now: Date, currentDay: number | undefined = N) => {
  const html = render({ section: 'GENERAL BRIEFING', latestDay, currentDay, now });
  rendered.push(html);
  return html;
};

ok('00:30 UTC, latest = N−1 → pending, calm "publishes around" note, no warning', () => {
  const html = brief(N - 1, at('00:30'));
  assert.equal(freshness(html), 'pending');
  const t = text(html);
  assert.match(t, /Day 232 brief publishes around 02:00 UTC\. Showing Day 231 \(Oct 16, 2026\)\./);
  assert.doesNotMatch(t, /\bpublished\b/i, 'never claims publication happened');
  assert.doesNotMatch(t, /Latest available|no data for Day|Stale/);
  assert.doesNotMatch(html, /chip-status|data-status=/, 'no status chip in the pending state');
  assert.doesNotMatch(html, /accent-orange|status-elevated|status-disrupted/, 'no warning colour');
});

ok('05:00 UTC, latest = N−1 → stale (deadline passed: a failed build is flagged)', () => {
  const html = brief(N - 1, at('05:00'));
  assert.equal(freshness(html), 'stale');
  const t = text(html);
  assert.match(t, /Stale/);
  assert.match(t, /Latest available: Day 231 \(Oct 16, 2026\) — no data for Day 232/);
  assert.doesNotMatch(t, /publishes around/);
  assert.match(html, /class="chip-status" data-status="ELEVATED"/, 'v2 status-elevated chip');
  assert.match(html, /<svg[^>]*aria-hidden="true"/, 'glyph is inline SVG');
});

ok('deadline boundary: 03:59 pending, 04:00 stale', () => {
  assert.equal(freshness(brief(N - 1, at('03:59'))), 'pending');
  assert.equal(freshness(brief(N - 1, at('04:00'))), 'stale');
});

ok('latest = N−2 → stale at any time of day', () => {
  for (const hhmm of ['00:00', '00:30', '02:00', '03:59', '05:00', '12:00', '23:59']) {
    assert.equal(freshness(brief(N - 2, at(hhmm))), 'stale', `N−2 at ${hhmm}`);
  }
});

ok('latest = N → current at any time of day', () => {
  for (const hhmm of ['00:30', '05:00', '23:59']) {
    const html = brief(N, at(hhmm));
    assert.equal(freshness(html), 'current', `N at ${hhmm}`);
    assert.match(text(html), /as of Day 232 \(Oct 17, 2026\) · current/);
  }
});

ok('currentDay omitted → derived from the injected clock (00:30 pending, 05:00 stale)', () => {
  assert.equal(freshness(brief(N - 1, at('00:30'), undefined)), 'pending');
  assert.equal(freshness(brief(N - 1, at('05:00'), undefined)), 'stale');
});

ok('a currentDay from an older render (yesterday) cannot reopen the window', () => {
  // Cached render said "today is Day 231"; the clock is already 00:30 on Day 232; latest is Day 230.
  assert.equal(freshness(brief(N - 2, at('00:30'), N - 1)), 'stale');
});

ok('scenarios follow their own schedule (scenario-daily ~10:00 UTC), never "around 02:00"', () => {
  const pending = render({ section: 'SCENARIOS', latestDay: N - 1, currentDay: N, now: at('05:00') });
  rendered.push(pending);
  assert.equal(freshness(pending), 'pending');
  assert.match(text(pending), /Day 232 scenario update publishes around 10:00 UTC\. Showing Day 231/);
  const stale = render({ section: 'SCENARIOS', latestDay: N - 1, currentDay: N, now: at(SCENARIO_SCHEDULE.deadlineUtc) });
  rendered.push(stale);
  assert.equal(freshness(stale), 'stale');
});

ok('markets, posture and other sections use the daily-build deadline', () => {
  for (const section of ['MARKETS', 'WAR POSTURE', 'BRIEFINGS', 'GENERAL BRIEFING', 'COUNTRY']) {
    const p = render({ section, latestDay: N - 1, currentDay: N, now: at('01:00') });
    const s = render({ section, latestDay: N - 1, currentDay: N, now: at('04:30') });
    rendered.push(p, s);
    assert.equal(freshness(p), 'pending', `${section} 01:00`);
    assert.match(text(p), /publish(es)? around 02:00 UTC/);
    assert.equal(freshness(s), 'stale', `${section} 04:30`);
  }
});

ok('pure sectionFreshness / freshnessLabel agree with the component', () => {
  assert.equal(sectionFreshness(N - 1, N, { now: at('00:30') }).status, 'pending');
  assert.equal(sectionFreshness(N - 1, N, { now: at('05:00') }).status, 'stale');
  assert.equal(sectionFreshness(N - 2, N, { now: at('00:30') }).status, 'stale');
  assert.equal(sectionFreshness(N, N, { now: at('00:30') }).status, 'current');
  assert.equal(sectionFreshness(N + 1, N, { now: at('00:30') }).status, 'ahead');
  assert.equal(sectionFreshness(null, N, { now: at('00:30') }).status, 'empty');
  assert.equal(
    freshnessLabel(sectionFreshness(N - 1, N, { now: at('00:30') }), 'brief'),
    'Day 232 brief publishes around 02:00 UTC. Showing Day 231 (Oct 16, 2026).'
  );
  // The degraded-state wording is a product requirement: unchanged.
  assert.equal(
    freshnessLabel(sectionFreshness(N - 1, N, { now: at('05:00') })),
    'Latest available: Day 231 (Oct 16, 2026) — no data for Day 232'
  );
});

ok('empty and ahead states render (status chips, no emoji)', () => {
  const empty = render({ section: 'MARKETS', latestDay: null, currentDay: N, now: at('05:00') });
  const ahead = render({ section: 'MARKETS', latestDay: N + 1, currentDay: N, now: at('05:00') });
  rendered.push(empty, ahead);
  assert.equal(freshness(empty), 'empty');
  assert.match(empty, /data-status="UNKNOWN"/);
  assert.equal(freshness(ahead), 'ahead');
  assert.match(ahead, /data-status="CLOSED"/);
});

ok('social follows its own schedule (first rows 03:04–05:24 UTC): around 04:00, stale from 07:00', () => {
  const soc = (hhmm: string) => {
    const html = render({ section: 'SOCIAL', latestDay: N - 1, currentDay: N, now: at(hhmm) });
    rendered.push(html);
    return html;
  };
  assert.equal(SOCIAL_SCHEDULE.deadlineUtc, '07:00');
  for (const hhmm of ['00:30', '03:59', '04:01', '06:59']) {
    const html = soc(hhmm);
    assert.equal(freshness(html), 'pending', `social ${hhmm}`);
    assert.match(text(html), /Day 232 social data publishes around 04:00 UTC\. Showing Day 231/);
    assert.doesNotMatch(text(html), /02:00/);
  }
  for (const hhmm of ['07:00', '07:01', '12:00']) assert.equal(freshness(soc(hhmm)), 'stale', `social ${hhmm}`);
});

ok('feed: no daily publish; judged by the newest article age (12 h), never "publishes around"', () => {
  const feed = (latestAt: string | null, now: Date, latestDay: number | null = N - 1) => {
    const html = render({ section: 'FEED', latestDay, currentDay: N, latestAt, now });
    rendered.push(html);
    return html;
  };
  // 00:30 on Day 232, newest article 23:00 on Day 231 (1.5 h old): current, although its day is yesterday.
  const fresh = feed('2026-10-16T23:00:00Z', at('00:30'));
  assert.equal(freshness(fresh), 'current');
  assert.match(text(fresh), /newest item Oct 16, 2026 23:00 UTC \(Day 231\) · current/);
  // 11 h 59 min old: current; 12 h 01 min old: stale, with the age stated.
  assert.equal(freshness(feed('2026-10-16T23:00:00Z', at('10:59'))), 'current');
  const old = feed('2026-10-16T23:00:00Z', at('11:01'));
  assert.equal(freshness(old), 'stale');
  assert.match(text(old), /Stale/);
  assert.match(text(old), /newest item 12 h old \(Oct 16, 2026 23:00 UTC\)/);
  // Never the daily-publish copy, at any hour or age.
  for (const h of ['00:30', '01:00', '03:59', '05:00', '13:00', '23:59'])
    for (const latestAt of ['2026-10-16T23:00:00Z', '2026-10-15T08:00:00Z']) {
      const t = text(feed(latestAt, at(h)));
      assert.doesNotMatch(t, /publish/i, `feed ${latestAt} @ ${h}: ${t}`);
    }
  // No timestamp: day comparison only, with no publish window (yesterday at 00:30 is stale, not pending).
  assert.equal(freshness(feed(null, at('00:30'))), 'stale');
  assert.equal(freshness(feed(null, at('00:30'), N)), 'current');
});

ok('grammar: plural nouns take "publish" ("Day 232 briefs publish around …"), singular "publishes"', () => {
  const plural = render({ section: 'BRIEFINGS', latestDay: N - 1, currentDay: N, now: at('00:30') });
  const single = render({ section: 'GENERAL BRIEFING', latestDay: N - 1, currentDay: N, now: at('00:30') });
  rendered.push(plural, single);
  assert.match(text(plural), /Day 232 briefs publish around 02:00 UTC\./);
  assert.doesNotMatch(text(plural), /briefs publishes/);
  assert.match(text(single), /Day 232 brief publishes around 02:00 UTC\./);
  assert.equal(
    freshnessLabel(sectionFreshness(N - 1, N, { now: at('00:30') }), 'briefs', true),
    'Day 232 briefs publish around 02:00 UTC. Showing Day 231 (Oct 16, 2026).'
  );
});

ok('a render cached before midnight is judged against the clock day: never "current" for yesterday on Day 232', () => {
  // Cached HTML said "today is Day 231" and the section has Day 231: on Day 232 that is not current.
  const late = brief(N - 1, at('05:00'), N - 1);
  assert.equal(freshness(late), 'stale');
  assert.match(late, /data-current-day="232"/);
  assert.match(text(late), /no data for Day 232/);
  assert.doesNotMatch(text(late), /· current/);
  // Inside the overnight window it is the calm note for Day 232.
  assert.equal(freshness(brief(N - 1, at('00:30'), N - 1)), 'pending');
  assert.equal(sectionFreshness(N - 1, N - 1, { now: at('05:00') }).currentDay, N);
  // A caller day ahead of the clock is kept (that is the "ahead" check's job, not this one's).
  assert.equal(sectionFreshness(N + 1, N + 1, { now: at('05:00') }).status, 'current');
});

ok('hydration: first paint judges at the server render time (03:59), not the client clock (04:01)', () => {
  const realNow = Date.now;
  Date.now = () => at('04:01').getTime(); // the "client" clock; the first paint must not read it
  try {
    const Provider = RenderClockProvider as unknown as React.FC<{ renderedAt: number; children?: React.ReactNode }>;
    const tree = React.createElement(
      Provider,
      { renderedAt: at('03:59').getTime() },
      React.createElement(DataAsOf, { section: 'GENERAL BRIEFING', latestDay: N - 1, currentDay: N })
    );
    const html = renderToString(tree);
    assert.equal(freshness(html), 'pending', 'server verdict at 03:59 on first paint');
    assert.match(html, /data-judged-at="2026-10-17T03:59:00.000Z"/);
  } finally {
    Date.now = realNow;
  }
  // The hydrating client takes the same branch (useSyncExternalStore server snapshot); a plain client
  // mount (navigation) and the post-mount re-check use the real clock; a pinned clock always wins.
  const c = () => at('04:01').getTime();
  assert.equal(initialJudgeTime(at('03:59').getTime(), undefined, true, c), at('03:59').getTime());
  assert.equal(initialJudgeTime(at('03:59').getTime(), undefined, false, c), at('04:01').getTime());
  assert.equal(initialJudgeTime(null, undefined, true, c), at('04:01').getTime());
  assert.equal(initialJudgeTime(at('03:59').getTime(), at('00:30').getTime(), true, c), at('00:30').getTime());
  // ... and at 04:01 the same section is Stale (what the re-check after mount renders).
  assert.equal(freshness(brief(N - 1, at('04:01'))), 'stale');
});

ok('hideWhenCurrent renders nothing while current, the note otherwise', () => {
  assert.equal(render({ section: 'SCENARIOS', latestDay: N, currentDay: N, now: at('05:00'), hideWhenCurrent: true }), '');
  const p = render({ section: 'SCENARIOS', latestDay: N - 1, currentDay: N, now: at('05:00'), hideWhenCurrent: true });
  const s2 = render({ section: 'SCENARIOS', latestDay: N - 1, currentDay: N, now: at('14:01'), hideWhenCurrent: true });
  rendered.push(p, s2);
  assert.equal(freshness(p), 'pending');
  assert.equal(freshness(s2), 'stale');
});

ok(`deadline constant is ${BRIEF_PUBLISH_DEADLINE_UTC} UTC`, () => assert.equal(BRIEF_PUBLISH_DEADLINE_UTC, '04:00'));

ok(`no rendered state contains an emoji (${rendered.length} renders)`, () => {
  assert.ok(rendered.length >= 20);
  for (const html of rendered) assert.doesNotMatch(html, EMOJI, `emoji in: ${text(html)}`);
});

console.log(`\n${n} checks passed`);
