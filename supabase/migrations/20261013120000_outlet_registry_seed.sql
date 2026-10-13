-- =====================================================================================================
-- 20261013120000_outlet_registry_seed.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- Seeds public.outlets and public.outlet_aliases (created by 20261007100400_stories.sql, EMPTY in
-- production on 2026-10-13). The daily routine derives party_source and tier from these tables and the
-- story mix (party / independent / unknown outlet counts) resolves outlets through them.
--
-- DATA ONLY. No DDL. 83 outlets, 181 aliases (76 source_name, 105 host).
-- Rules applied (operator standing order "dont accept any invented claim"; desk DECISION-001/002):
--   * Every outlet's classification_basis names the evidence that was OPENED on 2026-10-13 (the outlet's
--     own page, a government page, State Media Monitor, or Wikipedia where the article states the
--     ownership) plus the desk rule that sets its tier. No evidence -> the outlet is NOT registered and
--     stays 'unknown' by default (see docs/outlet-registry.md, "Left unregistered").
--   * source_tier is set only where a desk rule names the outlet (operator tier list of 2026-10-13 or
--     collaboration/SOURCES.md); otherwise NULL (no tier invented).
--   * Al Jazeera (English + Arabic) is stored 'independent', Tier 2; it is a party source only on
--     Qatar/Egypt/UAE stories (DECISION-002) — that condition lives in classification_basis and must be
--     applied by the consumer.
-- Alias matching (followed exactly): host aliases are compared with public.url_host(url), which lowercases
-- and strips a leading 'www.' (see intel_alerts_candidate_guard in 20261007100500), so hosts are stored
-- bare and every subdomain seen in production is listed separately. source_name aliases are the exact
-- articles.source_name strings seen in production (last 30 days, 2026-10-13). Resolve host first, then
-- source_name (a source_name such as 'rt.com' or 'ahram.org.eg' spans several language editions).
-- t.me is never an alias (it hosts many unrelated Telegram channels).
-- article_source_id is linked only when exactly one public.article_sources row has the given name.
--
-- Idempotent and non-destructive: INSERT ... ON CONFLICT DO NOTHING everywhere, so a row someone edited
-- later is never overwritten; a second run is a no-op. If an alias or outlet name already exists with a
-- different meaning, the existing row wins and a WARNING lists it. ONE TRANSACTION. Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261013120000_outlet_registry_seed.sql
-- Tests: supabase/tests/run_outlet_registry_seed_tests.sh (scratch Postgres only).
-- NOT APPLIED by the author.
-- =====================================================================================================

SET client_min_messages = warning;
BEGIN;

-- ---------------------------------------------------------------------------------------------------
-- 0. Preflight: the registry tables (and the helpers their CHECKs use) must exist with the expected columns.
-- ---------------------------------------------------------------------------------------------------
DO $$
DECLARE v_missing text;
BEGIN
  IF to_regclass('public.outlets') IS NULL OR to_regclass('public.outlet_aliases') IS NULL THEN
    RAISE EXCEPTION 'outlet_registry_seed: public.outlets / public.outlet_aliases missing (apply 20261007100400_stories.sql first)';
  END IF;
  IF to_regclass('public.article_sources') IS NULL THEN
    RAISE EXCEPTION 'outlet_registry_seed: public.article_sources missing';
  END IF;
  SELECT string_agg(c, ', ') INTO v_missing
    FROM unnest(ARRAY['outlets.name','outlets.lang','outlets.country_code','outlets.party_status','outlets.party_affiliation',
                      'outlets.source_tier','outlets.classification_basis','outlets.article_source_id',
                      'outlet_aliases.alias_kind','outlet_aliases.alias','outlet_aliases.outlet_id']) c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                      WHERE ic.table_schema = 'public' AND ic.table_name || '.' || ic.column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'outlet_registry_seed: missing columns: %', v_missing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outlets'::regclass AND contype = 'u'
                    AND pg_get_constraintdef(oid) = 'UNIQUE (name)') THEN
    RAISE EXCEPTION 'outlet_registry_seed: UNIQUE (name) on public.outlets missing (ON CONFLICT (name) needs it)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- 1. Outlets (name, lang, country_code, party_status, party_affiliation, source_tier, basis, article_sources.name)
-- ---------------------------------------------------------------------------------------------------
CREATE TEMP TABLE _seed_outlets (name text, lang text, country_code text, party_status text, party_affiliation text,
                                 source_tier smallint, classification_basis text, article_source_name text) ON COMMIT DROP;
INSERT INTO _seed_outlets VALUES
  ('AFP', 'fr', 'FR', 'independent', NULL, 1, 
   'International news agency; ''private organization with special status, operating under commercial rules'', 1/3 of revenue paid by the French state for its general-interest mission - Wikipedia https://en.wikipedia.org/wiki/Agence_France-Presse (opened 2026-10-13); afp.com home page (opened 2026-10-13); desk rule Tier 1', 'afp'),
  ('Reuters', 'en', 'GB', 'independent', NULL, 1, 
   'News agency wholly owned by Thomson Reuters (Thomson family); website reuters.com - Wikipedia https://en.wikipedia.org/wiki/Reuters (opened 2026-10-13); desk rule Tier 1', 'reuters'),
  ('Associated Press', 'en', 'US', 'independent', NULL, 1, 
   'American not-for-profit news cooperative; website apnews.com - Wikipedia https://en.wikipedia.org/wiki/Associated_Press (opened 2026-10-13); desk rule Tier 1', 'ap'),
  ('PolitiFact', 'en', 'US', 'independent', NULL, 1, 
   'Nonprofit fact-checking project operated by the Poynter Institute; website politifact.com - Wikipedia https://en.wikipedia.org/wiki/PolitiFact (opened 2026-10-13); desk rule Tier 1', NULL),
  ('NetBlocks', 'en', 'GB', 'independent', NULL, 1, 
   '''Independent and non-partisan ... a privately held business owned and run by ... Alp Toker'' - NetBlocks Our Work page https://netblocks.org/about (opened 2026-10-13); desk rule Tier 1', 'netblocks'),
  ('Human Rights Watch', 'en', 'US', 'independent', NULL, 1, 
   'International non-governmental watchdog organization (nonprofit NGO); website hrw.org - Wikipedia https://en.wikipedia.org/wiki/Human_Rights_Watch (opened 2026-10-13); hrw.org home page (opened 2026-10-13); desk rule Tier 1', 'hrw'),
  ('Financial Times', 'en', 'GB', 'independent', NULL, 2, 
   'Owned by Japanese holding company Nikkei; website ft.com - Wikipedia https://en.wikipedia.org/wiki/Financial_Times (opened 2026-10-13); desk rule Tier 2 (DECISION-002: conditional Tier 1 for economic/energy analysis only)', 'ft'),
  ('Al Jazeera English', 'en', 'QA', 'independent', NULL, 2, 
   'Channel of Al Jazeera Media Network, ''partially funded by the government of Qatar''; website aljazeera.com - Wikipedia https://en.wikipedia.org/wiki/Al_Jazeera_English (opened 2026-10-13); Qatar state-funded; treated as party only on Qatar/Egypt/UAE stories (DECISION-002)', 'aljazeera_en'),
  ('Al Jazeera Arabic', 'ar', 'QA', 'independent', NULL, 2, 
   'Flagship channel of Al Jazeera Media Network, ''primarily funded by the government of Qatar'' - Wikipedia https://en.wikipedia.org/wiki/Al_Jazeera_Media_Network (opened 2026-10-13); aljazeera.net home page (opened 2026-10-13); Qatar state-funded; treated as party only on Qatar/Egypt/UAE stories (DECISION-002)', 'aljazeera_ar'),
  ('BBC News', 'en', 'GB', 'independent', NULL, 2, 
   'News division of the BBC, ''a quasi-autonomous corporation authorised by royal charter, making it operationally independent of the government''; websites bbc.co.uk, bbc.com - Wikipedia https://en.wikipedia.org/wiki/BBC_News (opened 2026-10-13); desk rule Tier 2', 'bbc_middleeast'),
  ('The Guardian', 'en', 'GB', 'independent', NULL, 2, 
   'Part of Guardian Media Group, owned by the Scott Trust Limited; website theguardian.com - Wikipedia https://en.wikipedia.org/wiki/The_Guardian (opened 2026-10-13); desk rule Tier 2', 'guardian'),
  ('The New York Times', 'en', 'US', 'independent', NULL, 2, 
   'Published by The New York Times Company (Ochs-Sulzberger family); website nytimes.com - Wikipedia https://en.wikipedia.org/wiki/The_New_York_Times (opened 2026-10-13); desk rule Tier 2', NULL),
  ('The Washington Post', 'en', 'US', 'independent', NULL, 2, 
   'Owned by Nash Holdings (Jeff Bezos); website washingtonpost.com - Wikipedia https://en.wikipedia.org/wiki/The_Washington_Post (opened 2026-10-13); desk rule Tier 2', NULL),
  ('Bloomberg News', 'en', 'US', 'independent', NULL, 2, 
   'News agency, a division of Bloomberg L.P. - Wikipedia https://en.wikipedia.org/wiki/Bloomberg_News (opened 2026-10-13); desk rule Tier 2', NULL),
  ('CNN', 'other', 'US', 'independent', NULL, 2, 
   'Flagship property of CNN Worldwide, a division of Skydance Corporation - Wikipedia https://en.wikipedia.org/wiki/CNN (opened 2026-10-13); desk rule Tier 2; lang ''other'': production rows span the Arabic, Spanish and English editions (cnn.com subdomains)', 'cnn'),
  ('Middle East Eye', 'en', 'GB', 'independent', NULL, 2, 
   'UK-based news website; Saudi/UAE/Egypt/Bahrain governments allege covert Qatari funding, ''a charge which has been denied by the organization''; website middleeasteye.net - Wikipedia https://en.wikipedia.org/wiki/Middle_East_Eye (opened 2026-10-13); desk rule Tier 2 (Tier 3 for Egypt-specific analysis, SOURCES.md)', 'mee'),
  ('Sudan Tribune', 'other', 'FR', 'independent', NULL, 2, 
   'Paris-based news portal run by Sudanese and international editors; owner Sudan Tribune, LLC; website sudantribune.com - Wikipedia https://en.wikipedia.org/wiki/Sudan_Tribune (opened 2026-10-13); sudantribune.net (Arabic edition) home page (opened 2026-10-13); desk rule Tier 2; lang ''other'': Arabic (.net) and English (.com) editions', NULL),
  ('Addis Standard', 'en', 'ET', 'independent', NULL, 2, 
   'Published by Jakenn Publishing Plc; ''has an independent political stance''; website addisstandard.com - Wikipedia https://en.wikipedia.org/wiki/Addis_Standard (opened 2026-10-13); desk rule Tier 2', NULL),
  ('The National', 'en', 'AE', 'state_aligned', 'UAE (Abu Dhabi ownership)', 2, 
   '''a UAE state-owned English-language daily''; owner International Media Investments / Sheikh Mansour bin Zayed Al Nahyan; website thenationalnews.com - Wikipedia https://en.wikipedia.org/wiki/The_National_(Abu_Dhabi) (opened 2026-10-13); desk rule: party_source true, Tier 2', 'thenationalnews'),
  ('Arab News', 'en', 'SA', 'state_aligned', 'Saudi Arabia (SRMG; promotes the Saudi government)', 2, 
   '''At least as of May 2019, Arab News was owned by Prince Turki bin Salman Al Saud, the brother of the ruling Crown Prince ... The newspaper promotes the Saudi government''; published by SRPC, a subsidiary of SRMG, whose ''former chairman'' was Turki bin Salman; website arabnews.com - Wikipedia https://en.wikipedia.org/wiki/Arab_News (opened 2026-10-13); SOURCES.md Tier 2 ''Saudi pro-government ... frame as government-aligned''', NULL),
  ('IRNA', 'en', 'IR', 'state_aligned', 'Iran (official state news agency)', 3, 
   '''the official news agency of Iran ... government-funded and controlled under the Iranian Ministry of Culture and Islamic Guidance''; website en.irna.ir - Wikipedia https://en.wikipedia.org/wiki/Islamic_Republic_News_Agency (opened 2026-10-13); desk rule Tier 3', 'irna'),
  ('ISNA', 'en', 'IR', 'state_aligned', 'Iran (ACECR; state-subsidised)', 3, 
   '''institutionally anchored in the Academic Center for Education, Culture and Research'', ''majority of ... operating costs are covered by annual state subsidies'', classed State-Controlled; domains isna.ir, en.isna.ir - State Media Monitor https://statemediamonitor.com/2026/06/iranian-students-news-agency-isna/ (opened 2026-10-13); desk rule Tier 3', NULL),
  ('Mehr News Agency', 'en', 'IR', 'state_aligned', 'Iran (Islamic Development Organization)', 3, 
   '''semi-official news agency sponsored by the government of Iran ... owned by the Iranian government''s Islamic Development Organization''; website mehrnews.com - Wikipedia https://en.wikipedia.org/wiki/Mehr_News_Agency (opened 2026-10-13); desk rule Tier 3', NULL),
  ('Tasnim News Agency', 'en', 'IR', 'state_aligned', 'Iran (IRGC-associated)', 3, 
   '''semi-official news agency in Iran associated with the Islamic Revolutionary Guard Corps (IRGC)''; infobox owner IRGC, website tasnimnews.ir - Wikipedia https://en.wikipedia.org/wiki/Tasnim_News_Agency (opened 2026-10-13); desk rule Tier 3', NULL),
  ('Fars News Agency', 'fa', 'IR', 'state_aligned', 'Iran (IRGC-affiliated)', 3, 
   '''close to the Islamic Revolutionary Guard Corps (IRGC) ... widely described ... to be a semi-official news agency of the Government of Iran'' - Wikipedia https://en.wikipedia.org/wiki/Fars_News_Agency (opened 2026-10-13); website farsnews.ir (infobox); desk rule Tier 3', 'fars'),
  ('Press TV', 'en', 'IR', 'state_aligned', 'Iran (IRIB, state-owned)', 3, 
   '''Iranian state-owned news media organisation, owned by Islamic Republic of Iran Broadcasting (IRIB)'' - Wikipedia https://en.wikipedia.org/wiki/Press_TV (opened 2026-10-13); presstv.ir redirects to presstv.co.uk (opened 2026-10-13); desk rule Tier 3', 'presstv'),
  ('TASS', 'en', 'RU', 'state_aligned', 'Russia (state-owned)', 3, 
   '''Russian state-owned news agency ... a Federal State Unitary Enterprise, owned by the Government of Russia'' - Wikipedia https://en.wikipedia.org/wiki/TASS (opened 2026-10-13); desk rule Tier 3', NULL),
  ('RT', 'other', 'RU', 'state_aligned', 'Russia (state-controlled, government-funded)', 3, 
   '''Russian state-controlled international news television network funded by the Russian government''; content in Russian, English, Spanish, Arabic and other languages - Wikipedia https://en.wikipedia.org/wiki/RT_(TV_network) (opened 2026-10-13); desk rule Tier 3; lang ''other'': rt.com subdomains carry several language editions', NULL),
  ('Xinhua', 'other', 'CN', 'state_aligned', 'China (official state news agency)', 3, 
   '''the official state news agency of the People''s Republic of China ... a ministry-level institution of the State Council'' - Wikipedia https://en.wikipedia.org/wiki/Xinhua_News_Agency (opened 2026-10-13); english.news.cn and xinhuanet.com home pages (opened 2026-10-13); desk rule Tier 3; lang ''other'': several language editions', NULL),
  ('Saudi Press Agency', 'ar', 'SA', 'state_aligned', 'Saudi Arabia (state news agency)', 3, 
   '''the state news agency of Saudi Arabia'' - Wikipedia https://en.wikipedia.org/wiki/Saudi_Press_Agency (opened 2026-10-13); spa.gov.sa home page (opened 2026-10-13); desk rule Tier 3', NULL),
  ('WAM (Emirates News Agency)', 'ar', 'AE', 'state_aligned', 'UAE (official news agency)', 3, 
   '''the official news agency of the United Arab Emirates'' - Wikipedia https://en.wikipedia.org/wiki/Emirates_News_Agency (opened 2026-10-13); wam.ae home page (opened 2026-10-13); desk rule Tier 3', NULL),
  ('Saba (Houthi-run, Sanaa)', 'ar', 'YE', 'state_aligned', 'Yemen - Houthi authorities (Supreme Political Council, Sanaa)', 3, 
   'SABA ''split into two rival agencies after the Houthi seizure of Sana''a (Jan 2015)''; Houthi version ''From Sana''a (saba.ye)'' - State Media Monitor https://statemediamonitor.com/yemen/ and https://statemediamonitor.com/2026/06/yemen-news-agency-saba/ (opened 2026-10-13); desk rule Tier 3', NULL),
  ('Saba (internationally recognised government)', 'ar', 'YE', 'state_aligned', 'Yemen - internationally recognised government (Presidential Leadership Council)', 3, 
   'Government SABA runs ''from government-held and exile/diplomatic locations'' as a separate site under the same name; its domain is not given and is NOT registered here - State Media Monitor https://statemediamonitor.com/yemen/ (opened 2026-10-13); desk rule Tier 3', NULL),
  ('Al-Ahram', 'other', 'EG', 'state_aligned', 'Egypt (majority government-owned)', 3, 
   '''majority owned by the Egyptian government'' (Wikipedia ''Ahram Online'' redirects to this article) - Wikipedia https://en.wikipedia.org/wiki/Al-Ahram (opened 2026-10-13); desk rule Tier 3 (Al-Ahram / Ahram Online / Al-Ahram Gate); lang ''other'': English (Ahram Online) and Arabic (Gate) editions', 'ahramonline'),
  ('Fana Media Corporation', 'en', 'ET', 'state_aligned', 'Ethiopia (state-owned)', 3, 
   '''Fana Media Corporation S.C. (FMC) is a state-owned mass media company operating in Ethiopia'' - Wikipedia https://en.wikipedia.org/wiki/Fana_Broadcasting_Corporate (opened 2026-10-13); fanamc.com home page (opened 2026-10-13); desk rule Tier 3', NULL),
  ('SONNA', 'en', 'SO', 'state_aligned', 'Somalia (Federal Government, Ministry of Information)', 3, 
   'SONNA listed as a department of the Ministry of Information, Culture & Tourism, Federal Government of Somalia - https://www.moi.gov.so/department.php?slug=sonna (opened 2026-10-13); sonna.so home page ''SONNA | Somali National News Agency'' (opened 2026-10-13); desk rule Tier 3', NULL),
  ('SUNA', 'ar', 'SD', 'state_aligned', 'Sudan (SAF-aligned government, Ministry of Culture and Information)', 3, 
   '''the news agency of the internationally recognised SAF-aligned Sudanese government''; domains suna-sd.net, suna-news.net - State Media Monitor https://statemediamonitor.com/2026/05/sudan-news-agency-suna/ (opened 2026-10-13); Wikipedia https://en.wikipedia.org/wiki/Sudan_News_Agency (opened 2026-10-13); desk rule Tier 3', NULL),
  ('ENA (Ethiopian News Agency)', 'en', 'ET', 'state_aligned', 'Ethiopia (official government news agency)', 3, 
   '''the official news agency of the government of Ethiopia'' - Wikipedia https://en.wikipedia.org/wiki/Ethiopian_News_Agency (opened 2026-10-13); ena.et home page (opened 2026-10-13); desk rule Tier 3', NULL),
  ('Shabait (Eritrea Ministry of Information)', 'en', 'ER', 'state_aligned', 'Eritrea (Ministry of Information)', 3, 
   'shabait.com home page title ''Eritrea Ministry Of Information'' (opened 2026-10-13); the Ministry is ''owner, operator, editor, censor and licensing authority'' of Eritrean domestic media - State Media Monitor https://statemediamonitor.com/eritrea/ (opened 2026-10-13); desk rule Tier 3', NULL),
  ('Al Mayadeen', 'ar', 'LB', 'state_aligned', 'Hezbollah / Iran-aligned (editorial alignment; owners undisclosed)', 3, 
   'Lebanese satellite channel ''categorized by many media outlets as pro-Hezbollah, pro-Assad and Iran-aligned''; owners described at launch as ''anonymous Arab businessmen''; website english.almayadeen.net - Wikipedia https://en.wikipedia.org/wiki/Al_Mayadeen (opened 2026-10-13); desk rule Tier 3 (SOURCES.md ''Hezbollah-aligned'')', NULL),
  ('CENTCOM', 'en', 'US', 'party', 'US military', 3, 
   '''one of the eleven unified combatant commands of the United States Department of Defense'' - Wikipedia https://en.wikipedia.org/wiki/United_States_Central_Command (opened 2026-10-13); production article_sources ''centcom'' (is_party_source, US Military); desk rule party', 'centcom'),
  ('US Department of Defense', 'en', 'US', 'party', 'US government (Department of Defense / Department of War)', 3, 
   '''also referred to as the Department of War ... an executive department of the United States federal government'' - Wikipedia https://en.wikipedia.org/wiki/United_States_Department_of_Defense (opened 2026-10-13); production source ''Pentagon (DoD)'' publishes from war.gov; desk rule party', NULL),
  ('IDF', 'en', 'IL', 'party', 'Israeli military', 3, 
   '''the national military of the State of Israel'' - Wikipedia https://en.wikipedia.org/wiki/Israel_Defense_Forces (opened 2026-10-13); idf.il home page (opened 2026-10-13); production article_sources ''idf'' (is_party_source, Israeli Military); desk rule party', 'idf'),
  ('Al-Masirah', 'ar', 'YE', 'party', 'Houthi movement (Ansar Allah)', 3, 
   '''a Yemeni TV channel owned by the Houthi movement''; website english.almasirah.net.ye - Wikipedia https://en.wikipedia.org/wiki/Al-Masirah (opened 2026-10-13); desk rule party', NULL),
  ('Al-Manar', 'ar', 'LB', 'party', 'Hezbollah', 3, 
   '''owned and operated by the Lebanese Shia Islamist political party and paramilitary group Hezbollah''; infobox owner ''Hezbollah (Lebanese Communication Group)'', website english.almanar.com.lb - Wikipedia https://en.wikipedia.org/wiki/Al-Manar (opened 2026-10-13); desk rule party', NULL),
  ('The Jerusalem Post', 'en', 'IL', 'independent', NULL, 2, 
   'Owned since 2004 by Mirkaei Tikshoret, an Israeli media firm controlled by investor Eli Azur - Wikipedia https://en.wikipedia.org/wiki/The_Jerusalem_Post (opened 2026-10-13); SOURCES.md Tier 2', NULL),
  ('Al-Monitor', 'en', 'US', 'independent', NULL, 2, 
   'News website launched in 2012 by entrepreneur Jamal Daniel, based in Washington DC - Wikipedia https://en.wikipedia.org/wiki/Al-Monitor (opened 2026-10-13); SOURCES.md Tier 2', 'almonitor'),
  ('Asharq Al-Awsat', 'other', 'SA', 'state_aligned', 'Saudi Arabia (owned by a member of the royal family; supports the Saudi government)', NULL, 
   'Published by SRMG; ''founded with the approval of the Saudi royal family and government ministers ... noted for its support of the Saudi government ... owned by Faisal bin Salman bin Abdulaziz Al Saud'' - Wikipedia https://en.wikipedia.org/wiki/Asharq_Al-Awsat (opened 2026-10-13); lang ''other'': Arabic and English editions', NULL),
  ('Haaretz', 'en', 'IL', 'independent', NULL, 2, 
   '''Amos Schocken, and his siblings own 60% of the company'' (DuMont Schauberg and Leonid Nevzlin minority stakes, 2016 FT report) - https://www.familybusinessmagazine.com/uncategorized/german-firm-plans-to-sell-its-stake-in-family-controlled-haaretz/ (opened 2026-10-13); SOURCES.md Tier 2', 'haaretz'),
  ('Naharnet', 'en', 'LB', 'independent', NULL, NULL, 
   '''not affiliated to any political parties ... privately held and self-sustainable'' - About Naharnet https://www.naharnet.com/about (opened 2026-10-13)', NULL),
  ('The Hindu', 'en', 'IN', 'independent', NULL, NULL, 
   'Owned by The Hindu Group; family-owned since 1905 - Wikipedia https://en.wikipedia.org/wiki/The_Hindu (opened 2026-10-13)', NULL),
  ('Anadolu Agency', 'other', 'TR', 'state_aligned', 'Turkey (state-run news agency)', NULL, 
   '''a state-run news agency headquartered in Ankara, Turkey'' - Wikipedia https://en.wikipedia.org/wiki/Anadolu_Agency (opened 2026-10-13); lang ''other'': Turkish and English editions on aa.com.tr', NULL),
  ('The Times of India', 'en', 'IN', 'independent', NULL, NULL, 
   '''owned and published by Bennett, Coleman & Co.'' - Wikipedia https://en.wikipedia.org/wiki/The_Times_of_India (opened 2026-10-13)', NULL),
  ('The Economic Times', 'en', 'IN', 'independent', NULL, NULL, 
   '''Published by The Times Group'' - Wikipedia https://en.wikipedia.org/wiki/The_Economic_Times (opened 2026-10-13)', NULL),
  ('ARY News', 'en', 'PK', 'independent', NULL, NULL, 
   'Part of the ARY Digital Network, a subsidiary of ARY Group (Karachi) - Wikipedia https://en.wikipedia.org/wiki/ARY_News (opened 2026-10-13)', NULL),
  ('Israel Hayom', 'en', 'IL', 'independent', NULL, NULL, 
   '''Owned by the family of Sheldon Adelson''; right-wing editorial stance - Wikipedia https://en.wikipedia.org/wiki/Israel_Hayom (opened 2026-10-13)', NULL),
  ('The Peninsula', 'en', 'QA', 'state_aligned', 'Qatar (owned by a senior member of the ruling family; pro-government)', NULL, 
   '''English-language pro-government daily ... owned by a senior member of the Qatari ruling family, Khalid bin Thani Al Thani'' - Wikipedia https://en.wikipedia.org/wiki/The_Peninsula_(newspaper) (opened 2026-10-13)', NULL),
  ('Dawn', 'en', 'PK', 'independent', NULL, NULL, 
   'Flagship publication of the Dawn Media Group - Wikipedia https://en.wikipedia.org/wiki/Dawn_(newspaper) (opened 2026-10-13)', NULL),
  ('NDTV', 'en', 'IN', 'independent', NULL, NULL, 
   'Indian news media company; ''In 2022, the Adani Group acquired a majority stake'' - Wikipedia https://en.wikipedia.org/wiki/NDTV (opened 2026-10-13)', NULL),
  ('GlobalSecurity.org', 'en', 'US', 'independent', NULL, NULL, 
   '''an American independent, nonpartisan, nonprofit organization'' - Wikipedia https://en.wikipedia.org/wiki/GlobalSecurity.org (opened 2026-10-13)', NULL),
  ('Egypt Independent', 'en', 'EG', 'independent', NULL, NULL, 
   'English edition of Al-Masry Al-Youm, ''an Egyptian privately owned daily newspaper'' - Wikipedia https://en.wikipedia.org/wiki/Al-Masry_Al-Youm and https://en.wikipedia.org/wiki/Egypt_Independent (opened 2026-10-13)', 'egyptindependent'),
  ('Geo News', 'en', 'PK', 'independent', NULL, NULL, 
   '''owned by the Jang Media Group'', launched by Mir Shakil-ur-Rahman - Wikipedia https://en.wikipedia.org/wiki/Geo_News (opened 2026-10-13)', NULL),
  ('Hindustan Times', 'en', 'IN', 'independent', NULL, NULL, 
   'Flagship of HT Media Limited, controlled by the Birla family - Wikipedia https://en.wikipedia.org/wiki/Hindustan_Times (opened 2026-10-13)', NULL),
  ('IANS', 'en', 'IN', 'independent', NULL, NULL, 
   '''a private Indian news agency''; Adani group majority stake since Dec 2023 - Wikipedia https://en.wikipedia.org/wiki/Indo-Asian_News_Service (opened 2026-10-13)', NULL),
  ('Radio Dabanga', 'other', 'NL', 'independent', NULL, NULL, 
   'Set up in Amsterdam with Free Press Unlimited support; ''In 2021 Dabanga registered as an independent organisation'' - https://freepressunlimited.org/en/projects/radio-dabanga-radio-life (opened 2026-10-13); lang ''other'': Arabic and English editions', NULL),
  ('WAFA', 'en', 'PS', 'state_aligned', 'Palestinian Authority (official state-run agency; Fatah-aligned)', NULL, 
   '''the official state-run news agency of the Palestinian National Authority'' - Wikipedia https://en.wikipedia.org/wiki/WAFA (opened 2026-10-13)', NULL),
  ('The Hill', 'en', 'US', 'independent', NULL, NULL, 
   '''owned by Nexstar Media Group since 2021'' - Wikipedia https://en.wikipedia.org/wiki/The_Hill_(newspaper) (opened 2026-10-13)', NULL),
  ('Axios', 'en', 'US', 'independent', NULL, NULL, 
   '''In September 2022, Cox Enterprises completed its acquisition of Axios'' - Wikipedia https://en.wikipedia.org/wiki/Axios_(website) (opened 2026-10-13)', NULL),
  ('Foreign Policy', 'en', 'US', 'independent', NULL, NULL, 
   'Published by The FP Group, a division of Graham Holdings Company - Wikipedia https://en.wikipedia.org/wiki/Foreign_Policy (opened 2026-10-13)', NULL),
  ('New York Post', 'en', 'US', 'independent', NULL, NULL, 
   '''In 1976, Rupert Murdoch''s News Corp bought the Post'' - Wikipedia https://en.wikipedia.org/wiki/New_York_Post (opened 2026-10-13)', NULL),
  ('The Jordan Times', 'en', 'JO', 'independent', NULL, NULL, 
   '''an independent English-language daily published by the Jordan Press Foundation ... a shareholding company listed on the Amman Stock Exchange'' (self-description) - https://jordantimes.com/about-us (opened 2026-10-13)', NULL),
  ('SANA', 'other', 'SY', 'state_aligned', 'Syria (state-owned; Ministry of Information)', NULL, 
   '''a Syrian state-owned news agency, linked to the country''s ministry of information'' - Wikipedia https://en.wikipedia.org/wiki/Syrian_Arab_News_Agency (opened 2026-10-13)', NULL),
  ('The Reporter (Ethiopia)', 'en', 'ET', 'independent', NULL, NULL, 
   '''a private newspaper published in Addis Ababa'' - Wikipedia https://en.wikipedia.org/wiki/The_Reporter_(Ethiopia) (opened 2026-10-13)', NULL),
  ('i24NEWS', 'en', 'IL', 'independent', NULL, NULL, 
   '''mainly financed and founded by Franco-Israeli telecoms tycoon Patrick Drahi'' - Wikipedia https://en.wikipedia.org/wiki/I24NEWS (opened 2026-10-13)', NULL),
  ('Breitbart News', 'en', 'US', 'independent', NULL, NULL, 
   'Co-owned by Larry Solov, Susie Breitbart and the Mercer family; far-right editorial line - Wikipedia https://en.wikipedia.org/wiki/Breitbart_News (opened 2026-10-13)', NULL),
  ('Africanews', 'en', 'FR', 'independent', NULL, NULL, 
   '''Africanews is a 100% subsidiary from Euronews S.A. financed through commercial revenues ... Editorially independent from Euronews'' - Africanews press room https://www.africanews.com/page/pressroom/ (opened 2026-10-13); Euronews ''majority-owned by Alpac Capital'' - Wikipedia https://en.wikipedia.org/wiki/Euronews (opened 2026-10-13)', NULL),
  ('Ynetnews', 'en', 'IL', 'independent', NULL, NULL, 
   'Ynetnews, English edition of Ynet, ''is part of the prominent Yedioth Media Group'' (publisher of Yedioth Ahronoth) - Ynetnews about page https://www.ynetnews.com/articles/0,7340,L-3028645,00.html (opened 2026-10-13)', NULL),
  ('The Times of Israel', 'en', 'IL', 'independent', NULL, NULL, 
   'Online newspaper co-founded by journalist David Horovitz and investor Seth Klarman - Wikipedia https://en.wikipedia.org/wiki/The_Times_of_Israel (opened 2026-10-13)', NULL),
  ('The Media Line', 'en', 'US', 'independent', NULL, NULL, 
   '''an American news agency and a nonprofit organization established in 2000 by Felice Friedson'' - Wikipedia https://en.wikipedia.org/wiki/The_Media_Line (opened 2026-10-13)', NULL),
  ('Critical Threats Project', 'en', 'US', 'independent', NULL, NULL, 
   '''a research organization and think tank operated by the American Enterprise Institute'' - Wikipedia https://en.wikipedia.org/wiki/Critical_Threats_Project (opened 2026-10-13)', NULL),
  ('Euronews', 'en', 'FR', 'independent', NULL, NULL, 
   '''currently majority-owned by Alpac Capital'' - Wikipedia https://en.wikipedia.org/wiki/Euronews (opened 2026-10-13)', NULL),
  ('ThePrint', 'en', 'IN', 'independent', NULL, NULL, 
   '''owned by Printline Media Pvt Ltd'', launched by journalist Shekhar Gupta - Wikipedia https://en.wikipedia.org/wiki/ThePrint (opened 2026-10-13)', NULL),
  ('Mada Masr', 'other', 'EG', 'independent', NULL, 2, 
   '''an independent Egyptian online newspaper'' - Wikipedia https://en.wikipedia.org/wiki/Mada_Masr (opened 2026-10-13); SOURCES.md Tier 2; lang ''other'': Arabic and English', NULL);

INSERT INTO public.outlets (name, lang, country_code, party_status, party_affiliation, source_tier, classification_basis, article_source_id)
SELECT s.name, s.lang, s.country_code, s.party_status, s.party_affiliation, s.source_tier, s.classification_basis,
       (SELECT a.id FROM public.article_sources a
         WHERE a.name = s.article_source_name
           AND (SELECT count(*) FROM public.article_sources a2 WHERE a2.name = s.article_source_name) = 1)
  FROM _seed_outlets s
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------------------------------
-- 2. Aliases (alias_kind, alias, outlet name). Hosts bare (url_host strips 'www.'), lowercase.
-- ---------------------------------------------------------------------------------------------------
CREATE TEMP TABLE _seed_aliases (alias_kind text, alias text, outlet_name text) ON COMMIT DROP;
INSERT INTO _seed_aliases VALUES
  ('host', 'afp.com', 'AFP'),
  ('source_name', 'reuters.com', 'Reuters'),
  ('host', 'reuters.com', 'Reuters'),
  ('host', 'apnews.com', 'Associated Press'),
  ('source_name', 'politifact.com', 'PolitiFact'),
  ('host', 'politifact.com', 'PolitiFact'),
  ('host', 'netblocks.org', 'NetBlocks'),
  ('source_name', 'hrw.org', 'Human Rights Watch'),
  ('host', 'hrw.org', 'Human Rights Watch'),
  ('source_name', 'Financial Times', 'Financial Times'),
  ('host', 'ft.com', 'Financial Times'),
  ('source_name', 'aljazeera.com', 'Al Jazeera English'),
  ('source_name', 'Al Jazeera', 'Al Jazeera English'),
  ('host', 'aljazeera.com', 'Al Jazeera English'),
  ('source_name', 'aljazeera.net', 'Al Jazeera Arabic'),
  ('host', 'aljazeera.net', 'Al Jazeera Arabic'),
  ('source_name', 'bbc.com', 'BBC News'),
  ('source_name', 'bbc.co.uk', 'BBC News'),
  ('source_name', 'BBC World', 'BBC News'),
  ('source_name', 'BBC Middle East', 'BBC News'),
  ('host', 'bbc.com', 'BBC News'),
  ('host', 'bbc.co.uk', 'BBC News'),
  ('source_name', 'theguardian.com', 'The Guardian'),
  ('host', 'theguardian.com', 'The Guardian'),
  ('source_name', 'nytimes.com', 'The New York Times'),
  ('host', 'nytimes.com', 'The New York Times'),
  ('host', 'washingtonpost.com', 'The Washington Post'),
  ('source_name', 'cnn.com', 'CNN'),
  ('host', 'cnn.com', 'CNN'),
  ('host', 'edition.cnn.com', 'CNN'),
  ('host', 'us.cnn.com', 'CNN'),
  ('host', 'arabic.cnn.com', 'CNN'),
  ('host', 'cnnespanol.cnn.com', 'CNN'),
  ('source_name', 'middleeasteye.net', 'Middle East Eye'),
  ('source_name', 'Middle East Eye', 'Middle East Eye'),
  ('host', 'middleeasteye.net', 'Middle East Eye'),
  ('source_name', 'Sudan Tribune (AR)', 'Sudan Tribune'),
  ('host', 'sudantribune.com', 'Sudan Tribune'),
  ('host', 'sudantribune.net', 'Sudan Tribune'),
  ('host', 'addisstandard.com', 'Addis Standard'),
  ('source_name', 'thenationalnews.com', 'The National'),
  ('host', 'thenationalnews.com', 'The National'),
  ('source_name', 'arabnews.com', 'Arab News'),
  ('host', 'arabnews.com', 'Arab News'),
  ('source_name', 'IRNA English', 'IRNA'),
  ('host', 'en.irna.ir', 'IRNA'),
  ('source_name', 'ISNA (Iran Students)', 'ISNA'),
  ('host', 'en.isna.ir', 'ISNA'),
  ('host', 'isna.ir', 'ISNA'),
  ('source_name', 'Mehr News', 'Mehr News Agency'),
  ('host', 'en.mehrnews.com', 'Mehr News Agency'),
  ('host', 'mehrnews.com', 'Mehr News Agency'),
  ('host', 'tasnimnews.ir', 'Tasnim News Agency'),
  ('host', 'farsnews.ir', 'Fars News Agency'),
  ('source_name', 'presstv.co.uk', 'Press TV'),
  ('source_name', 'presstv.ir', 'Press TV'),
  ('host', 'presstv.ir', 'Press TV'),
  ('host', 'presstv.co.uk', 'Press TV'),
  ('source_name', 'TASS', 'TASS'),
  ('host', 'tass.com', 'TASS'),
  ('source_name', 'rt.com', 'RT'),
  ('source_name', 'RT (Russian State)', 'RT'),
  ('source_name', 'RT Arabic', 'RT'),
  ('host', 'rt.com', 'RT'),
  ('host', 'actualidad.rt.com', 'RT'),
  ('host', 'russian.rt.com', 'RT'),
  ('host', 'arabic.rt.com', 'RT'),
  ('source_name', 'xinhuanet.com', 'Xinhua'),
  ('source_name', 'english.news.cn', 'Xinhua'),
  ('source_name', 'arabic.news.cn', 'Xinhua'),
  ('host', 'xinhuanet.com', 'Xinhua'),
  ('host', 'english.news.cn', 'Xinhua'),
  ('host', 'french.xinhuanet.com', 'Xinhua'),
  ('host', 'spanish.xinhuanet.com', 'Xinhua'),
  ('host', 'arabic.news.cn', 'Xinhua'),
  ('host', 'spa.gov.sa', 'Saudi Press Agency'),
  ('host', 'wam.ae', 'WAM (Emirates News Agency)'),
  ('host', 'saba.ye', 'Saba (Houthi-run, Sanaa)'),
  ('source_name', 'ahram.org.eg', 'Al-Ahram'),
  ('host', 'english.ahram.org.eg', 'Al-Ahram'),
  ('host', 'gate.ahram.org.eg', 'Al-Ahram'),
  ('source_name', 'Fana Media Corporation (Ethiopia)', 'Fana Media Corporation'),
  ('host', 'fanamc.com', 'Fana Media Corporation'),
  ('source_name', 'SONNA (Somali National News Agency)', 'SONNA'),
  ('host', 'sonna.so', 'SONNA'),
  ('host', 'suna-sd.net', 'SUNA'),
  ('host', 'suna-news.net', 'SUNA'),
  ('host', 'ena.et', 'ENA (Ethiopian News Agency)'),
  ('source_name', 'shabait.com', 'Shabait (Eritrea Ministry of Information)'),
  ('host', 'shabait.com', 'Shabait (Eritrea Ministry of Information)'),
  ('host', 'almayadeen.net', 'Al Mayadeen'),
  ('host', 'english.almayadeen.net', 'Al Mayadeen'),
  ('host', 'centcom.mil', 'CENTCOM'),
  ('source_name', 'Pentagon (DoD)', 'US Department of Defense'),
  ('host', 'war.gov', 'US Department of Defense'),
  ('host', 'defense.gov', 'US Department of Defense'),
  ('host', 'idf.il', 'IDF'),
  ('host', 'english.almasirah.net.ye', 'Al-Masirah'),
  ('host', 'almanar.com.lb', 'Al-Manar'),
  ('host', 'english.almanar.com.lb', 'Al-Manar'),
  ('source_name', 'jpost.com', 'The Jerusalem Post'),
  ('host', 'jpost.com', 'The Jerusalem Post'),
  ('source_name', 'al-monitor.com', 'Al-Monitor'),
  ('source_name', 'Al-Monitor', 'Al-Monitor'),
  ('host', 'al-monitor.com', 'Al-Monitor'),
  ('source_name', 'aawsat.com', 'Asharq Al-Awsat'),
  ('source_name', 'Asharq Al-Awsat', 'Asharq Al-Awsat'),
  ('host', 'aawsat.com', 'Asharq Al-Awsat'),
  ('host', 'english.aawsat.com', 'Asharq Al-Awsat'),
  ('source_name', 'haaretz.com', 'Haaretz'),
  ('host', 'haaretz.com', 'Haaretz'),
  ('source_name', 'naharnet.com', 'Naharnet'),
  ('host', 'naharnet.com', 'Naharnet'),
  ('host', 'mobile.naharnet.com', 'Naharnet'),
  ('host', 'prod.naharnet.com', 'Naharnet'),
  ('source_name', 'thehindu.com', 'The Hindu'),
  ('source_name', 'The Hindu', 'The Hindu'),
  ('host', 'thehindu.com', 'The Hindu'),
  ('source_name', 'aa.com.tr', 'Anadolu Agency'),
  ('host', 'aa.com.tr', 'Anadolu Agency'),
  ('host', 'timesofindia.indiatimes.com', 'The Times of India'),
  ('host', 'economictimes.indiatimes.com', 'The Economic Times'),
  ('source_name', 'arynews.tv', 'ARY News'),
  ('source_name', 'ARY News (Pakistan)', 'ARY News'),
  ('host', 'arynews.tv', 'ARY News'),
  ('source_name', 'Israel Hayom', 'Israel Hayom'),
  ('host', 'israelhayom.com', 'Israel Hayom'),
  ('source_name', 'thepeninsulaqatar.com', 'The Peninsula'),
  ('host', 'thepeninsulaqatar.com', 'The Peninsula'),
  ('source_name', 'Dawn (Pakistan)', 'Dawn'),
  ('host', 'dawn.com', 'Dawn'),
  ('source_name', 'NDTV (India)', 'NDTV'),
  ('host', 'ndtv.com', 'NDTV'),
  ('source_name', 'globalsecurity.org', 'GlobalSecurity.org'),
  ('host', 'globalsecurity.org', 'GlobalSecurity.org'),
  ('source_name', 'egyptindependent.com', 'Egypt Independent'),
  ('source_name', 'Egypt Independent', 'Egypt Independent'),
  ('host', 'egyptindependent.com', 'Egypt Independent'),
  ('source_name', 'geo.tv', 'Geo News'),
  ('host', 'geo.tv', 'Geo News'),
  ('source_name', 'hindustantimes.com', 'Hindustan Times'),
  ('host', 'hindustantimes.com', 'Hindustan Times'),
  ('source_name', 'ianslive.in', 'IANS'),
  ('host', 'ianslive.in', 'IANS'),
  ('source_name', 'dabangasudan.org', 'Radio Dabanga'),
  ('source_name', 'Radio Dabanga (AR)', 'Radio Dabanga'),
  ('source_name', 'Radio Dabanga (EN)', 'Radio Dabanga'),
  ('host', 'dabangasudan.org', 'Radio Dabanga'),
  ('source_name', 'english.wafa.ps', 'WAFA'),
  ('host', 'english.wafa.ps', 'WAFA'),
  ('source_name', 'The Hill', 'The Hill'),
  ('host', 'thehill.com', 'The Hill'),
  ('source_name', 'Axios', 'Axios'),
  ('host', 'axios.com', 'Axios'),
  ('source_name', 'foreignpolicy.com', 'Foreign Policy'),
  ('source_name', 'Foreign Policy', 'Foreign Policy'),
  ('host', 'foreignpolicy.com', 'Foreign Policy'),
  ('source_name', 'nypost.com', 'New York Post'),
  ('host', 'nypost.com', 'New York Post'),
  ('source_name', 'jordantimes.com', 'The Jordan Times'),
  ('source_name', 'Jordan Times', 'The Jordan Times'),
  ('host', 'jordantimes.com', 'The Jordan Times'),
  ('source_name', 'sana.sy', 'SANA'),
  ('host', 'sana.sy', 'SANA'),
  ('source_name', 'thereporterethiopia.com', 'The Reporter (Ethiopia)'),
  ('host', 'thereporterethiopia.com', 'The Reporter (Ethiopia)'),
  ('source_name', 'i24news.tv', 'i24NEWS'),
  ('host', 'i24news.tv', 'i24NEWS'),
  ('source_name', 'breitbart.com', 'Breitbart News'),
  ('host', 'breitbart.com', 'Breitbart News'),
  ('source_name', 'africanews.com', 'Africanews'),
  ('source_name', 'Africanews', 'Africanews'),
  ('host', 'africanews.com', 'Africanews'),
  ('source_name', 'ynetnews.com', 'Ynetnews'),
  ('host', 'ynetnews.com', 'Ynetnews'),
  ('host', 'timesofisrael.com', 'The Times of Israel'),
  ('host', 'themedialine.org', 'The Media Line'),
  ('host', 'criticalthreats.org', 'Critical Threats Project'),
  ('host', 'euronews.com', 'Euronews'),
  ('host', 'theprint.in', 'ThePrint'),
  ('host', 'madamasr.com', 'Mada Masr');

INSERT INTO public.outlet_aliases (alias_kind, alias, outlet_id)
SELECT s.alias_kind, s.alias, o.id
  FROM _seed_aliases s
  JOIN public.outlets o ON o.name = s.outlet_name
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------------
-- 3. Postflight: report (never overwrite) pre-existing rows that differ from this seed.
-- ---------------------------------------------------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(s.name || ' (existing: ' || o.party_status || '/' || coalesce(o.source_tier::text, '-') || ')', '; ') INTO v
    FROM _seed_outlets s JOIN public.outlets o ON o.name = s.name
   WHERE (o.party_status, coalesce(o.source_tier, 0), o.classification_basis)
         IS DISTINCT FROM (s.party_status, coalesce(s.source_tier, 0), s.classification_basis);
  IF v IS NOT NULL THEN RAISE WARNING 'outlet_registry_seed: existing outlet rows kept as they are: %', v; END IF;
  SELECT string_agg(s.alias_kind || ':' || s.alias || ' -> ' || o.name, '; ') INTO v
    FROM _seed_aliases s JOIN public.outlet_aliases a ON a.alias_kind = s.alias_kind AND a.alias = s.alias
    JOIN public.outlets o ON o.id = a.outlet_id
   WHERE o.name <> s.outlet_name;
  IF v IS NOT NULL THEN RAISE WARNING 'outlet_registry_seed: existing aliases point elsewhere and were kept: %', v; END IF;
  IF EXISTS (SELECT 1 FROM _seed_aliases s WHERE NOT EXISTS (SELECT 1 FROM public.outlet_aliases a
                                                              WHERE a.alias_kind = s.alias_kind AND a.alias = s.alias)) THEN
    RAISE EXCEPTION 'outlet_registry_seed: some seeded aliases were not written';
  END IF;
END $$;

COMMIT;
