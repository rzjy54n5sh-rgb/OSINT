/**
 * R1 (operator decision 2026-10-13): render-time party flag for brief sources.
 *
 *   npx --yes tsx@4.23.13 tests/unit/brief-party.check.ts
 *
 * Fixtures are the Day 228 general brief's real sources and their real registry rows (production
 * outlets / outlet_aliases, read 2026-10-13). Before this change the reader printed the stored
 * `party_source` only, so Arab News (stored false, registry state_aligned) was unlabelled.
 */
import assert from 'node:assert/strict';
import { resolveParty, urlHost, lookupOutlet, aliasCandidates, type OutletEntry } from '../../lib/outlet-lookup';

const reg = new Map<string, OutletEntry>([
  ['host:arabnews.com', { name: 'Arab News', party_status: 'state_aligned' }],
  ['host:thenationalnews.com', { name: 'The National', party_status: 'state_aligned' }],
  ['host:abc.net.au', { name: 'ABC (Australia)', party_status: 'independent' }],
  ['host:aljazeera.com', { name: 'Al Jazeera English', party_status: 'independent' }],
  ['name:Al Jazeera', { name: 'Al Jazeera English', party_status: 'independent' }],
  ['name:IRNA English', { name: 'IRNA', party_status: 'state_aligned' }],
  ['host:example-party.org', { name: 'Example Party Outlet', party_status: 'party' }],
  // Hypothetical: if the registry ever marked Al Jazeera, the reader must still not upgrade it.
  ['host:aljazeera.net', { name: 'Al Jazeera Arabic', party_status: 'state_aligned' }],
]);

// url_host parity: lowercase host, leading www. stripped, scheme must be lower-case http(s).
assert.equal(urlHost('https://WWW.ArabNews.com/node/1'), 'arabnews.com');
assert.equal(urlHost('http://www.abc.net.au:443/x'), 'abc.net.au');
assert.equal(urlHost('ftp://arabnews.com'), null);
assert.equal(urlHost('HTTPS://arabnews.com'), null, 'public.url_host does not lowercase the scheme');
assert.equal(urlHost(42), null);

// Arab News: stored false, registry state_aligned -> upgraded (the bug this fixes).
assert.deepEqual(
  resolveParty({ name: 'Arab News', url: 'https://www.arabnews.com/node/2614001', party_source: false }, reg),
  { party: true, label: 'State-aligned' },
);
// The National: stored true and registry state_aligned -> registry wording.
assert.deepEqual(
  resolveParty({ name: 'The National', url: 'https://www.thenationalnews.com/news/uk/2026/10/12/x', party_source: true }, reg),
  { party: true, label: 'State-aligned' },
);
// Registry `party`.
assert.deepEqual(resolveParty({ name: 'X', url: 'https://example-party.org/a', party_source: false }, reg), { party: true, label: 'Party' });
// Stored true, registry independent or no match -> never downgraded, "Party source".
assert.deepEqual(resolveParty({ name: 'ABC', url: 'https://abc.net.au/a', party_source: true }, reg), { party: true, label: 'Party source' });
assert.deepEqual(resolveParty({ name: 'Fana', url: 'https://fanamc.com/a', party_source: true }, reg), { party: true, label: 'Party source' });
// Independent and stored false -> no flag.
assert.deepEqual(resolveParty({ name: 'ABC', url: 'https://www.abc.net.au/a', party_source: false }, reg), { party: false, label: null });
// Host first, then exact source_name.
assert.deepEqual(resolveParty({ name: 'IRNA English', url: null, party_source: false }, reg), { party: true, label: 'State-aligned' });
assert.equal(lookupOutlet({ name: ' IRNA English ', url: 'https://unknown.example/x' }, reg)?.name, 'IRNA');
assert.equal(lookupOutlet({ name: 'irna english', url: null }, reg), null, 'source_name aliases are exact strings');
// Al Jazeera: never upgraded from the registry; its stored flag stands either way.
assert.deepEqual(resolveParty({ name: 'Al Jazeera', url: 'https://www.aljazeera.net/news/1', party_source: false }, reg), { party: false, label: null });
assert.deepEqual(resolveParty({ name: 'Al Jazeera', url: 'https://www.aljazeera.com/news/1', party_source: true }, reg), { party: true, label: 'Party source' });

// Host first, then source_name: a host hit wins even when the exact name points elsewhere.
const order = new Map<string, OutletEntry>([
  ['host:indie.example', { name: 'Indie', party_status: 'independent' }],
  ['name:State Wire', { name: 'State Wire', party_status: 'state_aligned' }],
]);
assert.equal(lookupOutlet({ name: 'State Wire', url: 'https://www.indie.example/a' }, order)?.name, 'Indie', 'host wins');
assert.deepEqual(resolveParty({ name: 'State Wire', url: 'https://indie.example/a', party_source: false }, order), { party: false, label: null });
assert.deepEqual(resolveParty({ name: 'State Wire', url: 'https://unlisted.example/a', party_source: false }, order), { party: true, label: 'State-aligned' });
// Al Jazeera exemption is for the RESOLVED outlet only, never a substring of the free-text name.
assert.deepEqual(
  resolveParty({ name: 'Party outlet, citing Al Jazeera', url: 'https://example-party.org/x', party_source: false }, reg),
  { party: true, label: 'Party' },
);
// Junk input never throws.
assert.deepEqual(resolveParty({ name: null, url: null, party_source: null }, reg), { party: false, label: null });
assert.deepEqual(aliasCandidates([{ name: ' Arab News ', url: 'https://www.arabnews.com/x' }, { name: null, url: 'javascript:1' }]), ['arabnews.com', 'Arab News']);

console.log('brief-party checks passed');
