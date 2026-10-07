/**
 * Checks for lib/briefing-sources.ts and the BriefingReader render path with malformed `sources`
 * (stored JSON is untrusted). Plain assert script, like nai-posture-label.check.ts:
 *
 *   npx --yes tsx tests/unit/briefing-sources.check.ts
 *
 * Not named *.test.ts / *.spec.ts so Playwright's testMatch ignores it.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { collectBriefSources, paragraphSources, safeHttpUrl } from '../../lib/briefing-sources';
import BriefingReader from '../../app/briefings/[day]/[type]/BriefingReader';

// tsx compiles the repo's `jsx: preserve` files with the classic transform, which needs React in scope.
(globalThis as unknown as { React: typeof React }).React = React;

// --- paragraphSources / collectBriefSources -------------------------------------------------
const malformed = [
  { name: 123, published_at: {}, url: null },
  { name: 5, published_at: 1759800000, url: 'https://ok.example/a', tier: '1', party_source: 'true' },
  { name: { x: 1 }, url: 42 },
  null,
  'str',
  { name: ' Good ', url: 'javascript:alert(1)', published_at: '2026-10-06', tier: 2, party_source: true },
];
const norm = paragraphSources(malformed);
assert.equal(norm.length, 4, 'non-object entries dropped');
for (const s of norm) {
  assert.ok(s.name === null || typeof s.name === 'string');
  assert.ok(s.published_at === null || typeof s.published_at === 'string');
  assert.ok(s.url === null || typeof s.url === 'string');
  assert.equal(typeof s.party_source, 'boolean');
}
assert.deepEqual(paragraphSources(undefined), []);
assert.deepEqual(paragraphSources({ not: 'array' }), []);
assert.equal(safeHttpUrl('javascript:alert(1)'), null);
assert.equal(safeHttpUrl(42), null);

// Dedup: host/scheme case-insensitive, PATH case preserved, trailing slash + hash ignored.
const dd = collectBriefSources([
  {
    subsections: [
      {
        paragraphs: [
          { sources: [{ url: 'https://A.com/Path/' }, { url: 'https://a.com/path' }, { url: 'https://a.com/Path#frag' }] },
          { sources: [{ url: 'https://a.com/Path' }] },
        ],
      },
    ],
  },
]);
assert.equal(dd.list.length, 2, '/Path and /path are different pages, trailing slash/hash/host-case merge');
assert.equal(dd.list.find((s) => s.url?.endsWith('/Path/') || s.url?.endsWith('/Path'))?.cited, 2);

// null sections/subsections/paragraphs must not throw
assert.deepEqual(collectBriefSources(null).list, []);
assert.deepEqual(collectBriefSources([{ subsections: null }, { subsections: [{ paragraphs: null }, null] }] as never).list, []);

// --- BriefingReader renders (server render) with malformed sources ---------------------------
const brief = {
  id: 'x',
  conflict_day: 222,
  report_type: 'general',
  title: 'T',
  lead: null,
  cover_stats: null,
  source_ids: null,
  source: 's',
  quality: 'full',
  generated_at: '2026-10-07T00:00:00Z',
  sections: [
    {
      id: 's1',
      heading: 'H',
      type: 't',
      subsections: [
        {
          id: 'ss1',
          heading: 'SH',
          paragraphs: [
            { text: 'p1', perspective: 'gulf', sources: malformed },
            { text: 'p2', sources: null },
            { text: 'p3' },
          ],
        },
        { id: 'ss2', heading: 'null paras', paragraphs: null },
      ],
    },
    { id: 's2', heading: 'null subs', type: 't', subsections: null },
  ],
};
const html = renderToString(React.createElement(BriefingReader, { briefing: brief as never, day: 222, type: 'general' }));
assert.ok(html.includes('SOURCES'), 'sources section rendered');
assert.ok(html.includes('https://ok.example/a'), 'valid link rendered');
assert.ok(!html.includes('javascript:alert'), 'javascript: URL never rendered as a link');
assert.ok(html.includes('STATE/PARTY SOURCE'), 'party marker rendered');

const legacy = renderToString(
  React.createElement(BriefingReader, { briefing: { ...brief, sections: [] } as never, day: 1, type: 'general' })
);
assert.ok(legacy.includes('No source citations are recorded'), 'legacy note');

console.log('briefing-sources checks passed');
