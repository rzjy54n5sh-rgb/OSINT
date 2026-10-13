-- Tests for 20261013200000_outlet_registry_rulings.sql (scratch databases only). Needs: the replica,
-- outlet_registry_seed_fixture.sql, outlet_registry_seed_unregistered.sql, the seed migration, the table
-- t_registry_before (snapshot of the registry taken by the runner after the seed and BEFORE this migration)
-- and then the rulings migration. Prints PASS/FAIL lines, then total|pass|fail; exits non-zero (division by
-- zero at the end) when any check fails.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;
CREATE TEMP TABLE r (n serial, label text, pass boolean, detail text);

-- Expected result of the operator-delegated rule (docs/outlet-registry.md), one row per ruled outlet.
CREATE TEMP TABLE x_outlets (name text PRIMARY KEY, party_status text, party_affiliation text) ;
INSERT INTO x_outlets VALUES
  ('Middle East Monitor', 'state_aligned', 'Qatar (state-financed)'),
  ('Gulf News', 'independent', NULL),
  ('Daily Sabah', 'state_aligned', 'Turkey (Turkuvaz Media Group / Kalyon Group; pro-government)'),
  ('Hürriyet Daily News', 'independent', NULL),
  ('ANI (Asian News International)', 'state_aligned', 'India (private agency documented as closely associated with the government)'),
  ('France 24', 'independent', NULL),
  ('Kurdistan 24', 'state_aligned', 'Iraq - Kurdistan Regional Government (KDP; Barzani family)'),
  ('Samaa TV', 'independent', NULL),
  ('ABC (Australia)', 'independent', NULL),
  ('Alhurra', 'state_aligned', 'United States (USAGM-funded; operated by MBN)'),
  ('Iran International', 'independent', NULL),
  ('NIAC (National Iranian American Council)', 'independent', NULL),
  ('Rybar', 'state_aligned', 'Russia (Rostec contract funding, per US State Department)');
CREATE TEMP TABLE x_aliases (alias_kind text, alias text, outlet_name text);
INSERT INTO x_aliases VALUES
  ('source_name', 'middleeastmonitor.com', 'Middle East Monitor'), ('source_name', 'Middle East Monitor', 'Middle East Monitor'),
  ('host', 'middleeastmonitor.com', 'Middle East Monitor'),
  ('source_name', 'gulfnews.com', 'Gulf News'), ('host', 'gulfnews.com', 'Gulf News'),
  ('source_name', 'dailysabah.com', 'Daily Sabah'), ('host', 'dailysabah.com', 'Daily Sabah'),
  ('source_name', 'hurriyetdailynews.com', 'Hürriyet Daily News'), ('host', 'hurriyetdailynews.com', 'Hürriyet Daily News'),
  ('source_name', 'aninews.in', 'ANI (Asian News International)'), ('host', 'aninews.in', 'ANI (Asian News International)'),
  ('source_name', 'France24', 'France 24'), ('host', 'france24.com', 'France 24'),
  ('source_name', 'Kurdistan 24', 'Kurdistan 24'), ('host', 'kurdistan24.net', 'Kurdistan 24'),
  ('source_name', 'samaa.tv', 'Samaa TV'), ('host', 'samaa.tv', 'Samaa TV'),
  ('source_name', 'abc.net.au', 'ABC (Australia)'), ('host', 'abc.net.au', 'ABC (Australia)'),
  ('host', 'alhurra.com', 'Alhurra'),
  ('host', 'iranintl.com', 'Iran International'),
  ('source_name', 'niacouncil.org', 'NIAC (National Iranian American Council)'),
  ('host', 'niacouncil.org', 'NIAC (National Iranian American Council)'),
  ('host', 'insights.niacouncil.org', 'NIAC (National Iranian American Council)'),
  ('source_name', 'Rybar (English)', 'Rybar'), ('source_name', 'Rybar (Russian)', 'Rybar');

-- 0. the scratch registry before this migration IS the production registry (read-only md5, 2026-10-13)
INSERT INTO r (label, pass, detail)
SELECT 'registry before = production (181 aliases, alias md5 a636d7df..., outlet md5 51d80243...)',
       count(*) = 181
       AND md5(string_agg(alias_kind || '|' || alias || '|' || outlet_name, E'\n' ORDER BY alias_kind COLLATE "C", alias COLLATE "C")) = 'a636d7df16f6fd84d15b98ff250b1b8c'
       AND (SELECT md5(string_agg(name || '|' || party_status || '|' || coalesce(source_tier::text, '-') || '|' || coalesce(party_affiliation, '-') || '|'
                                  || lang || '|' || coalesce(country_code, '-') || '|' || classification_basis, E'\n' ORDER BY name COLLATE "C"))
              FROM t_outlets_before) = '51d8024377e913085d1655c59115b144',
       count(*)::text
  FROM t_registry_before;

-- 1. counts
INSERT INTO r (label, pass, detail)
SELECT 'outlets = 96 (83 + 13)', count(*) = 96, count(*)::text FROM public.outlets;
INSERT INTO r (label, pass, detail)
SELECT 'aliases = 207 (source_name 89, host 118)',
       count(*) = 207 AND count(*) FILTER (WHERE alias_kind = 'source_name') = 89 AND count(*) FILTER (WHERE alias_kind = 'host') = 118,
       count(*) || ' (' || count(*) FILTER (WHERE alias_kind = 'source_name') || ' / ' || count(*) FILTER (WHERE alias_kind = 'host') || ')'
  FROM public.outlet_aliases;

-- 2. constraints: present, validated, satisfied row by row
INSERT INTO r (label, pass, detail)
SELECT 'all 13 production constraints present and validated', count(*) = 13 AND bool_and(convalidated), count(*)::text
  FROM pg_constraint WHERE conrelid IN ('public.outlets'::regclass, 'public.outlet_aliases'::regclass);
INSERT INTO r (label, pass, detail)
SELECT 'outlets CHECKs hold on every row', count(*) = 0, string_agg(name, ', ')
  FROM public.outlets
 WHERE NOT (public.intel_lang_valid(lang)
        AND (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
        AND party_status IN ('party', 'state_aligned', 'independent', 'unknown')
        AND (party_status NOT IN ('party', 'state_aligned') OR length(btrim(coalesce(party_affiliation, ''))) > 0)
        AND (source_tier IS NULL OR source_tier BETWEEN 1 AND 3)
        AND length(btrim(classification_basis)) >= 3);
INSERT INTO r (label, pass, detail)
SELECT 'outlet_aliases CHECKs hold on every row', count(*) = 0, string_agg(alias, ', ')
  FROM public.outlet_aliases
 WHERE NOT (alias_kind IN ('source_name', 'host') AND (alias_kind <> 'host' OR alias ~ '^[a-z0-9.-]+$'));

-- 3. the 13 ruled outlets: classification exactly as ruled, the written rule obeyed
INSERT INTO r (label, pass, detail)
SELECT 'the 13 ruled outlets carry exactly the expected status / affiliation', count(*) = 13, count(*)::text
  FROM x_outlets x JOIN public.outlets o ON o.name = x.name
 WHERE o.party_status = x.party_status AND o.party_affiliation IS NOT DISTINCT FROM x.party_affiliation;
INSERT INTO r (label, pass, detail)
SELECT 'ruled outlets: tier NULL (no desk rule names them), no party, affiliation NULL iff independent',
       bool_and(o.source_tier IS NULL AND o.party_status <> 'party'
                AND ((o.party_status = 'independent') = (o.party_affiliation IS NULL))), string_agg(o.name, ', ')
  FROM public.outlets o JOIN x_outlets x USING (name);
INSERT INTO r (label, pass, detail)
SELECT 'ruled outlets: basis cites a URL, the 2026-10-13 opening and the delegated rule', count(*) = 0, string_agg(o.name, ', ')
  FROM public.outlets o JOIN x_outlets x USING (name)
 WHERE o.classification_basis !~ 'https?://' OR o.classification_basis !~ 'opened 2026-10-13'
    OR o.classification_basis NOT LIKE '%Classification rule (operator delegated, 2026-10-13)%';
INSERT INTO r (label, pass, detail)
SELECT 'Iran International basis states the allegation AND the denial', count(*) = 1, NULL
  FROM public.outlets WHERE name = 'Iran International' AND classification_basis LIKE '%ALLEGATION:%' AND classification_basis LIKE '%DENIAL:%';
INSERT INTO r (label, pass, detail)
SELECT 'NIAC basis labels it an advocacy organisation (party_affiliation NULL)', count(*) = 1, NULL
  FROM public.outlets WHERE name = 'NIAC (National Iranian American Council)' AND classification_basis LIKE 'Advocacy organisation%' AND party_affiliation IS NULL;
INSERT INTO r (label, pass, detail)
SELECT 'no ruled outlet linked to article_sources (no matching production row)', count(*) = 0, string_agg(o.name, ', ')
  FROM public.outlets o JOIN x_outlets x USING (name) WHERE o.article_source_id IS NOT NULL;

-- 4. the seed is untouched; desk rules still hold registry-wide
INSERT INTO r (label, pass, detail)
SELECT 'all 83 seed outlets and 181 seed aliases unchanged',
       (SELECT count(*) FROM t_outlets_before b JOIN public.outlets o ON o.id = b.id
         WHERE (o.name, o.party_status, o.source_tier, o.party_affiliation, o.classification_basis, o.updated_at)
               IS NOT DISTINCT FROM (b.name, b.party_status, b.source_tier, b.party_affiliation, b.classification_basis, b.updated_at)) = 83
       AND (SELECT count(*) FROM t_registry_before b JOIN public.outlet_aliases a USING (alias_kind, alias)
             JOIN public.outlets o ON o.id = a.outlet_id WHERE o.name = b.outlet_name) = 181,
       NULL;
INSERT INTO r (label, pass, detail)
SELECT 'Tier 1 still exactly AFP, Reuters, AP, PolitiFact, NetBlocks, HRW',
       string_agg(name, ',' ORDER BY name) = 'AFP,Associated Press,Human Rights Watch,NetBlocks,PolitiFact,Reuters', string_agg(name, ',' ORDER BY name)
  FROM public.outlets WHERE source_tier = 1;
INSERT INTO r (label, pass, detail)
SELECT 'party still exactly CENTCOM, DoD, IDF, Al-Masirah, Al-Manar',
       string_agg(name, ',' ORDER BY name) = 'Al-Manar,Al-Masirah,CENTCOM,IDF,US Department of Defense', string_agg(name, ',' ORDER BY name)
  FROM public.outlets WHERE party_status = 'party';

-- 5. aliases
INSERT INTO r (label, pass, detail)
SELECT 'the 26 new aliases exist and point at the expected outlets', count(*) = 26, count(*)::text
  FROM x_aliases x JOIN public.outlet_aliases a USING (alias_kind, alias) JOIN public.outlets o ON o.id = a.outlet_id
 WHERE o.name = x.outlet_name;
INSERT INTO r (label, pass, detail)
SELECT 'no new alias collides with an existing (production) alias, of either kind', count(*) = 0, string_agg(x.alias, ', ')
  FROM x_aliases x JOIN t_registry_before b ON lower(b.alias) = lower(x.alias);
INSERT INTO r (label, pass, detail)
SELECT 'no alias string maps to two outlets (across both kinds, case-insensitive)', count(*) = 0, string_agg(a, ', ')
  FROM (SELECT lower(alias) a FROM public.outlet_aliases GROUP BY 1 HAVING count(DISTINCT outlet_id) > 1) z;
INSERT INTO r (label, pass, detail)
SELECT 'host aliases are url_host()-normal (lowercase, no www.)', count(*) = 0, string_agg(alias, ', ')
  FROM public.outlet_aliases WHERE alias_kind = 'host' AND public.url_host('https://' || alias || '/x') IS DISTINCT FROM alias;
INSERT INTO r (label, pass, detail)
SELECT 't.me is never an alias', count(*) = 0, string_agg(alias, ', ') FROM public.outlet_aliases WHERE alias = 't.me';
INSERT INTO r (label, pass, detail)
SELECT 'every new source_name alias is a production top-120 source_name', count(*) = 0, string_agg(x.alias, ', ')
  FROM x_aliases x WHERE x.alias_kind = 'source_name' AND x.alias NOT IN ('abc.net.au', 'niacouncil.org')
   AND NOT EXISTS (SELECT 1 FROM t_prod_top p WHERE p.source_name = x.alias);

-- 6. coverage: every "ruling needed" production source_name now resolves; resolutions agree
CREATE TEMP TABLE cov AS
SELECT p.source_name, p.hosts,
       (SELECT o.name FROM public.outlet_aliases a JOIN public.outlets o ON o.id = a.outlet_id
         WHERE a.alias_kind = 'source_name' AND a.alias = p.source_name) AS by_name,
       (SELECT string_agg(DISTINCT o.name, ' + ') FROM unnest(p.hosts) h
          JOIN public.outlet_aliases a ON a.alias_kind = 'host' AND a.alias = h JOIN public.outlets o ON o.id = a.outlet_id) AS by_host,
       u.reason
  FROM t_prod_top p LEFT JOIN t_unregistered u ON u.source_name = p.source_name;
INSERT INTO r (label, pass, detail)
SELECT 'every "ruling needed" top-120 source_name now resolves by source_name', count(*) = 0, string_agg(source_name, ', ')
  FROM cov WHERE reason LIKE 'ruling needed%' AND by_name IS NULL;
INSERT INTO r (label, pass, detail)
SELECT 'daily-briefing "ruling needed" hosts resolve by host', count(*) = 5, string_agg(h || '->' || o.name, ', ')
  FROM unnest(ARRAY['abc.net.au', 'alhurra.com', 'iranintl.com', 'niacouncil.org', 'insights.niacouncil.org']) h
  JOIN public.outlet_aliases a ON a.alias_kind = 'host' AND a.alias = h JOIN public.outlets o ON o.id = a.outlet_id;
INSERT INTO r (label, pass, detail)
SELECT 'source_name and host resolution agree wherever both resolve', count(*) = 0, string_agg(source_name || ': ' || by_name || ' vs ' || by_host, '; ')
  FROM cov WHERE by_name IS NOT NULL AND by_host IS NOT NULL AND by_host <> by_name;
INSERT INTO r (label, pass, detail)
SELECT 'non-ruling unregistered names stay unregistered', count(*) = 0, string_agg(source_name, ', ')
  FROM cov WHERE reason IS NOT NULL AND reason NOT LIKE 'ruling needed%' AND by_name IS NOT NULL;

SELECT 'PASS ' || label || CASE WHEN detail IS NOT NULL AND length(detail) < 160 THEN '  [' || detail || ']' ELSE '' END
  FROM r WHERE pass ORDER BY n;
SELECT 'FAIL ' || label || '  [' || coalesce(detail, '<null>') || ']' FROM r WHERE pass IS NOT TRUE ORDER BY n;
\echo '-- ruled outlets: name | status | affiliation | tier | aliases'
SELECT o.name || ' | ' || o.party_status || ' | ' || coalesce(o.party_affiliation, '-') || ' | ' || coalesce(o.source_tier::text, '-') || ' | '
       || (SELECT string_agg(a.alias_kind || ':' || a.alias, ', ' ORDER BY a.alias_kind, a.alias) FROM public.outlet_aliases a WHERE a.outlet_id = o.id)
  FROM public.outlets o JOIN x_outlets x USING (name) ORDER BY o.name;
SELECT count(*) || '|' || count(*) FILTER (WHERE pass) || '|' || count(*) FILTER (WHERE pass IS NOT TRUE) FROM r;
SELECT 1 / (CASE WHEN bool_and(pass) THEN 1 ELSE 0 END) AS all_pass FROM r;
