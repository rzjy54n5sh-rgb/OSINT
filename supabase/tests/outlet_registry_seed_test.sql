-- Tests for 20261013120000_outlet_registry_seed.sql (scratch databases only; needs outlet_registry_seed_fixture.sql
-- and outlet_registry_seed_unregistered.sql loaded). Prints PASS/FAIL lines, then total|pass|fail; exits non-zero
-- (division by zero at the end) when any check fails.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;
CREATE TEMP TABLE r (n serial, label text, pass boolean, detail text);

-- 1. row counts
INSERT INTO r (label, pass, detail)
SELECT 'outlets = 83', count(*) = 83, count(*)::text FROM public.outlets;
INSERT INTO r (label, pass, detail)
SELECT 'aliases = 181 (source_name 76, host 105)',
       count(*) = 181 AND count(*) FILTER (WHERE alias_kind = 'source_name') = 76 AND count(*) FILTER (WHERE alias_kind = 'host') = 105,
       count(*) || ' (' || count(*) FILTER (WHERE alias_kind = 'source_name') || ' / ' || count(*) FILTER (WHERE alias_kind = 'host') || ')'
  FROM public.outlet_aliases;

-- 2. every production constraint present, validated, and satisfied row by row
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

-- 3. sourcing rules
INSERT INTO r (label, pass, detail)
SELECT 'every basis names a URL and the 2026-10-13 opening', count(*) = 0, string_agg(name, ', ')
  FROM public.outlets WHERE classification_basis !~ 'https?://' OR classification_basis !~ 'opened 2026-10-13';
INSERT INTO r (label, pass, detail)
SELECT 'no outlet seeded as unknown (unsourced outlets are left out)', count(*) = 0, string_agg(name, ', ')
  FROM public.outlets WHERE party_status = 'unknown';

-- 4. desk rules
INSERT INTO r (label, pass, detail)
SELECT 'Tier 1 = exactly AFP, Reuters, AP, PolitiFact, NetBlocks, HRW (independent)',
       string_agg(name, ',' ORDER BY name) = 'AFP,Associated Press,Human Rights Watch,NetBlocks,PolitiFact,Reuters' AND bool_and(party_status = 'independent'),
       string_agg(name, ',' ORDER BY name)
  FROM public.outlets WHERE source_tier = 1;
INSERT INTO r (label, pass, detail)
SELECT 'party = exactly CENTCOM, DoD, IDF, Al-Masirah, Al-Manar (Tier 3)',
       string_agg(name, ',' ORDER BY name) = 'Al-Manar,Al-Masirah,CENTCOM,IDF,US Department of Defense' AND bool_and(source_tier = 3),
       string_agg(name, ',' ORDER BY name)
  FROM public.outlets WHERE party_status = 'party';
INSERT INTO r (label, pass, detail)
SELECT 'Al Jazeera EN/AR: independent, Tier 2, DECISION-002 condition in basis', count(*) = 2, string_agg(name, ', ')
  FROM public.outlets
 WHERE name IN ('Al Jazeera English', 'Al Jazeera Arabic') AND party_status = 'independent' AND source_tier = 2
   AND classification_basis LIKE '%Qatar state-funded; treated as party only on Qatar/Egypt/UAE stories (DECISION-002)%';
INSERT INTO r (label, pass, detail)
SELECT 'The National: state_aligned UAE (Abu Dhabi ownership), Tier 2', count(*) = 1, max(party_affiliation)
  FROM public.outlets WHERE name = 'The National' AND party_status = 'state_aligned' AND source_tier = 2
   AND party_affiliation = 'UAE (Abu Dhabi ownership)';
INSERT INTO r (label, pass, detail)
SELECT 'two Sabas, both state_aligned, saba.ye only on the Houthi-run one',
       count(*) = 2
       AND (SELECT o.name FROM public.outlet_aliases a JOIN public.outlets o ON o.id = a.outlet_id
             WHERE a.alias_kind = 'host' AND a.alias = 'saba.ye') = 'Saba (Houthi-run, Sanaa)',
       string_agg(name || '=' || party_affiliation, ' | ')
  FROM public.outlets WHERE name LIKE 'Saba (%' AND party_status = 'state_aligned' AND source_tier = 3;
INSERT INTO r (label, pass, detail)
SELECT 'tier-3 state media list complete (20 state_aligned Tier 3)', count(*) = 20, string_agg(name, ', ' ORDER BY name)
  FROM public.outlets WHERE party_status = 'state_aligned' AND source_tier = 3;

-- 5. aliases
INSERT INTO r (label, pass, detail)
SELECT 'no alias string maps to two outlets (across both kinds)', count(*) = 0, string_agg(alias, ', ')
  FROM (SELECT alias FROM public.outlet_aliases GROUP BY alias HAVING count(DISTINCT outlet_id) > 1) x;
INSERT INTO r (label, pass, detail)
SELECT 'host aliases are already url_host()-normal (lowercase, no www.)', count(*) = 0, string_agg(alias, ', ')
  FROM public.outlet_aliases WHERE alias_kind = 'host' AND public.url_host('https://' || alias || '/x') IS DISTINCT FROM alias;
INSERT INTO r (label, pass, detail)
SELECT 't.me is never an alias', count(*) = 0, string_agg(alias, ', ') FROM public.outlet_aliases WHERE alias = 't.me';
INSERT INTO r (label, pass, detail)
SELECT 'outlets without any alias = Bloomberg News and the government Saba only',
       coalesce(string_agg(o.name, ',' ORDER BY o.name), '') = 'Bloomberg News,Saba (internationally recognised government)',
       string_agg(o.name, ',' ORDER BY o.name)
  FROM public.outlets o WHERE NOT EXISTS (SELECT 1 FROM public.outlet_aliases a WHERE a.outlet_id = o.id);

-- 6. article_sources links: only by unique name, and the linked row is the same outlet
INSERT INTO r (label, pass, detail)
SELECT 'article_source_id linked for 22 outlets, each to the matching production row',
       count(*) = 22 AND bool_and(s.name = ANY (ARRAY['afp','reuters','ap','netblocks','hrw','ft','aljazeera_en','aljazeera_ar','bbc_middleeast',
                                                     'guardian','cnn','mee','thenationalnews','irna','fars','presstv','ahramonline','centcom','idf',
                                                     'almonitor','haaretz','egyptindependent'])),
       string_agg(o.name || '->' || s.name, ', ' ORDER BY o.name)
  FROM public.outlets o JOIN public.article_sources s ON s.id = o.article_source_id;

-- 7. production coverage: each top-120 source_name maps (source_name alias, or every host aliased) or is consciously unregistered
CREATE TEMP TABLE cov AS
SELECT p.source_name, p.n, p.hosts,
       (SELECT o.name FROM public.outlet_aliases a JOIN public.outlets o ON o.id = a.outlet_id
         WHERE a.alias_kind = 'source_name' AND a.alias = p.source_name) AS by_name,
       (SELECT string_agg(DISTINCT o.name, ' + ') FROM unnest(p.hosts) h
          JOIN public.outlet_aliases a ON a.alias_kind = 'host' AND a.alias = h JOIN public.outlets o ON o.id = a.outlet_id) AS by_host,
       (SELECT count(*) FROM unnest(p.hosts) h WHERE NOT EXISTS
          (SELECT 1 FROM public.outlet_aliases a WHERE a.alias_kind = 'host' AND a.alias = h)) AS hosts_unmapped,
       u.reason
  FROM t_prod_top p LEFT JOIN t_unregistered u ON u.source_name = p.source_name;
INSERT INTO r (label, pass, detail)
SELECT 'every production top-120 source_name maps or is consciously unregistered', count(*) = 0, string_agg(source_name, ', ')
  FROM cov WHERE by_name IS NULL AND NOT (by_host IS NOT NULL AND hosts_unmapped = 0) AND reason IS NULL;
INSERT INTO r (label, pass, detail)
SELECT 'no consciously-unregistered name is also aliased', count(*) = 0, string_agg(source_name, ', ')
  FROM cov WHERE reason IS NOT NULL AND by_name IS NOT NULL;
INSERT INTO r (label, pass, detail)
SELECT 'source_name and host resolution agree wherever both resolve', count(*) = 0, string_agg(source_name || ': ' || by_name || ' vs ' || by_host, '; ')
  FROM cov WHERE by_name IS NOT NULL AND by_host IS NOT NULL AND by_host <> by_name;

SELECT 'PASS ' || label || CASE WHEN detail IS NOT NULL AND length(detail) < 160 THEN '  [' || detail || ']' ELSE '' END
  FROM r WHERE pass ORDER BY n;
SELECT 'FAIL ' || label || '  [' || coalesce(detail, '<null>') || ']' FROM r WHERE pass IS NOT TRUE ORDER BY n;

\echo '-- coverage of the production top-120 source_names (30 days to 2026-10-13):'
SELECT CASE WHEN by_name IS NOT NULL THEN 'mapped by source_name'
            WHEN by_host IS NOT NULL AND hosts_unmapped = 0 THEN 'mapped by host'
            ELSE 'unregistered (' || split_part(reason, ':', 1) || ')' END AS how,
       count(*) AS source_names, sum(n) AS articles
  FROM cov
 GROUP BY 1 ORDER BY 1;
\echo '-- per source_name (top 120): source_name | articles | resolves to | reason if unregistered'
SELECT source_name || ' | ' || n || ' | ' || coalesce(by_name, CASE WHEN hosts_unmapped = 0 THEN by_host END, '-') || ' | ' || coalesce(reason, '')
  FROM cov ORDER BY n DESC, source_name;

SELECT count(*) || '|' || count(*) FILTER (WHERE pass) || '|' || count(*) FILTER (WHERE pass IS NOT TRUE) FROM r;
SELECT 1 / (CASE WHEN bool_and(pass) THEN 1 ELSE 0 END) AS all_pass FROM r;
