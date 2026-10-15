-- =====================================================================================================
-- 20261013200000_outlet_registry_rulings.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- Classifies the outlets that 20261013120000_outlet_registry_seed.sql left unregistered as "ruling needed"
-- (docs/outlet-registry.md), applying the operator-delegated classification rule of 2026-10-13
-- (docs/outlet-registry.md, "Classification rule (operator delegated, 2026-10-13)"):
--   party         = owned or run by a political party, armed group or military/government body that is itself
--                   a party to a tracked conflict (incl. a ruling party's own outlet);
--   state_aligned = state-owned or state-funded, OR owned by a business group whose owner is documented (cited,
--                   reputable source) as allied with the government AND whose editorial line is documented as
--                   following that government; party_affiliation names the state;
--   independent   = everything else with documented private or editorially independent public ownership
--                   (incl. editorially independent public broadcasters and advocacy NGOs; party_affiliation NULL);
--   funding only alleged and denied -> classified by what is documented, allegation and denial in the basis;
--   source_tier NULL unless a desk rule names the outlet (none of these 13 is named).
--
-- DATA ONLY. No DDL apart from two ON COMMIT DROP temp tables. 13 outlets, 26 aliases (13 source_name, 13 host). Registry after the seed + this file:
-- 96 outlets, 207 aliases. Every classification_basis cites pages OPENED on 2026-10-13.
-- Aliases are the exact production articles.source_name strings and url_host() hosts (lowercase, no www.)
-- seen in production articles / daily_briefings (read-only, 2026-10-13); none collides with the 181 aliases
-- of the seed (checked against production outlet_aliases, 2026-10-13). t.me is never an alias, so the two
-- Rybar Telegram channels resolve by source_name only. No article_sources row matches any of these outlets,
-- so article_source_id stays NULL.
--
-- Idempotent and non-destructive, same pattern as the seed: INSERT ... ON CONFLICT DO NOTHING; a row edited
-- later is never overwritten (a WARNING lists it); a second run is a no-op. ONE TRANSACTION. Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261013200000_outlet_registry_rulings.sql
-- Tests: supabase/tests/run_outlet_registry_seed_tests.sh (scratch Postgres only). NOT APPLIED by the author.
-- =====================================================================================================

SET client_min_messages = warning;
BEGIN;

-- ---------------------------------------------------------------------------------------------------
-- 0. Preflight: registry tables, columns and the UNIQUE (name) that ON CONFLICT (name) needs.
-- ---------------------------------------------------------------------------------------------------
DO $$
DECLARE v_missing text;
BEGIN
  IF to_regclass('public.outlets') IS NULL OR to_regclass('public.outlet_aliases') IS NULL THEN
    RAISE EXCEPTION 'outlet_registry_rulings: public.outlets / public.outlet_aliases missing (apply 20261007100400_stories.sql first)';
  END IF;
  SELECT string_agg(c, ', ') INTO v_missing
    FROM unnest(ARRAY['outlets.name','outlets.lang','outlets.country_code','outlets.party_status','outlets.party_affiliation',
                      'outlets.source_tier','outlets.classification_basis',
                      'outlet_aliases.alias_kind','outlet_aliases.alias','outlet_aliases.outlet_id']) c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                      WHERE ic.table_schema = 'public' AND ic.table_name || '.' || ic.column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'outlet_registry_rulings: missing columns: %', v_missing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outlets'::regclass AND contype = 'u'
                    AND pg_get_constraintdef(oid) = 'UNIQUE (name)') THEN
    RAISE EXCEPTION 'outlet_registry_rulings: UNIQUE (name) on public.outlets missing (ON CONFLICT (name) needs it)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- 1. Outlets (name, lang, country_code, party_status, party_affiliation, source_tier, basis)
-- ---------------------------------------------------------------------------------------------------
CREATE TEMP TABLE _rul_outlets (name text, lang text, country_code text, party_status text, party_affiliation text,
                                source_tier smallint, classification_basis text) ON COMMIT DROP;
INSERT INTO _rul_outlets VALUES
  ('Middle East Monitor', 'en', 'GB', 'state_aligned', 'Qatar (state-financed)', NULL,
   'London not-for-profit press monitoring organisation and lobbying group; ''MEMO is financed by the State of Qatar'' (cited there to Willi, The Fourth Ordeal, Cambridge University Press 2021, and Cherkaoui, Rising Powers Quarterly 2018) - Wikipedia https://en.wikipedia.org/wiki/Middle_East_Monitor (opened 2026-10-13); MEMO About Us https://www.middleeastmonitor.com/about/ (opened 2026-10-13) describes it as built for ''supporters of ... the Palestinian cause'' and states no funding; no denial of the Qatari funding found. Advocacy organisation. Classification rule (operator delegated, 2026-10-13): state-funded -> state_aligned; no desk tier'),
  ('Gulf News', 'en', 'AE', 'independent', NULL, NULL,
   'Dubai daily owned by Al Nisr Publishing (bought in 1984 by three UAE businessmen), ''a subsidiary of the Al Tayer Group which is chaired by former UAE Finance Minister Obaid Al Tayer'' - Wikipedia https://en.wikipedia.org/wiki/Gulf_News (opened 2026-10-13). Private ownership is documented; no cited source documents its editorial line as following the UAE government, so the state_aligned business-group test is not met. Classification rule (operator delegated, 2026-10-13): independent; no desk tier'),
  ('Daily Sabah', 'en', 'TR', 'state_aligned', 'Turkey (Turkuvaz Media Group / Kalyon Group; pro-government)', NULL,
   '''a Turkish pro-government daily newspaper ... owned by Turkuvaz Media Group ... frequently called a propaganda outlet for the Turkish government and the ruling Justice and Development Party (AKP). It is owned by a friend of Turkish president Recep Tayyip Erdoğan''; ''described as a mouthpiece of the AKP by Foreign Policy'' - Wikipedia https://en.wikipedia.org/wiki/Daily_Sabah (opened 2026-10-13); ''a member of Turkuvaz Media Group'' - Daily Sabah About Us https://www.dailysabah.com/about-us (opened 2026-10-13); Turkuvaz parent Kalyon Group, CEO Serhat Albayrak, brother of Erdoğan''s son-in-law Berat Albayrak - Wikipedia https://en.wikipedia.org/wiki/Turkuvaz_Media_Group (opened 2026-10-13). Classification rule (operator delegated, 2026-10-13): owner allied with the government AND editorial line follows it -> state_aligned; no desk tier'),
  ('Hürriyet Daily News', 'en', 'TR', 'state_aligned', 'Turkey (Demirören Holding; pro-government since 2018)', NULL,
   'English-language daily under the flagship Hürriyet since 2006; ''both papers were sold to Demirören Holding in 2018, owned by Yildirim Demiroren, a close ally of Erdogan''; infobox ''Political alignment Centre-right'', ''Historical: Centre-left'' (the ''secular and liberal or centre-left'' position on the same page is the historical one) - Wikipedia https://en.wikipedia.org/wiki/H%C3%BCrriyet_Daily_News (opened 2026-10-13); parent Hürriyet: infobox political alignment ''pro-government (after 2018)''; ''The Demirören Group is known for its pro-government stance; the Demirören family are considered to be close to President Erdoğan'' - Wikipedia https://en.wikipedia.org/wiki/H%C3%BCrriyet (opened 2026-10-13); hurriyetdailynews.com/about-us returned 404 (2026-10-13). Classification rule (operator delegated, 2026-10-13): owner allied with the government AND the group''s line documented as pro-government since 2018 -> state_aligned; no desk tier'),
  ('ANI (Asian News International)', 'en', 'IN', 'state_aligned', 'India (private agency documented as closely associated with the government)', NULL,
   'Private Indian news agency founded by Prem Prakash; ''Drawing upon connections within the Indian government, ANI expanded''; ''Long-form investigations by The Caravan and The Ken have described ANI as having been closely associated with the government of India for decades ... especially after the 2014 election of the Bharatiya Janata Party''; The Caravan: ANI ''has a disturbing history of producing blatant propaganda for the state''; the page also records ANI''s 2024 defamation suit against Wikipedia over this description - Wikipedia https://en.wikipedia.org/wiki/Asian_News_International (opened 2026-10-13); The Caravan, ''How ANI reports the government''s version of truth'', 1 March 2019 https://caravanmagazine.in/reportage/ani-reports-government-version-truth (opened 2026-10-13; paywalled, headline and lede read); ANI About https://www.aninews.in/about-us/ (opened 2026-10-13) states no ownership. Classification rule (operator delegated, 2026-10-13): owner allied with the government AND editorial line follows it -> state_aligned; no desk tier'),
  ('France 24', 'other', 'FR', 'independent', NULL, NULL,
   '''a French state-owned publicly funded international news television network'' (French, English, Arabic, Spanish) - Wikipedia https://en.wikipedia.org/wiki/France_24 (opened 2026-10-13); its parent France Médias Monde is ''a société anonyme wholly owned by the French state'', classified ISFM (Independent State-Funded and State-Managed/Owned) every year 2022-2026 - State Media Monitor https://statemediamonitor.com/2026/09/france-medias-monde-fmm/ (opened 2026-10-13). Classification rule (operator delegated, 2026-10-13): editorially independent public broadcaster -> independent; no desk tier; lang ''other'': four language services'),
  ('Kurdistan 24', 'other', 'IQ', 'state_aligned', 'Iraq - Kurdistan Regional Government (KDP; Barzani family)', NULL,
   'Erbil broadcaster ''described as being affiliated with the Kurdistan Democratic Party, particularly current prime minister Masrour Barzani'' (owner not stated) - Wikipedia https://en.wikipedia.org/wiki/Kurdistan_24 (opened 2026-10-13); ''Masrour Barzani refuses to acknowledge his ownership of the satellite channel Kurdistan24, despite the channel''s editorial policy being biased towards the Kurdistan Democratic Party'' - Atlantic Council, 10 June 2016 https://www.atlanticcouncil.org/blogs/syriasource/challenges-facing-a-developing-kurdish-media/ (opened 2026-10-13); ''closely affiliated to the family of Masrour Barzani, the current Prime Minister of the Iraqi Kurdistan region'' - Syria Direct, 23 June 2021 https://syriadirect.org/red-tape-in-northeast-syria-kurdish-political-tensions-shrink-the-media-space/ (opened 2026-10-13); the channel calls itself ''impartial'' - https://www.kurdistan24.net/en/page/about (opened 2026-10-13). Not party: the KDP-led Kurdistan Regional Government is not a party to a tracked conflict (Barzani: the region ''wants to stay out of regional conflicts'' - Al Jazeera, 8 Aug 2026 https://www.aljazeera.com/news/2026/8/8/iraqs-kurdish-region-wants-to-stay-out-of-regional-conflicts-pm-barzani, opened 2026-10-13). Classification rule (operator delegated, 2026-10-13): owner (reported, unacknowledged) is the regional head of government AND editorial line documented as following the ruling KDP -> state_aligned; no desk tier; lang ''other'': Kurdish, English, Turkish, Arabic, Persian'),
  ('Samaa TV', 'other', 'PK', 'independent', NULL, NULL,
   'Pakistani news channel ''owned by businessman and politician Aleem Khan'', acquired in 2020 through his real-estate company Park View Limited - Wikipedia https://en.wikipedia.org/wiki/Samaa_TV (opened 2026-10-13); Aleem Khan has been Federal Minister for Communications since 3 April 2024 and is president of the Istehkam-e-Pakistan Party - Wikipedia https://en.wikipedia.org/wiki/Abdul_Aleem_Khan (opened 2026-10-13); in 2021 he resigned as a Punjab minister ''to ensure his neutrality as the owner of Samaa TV'' - Journalism Pakistan https://www.journalismpakistan.com/aleem-khan-resigns-as-minister-to-ensure-neutrality-as-samaa-owner (opened 2026-10-13); samaa.tv/about-us returned 404. Private ownership is documented; no cited source documents its editorial line as following the government, so the state_aligned test is not met although the owner is a sitting federal minister. Classification rule (operator delegated, 2026-10-13): independent; no desk tier; lang ''other'': Urdu channel, English and Urdu website'),
  ('ABC (Australia)', 'en', 'AU', 'independent', NULL, NULL,
   'ABC News is ''the national news service of Australia''s public broadcaster, the Australian Broadcasting Corporation'' - Wikipedia https://en.wikipedia.org/wiki/ABC_News_(Australia) (opened 2026-10-13); the ABC is classified Independent State-Funded (ISF) every year 2022-2026 - State Media Monitor https://statemediamonitor.com/2026/06/australian-broadcasting-corporation-abc/ (opened 2026-10-13). Classification rule (operator delegated, 2026-10-13): editorially independent public broadcaster -> independent; no desk tier'),
  ('Alhurra', 'ar', 'US', 'state_aligned', 'United States (USAGM-funded; operated by MBN)', NULL,
   '''an American government-funded Arabic-language satellite television and digital media network ... operated by the Middle East Broadcasting Networks (MBN), a non-profit grantee of the U.S. Agency for Global Media (USAGM)'' - Wikipedia https://en.wikipedia.org/wiki/Alhurra (opened 2026-10-13); MBN (Alhurra) listed as a USAGM network on the agency''s own site https://www.usagm.gov/networks/mbn/ (opened 2026-10-13); USAGM classified State-Controlled (SC) since 2025 - State Media Monitor https://statemediamonitor.com/2026/06/usagm/ (opened 2026-10-13). Classification rule (operator delegated, 2026-10-13): state-funded -> state_aligned (run by a non-profit grantee, not by a government body, so not party); no desk tier'),
  ('Iran International', 'other', 'GB', 'independent', NULL, NULL,
   'London Persian-language channel, owner Volant Media UK Ltd; ''has been backed by Saudi-linked private investors, and media reports have alleged that figures connected to the Saudi royal court were involved in its financing, while the agency denies receiving funding from or having ties to the Saudi government''; ''According to UK corporate records and sources "familiar with the channel", it was funded and started by members of the Saudi royal court circle''; ''When Iran and Saudi Arabia re-established diplomatic relations in Beijing in March 2023, Saudi Arabia was reported to have agreed to tone down the coverage of the Mahsa Amini protests on the Iran International channel, or even to stop funding it''; ''Iran International actively promotes former Crown Prince Reza Pahlavi as the next ruler of Iran'' - Wikipedia https://en.wikipedia.org/wiki/Iran_International (opened 2026-10-13); site footer ''All rights reserved for Volant Media UK Limited'' - https://www.iranintl.com/en/about-us (opened 2026-10-13). ALLEGATION: financing by figures connected to the Saudi royal court (UK corporate records and unnamed sources; 2023 report of a Saudi undertaking to tone down coverage or stop funding). DENIAL: the channel denies receiving funding from or having ties to the Saudi government. Editorial line: actively promotes Reza Pahlavi. Classification rule (operator delegated, 2026-10-13): funding alleged and denied -> classified by the documented private ownership -> independent; no desk tier; lang ''other'': Persian, English, Arabic'),
  ('NIAC (National Iranian American Council)', 'en', 'US', 'independent', NULL, NULL,
   'Advocacy organisation: ''an American lobby'' founded in 2002; ''does not receive funds from the Iranian government nor the United States government'' (over 8,000 donors incl. Iranian-American individuals and American foundations); critics'' claims that it lobbies for the Iranian government (2020 FARA complaint by three US senators; ''The US government has not publicly taken any such action'') are recorded on the same page - Wikipedia https://en.wikipedia.org/wiki/National_Iranian_American_Council (opened 2026-10-13); NIAC About https://niacouncil.org/about/ (opened 2026-10-13). Classification rule (operator delegated, 2026-10-13): advocacy organisation with documented private funding -> independent; no desk tier'),
  ('Rybar', 'other', 'RU', 'state_aligned', 'Russia (Rostec contract funding, per US State Department)', NULL,
   'Telegram channel of Rybar LLC (director Mikhail Zvinchuk); ''Rybar receives funding for contracted work from Russian defense industrial organization Rostec'', ''Russian state-owned corporation Rostec''; ''previously funded by the deceased Russian mogul Yevgeniy Viktorovich Prigozhin'' - US Department of State, Rewards for Justice https://rewardsforjustice.net/rewards/rybar/ (opened 2026-10-13); same finding reported by The Moscow Times https://www.themoscowtimes.com/2024/10/19/us-posts-10-million-reward-citing-russian-election-interference-a86750 (opened 2026-10-13); Zvinchuk worked in the Russian Defence Ministry press service until 2019 and said in 2022 that the channel is funded by donations (a statement that predates the 2024 Rostec finding and does not address it) - Wikipedia https://en.wikipedia.org/wiki/Mikhail_Zvinchuk (opened 2026-10-13). No denial of the Rostec funding found. Classification rule (operator delegated, 2026-10-13): state-funded -> state_aligned (Russia is not a party to a tracked conflict, so not party); no desk tier; lang ''other'': English and Russian channels');

INSERT INTO public.outlets (name, lang, country_code, party_status, party_affiliation, source_tier, classification_basis)
SELECT s.name, s.lang, s.country_code, s.party_status, s.party_affiliation, s.source_tier, s.classification_basis
  FROM _rul_outlets s
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------------------------------
-- 2. Aliases (alias_kind, alias, outlet name). Hosts bare (url_host strips 'www.'), lowercase.
-- ---------------------------------------------------------------------------------------------------
CREATE TEMP TABLE _rul_aliases (alias_kind text, alias text, outlet_name text) ON COMMIT DROP;
INSERT INTO _rul_aliases VALUES
  ('source_name', 'middleeastmonitor.com', 'Middle East Monitor'),
  ('source_name', 'Middle East Monitor', 'Middle East Monitor'),
  ('host', 'middleeastmonitor.com', 'Middle East Monitor'),
  ('source_name', 'gulfnews.com', 'Gulf News'),
  ('host', 'gulfnews.com', 'Gulf News'),
  ('source_name', 'dailysabah.com', 'Daily Sabah'),
  ('host', 'dailysabah.com', 'Daily Sabah'),
  ('source_name', 'hurriyetdailynews.com', 'Hürriyet Daily News'),
  ('host', 'hurriyetdailynews.com', 'Hürriyet Daily News'),
  ('source_name', 'aninews.in', 'ANI (Asian News International)'),
  ('host', 'aninews.in', 'ANI (Asian News International)'),
  ('source_name', 'France24', 'France 24'),
  ('host', 'france24.com', 'France 24'),
  ('source_name', 'Kurdistan 24', 'Kurdistan 24'),
  ('host', 'kurdistan24.net', 'Kurdistan 24'),
  ('source_name', 'samaa.tv', 'Samaa TV'),
  ('host', 'samaa.tv', 'Samaa TV'),
  ('source_name', 'abc.net.au', 'ABC (Australia)'),
  ('host', 'abc.net.au', 'ABC (Australia)'),
  ('host', 'alhurra.com', 'Alhurra'),
  ('host', 'iranintl.com', 'Iran International'),
  ('source_name', 'niacouncil.org', 'NIAC (National Iranian American Council)'),
  ('host', 'niacouncil.org', 'NIAC (National Iranian American Council)'),
  ('host', 'insights.niacouncil.org', 'NIAC (National Iranian American Council)'),
  ('source_name', 'Rybar (English)', 'Rybar'),
  ('source_name', 'Rybar (Russian)', 'Rybar');

INSERT INTO public.outlet_aliases (alias_kind, alias, outlet_id)
SELECT s.alias_kind, s.alias, o.id
  FROM _rul_aliases s
  JOIN public.outlets o ON o.name = s.outlet_name
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------------
-- 3. Postflight: report (never overwrite) pre-existing rows that differ from this file.
-- ---------------------------------------------------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(s.name || ' (existing: ' || o.party_status || '/' || coalesce(o.source_tier::text, '-') || ')', '; ') INTO v
    FROM _rul_outlets s JOIN public.outlets o ON o.name = s.name
   WHERE (o.party_status, coalesce(o.source_tier, 0), o.party_affiliation, o.classification_basis)
         IS DISTINCT FROM (s.party_status, coalesce(s.source_tier, 0), s.party_affiliation, s.classification_basis);
  IF v IS NOT NULL THEN RAISE WARNING 'outlet_registry_rulings: existing outlet rows kept as they are: %', v; END IF;
  SELECT string_agg(s.alias_kind || ':' || s.alias || ' -> ' || o.name, '; ') INTO v
    FROM _rul_aliases s JOIN public.outlet_aliases a ON a.alias_kind = s.alias_kind AND a.alias = s.alias
    JOIN public.outlets o ON o.id = a.outlet_id
   WHERE o.name <> s.outlet_name;
  IF v IS NOT NULL THEN RAISE WARNING 'outlet_registry_rulings: existing aliases point elsewhere and were kept: %', v; END IF;
  IF EXISTS (SELECT 1 FROM _rul_aliases s WHERE NOT EXISTS (SELECT 1 FROM public.outlet_aliases a
                                                             WHERE a.alias_kind = s.alias_kind AND a.alias = s.alias)) THEN
    RAISE EXCEPTION 'outlet_registry_rulings: some aliases were not written';
  END IF;
END $$;

COMMIT;
