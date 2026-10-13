-- Production-shaped fixture for supabase/tests/outlet_registry_seed_test.sql (scratch databases only).
-- 1. The production constraints and triggers of public.outlets / public.outlet_aliases, verbatim from
--    pg_get_constraintdef / pg_get_triggerdef on qmaszkkyukgiludcakjg (read 2026-10-13). The live-schema
--    replica carries the tables without them, and the seed must be tested against what production enforces.
-- 2. The 26 production public.article_sources rows (id, name, display_name, url, party flags) as read on
--    2026-10-13, so article_source_id linking is exercised with the real ids.
-- 3. t_prod_top: the production top-120 articles.source_name values, 30 days to 2026-10-13 12:00 UTC, with
--    their url_host() set (read-only SELECT on production, 2026-10-13).
-- Nothing here is invented: every value was read from production.
SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION public.intel_lang_valid(l text)
 RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $function$
  SELECT l IN ('en','ar','fa','he','fr','de','ru','tr','es','zh','ur','hi','other','unknown')
$function$;
CREATE OR REPLACE FUNCTION public.reject_mutation()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION '% on %.% is not allowed (append-only / retention-safe table)',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $function$;
CREATE OR REPLACE FUNCTION public.url_host(u text)
 RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $function$
  SELECT regexp_replace(lower(substring(u FROM '^https?://([^/:?#[:space:]]+)')), '^www\.', '')
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('outlets', 'outlets_affil_chk', $c$CHECK (((party_status <> ALL (ARRAY['party'::text, 'state_aligned'::text])) OR (length(btrim(COALESCE(party_affiliation, ''::text))) > 0)))$c$),
    ('outlets', 'outlets_article_source_id_fkey', 'FOREIGN KEY (article_source_id) REFERENCES article_sources(id) ON DELETE SET NULL'),
    ('outlets', 'outlets_basis_chk', 'CHECK ((length(btrim(classification_basis)) >= 3))'),
    ('outlets', 'outlets_country_chk', $c$CHECK (((country_code IS NULL) OR (country_code ~ '^[A-Z]{2}$'::text)))$c$),
    ('outlets', 'outlets_lang_chk', 'CHECK (intel_lang_valid(lang))'),
    ('outlets', 'outlets_name_key', 'UNIQUE (name)'),
    ('outlets', 'outlets_party_chk', $c$CHECK ((party_status = ANY (ARRAY['party'::text, 'state_aligned'::text, 'independent'::text, 'unknown'::text])))$c$),
    ('outlets', 'outlets_tier_chk', 'CHECK (((source_tier IS NULL) OR ((source_tier >= 1) AND (source_tier <= 3))))'),
    ('outlet_aliases', 'outlet_aliases_host_chk', $c$CHECK (((alias_kind <> 'host'::text) OR (alias ~ '^[a-z0-9.-]+$'::text)))$c$),
    ('outlet_aliases', 'outlet_aliases_kind_chk', $c$CHECK ((alias_kind = ANY (ARRAY['source_name'::text, 'host'::text])))$c$),
    ('outlet_aliases', 'outlet_aliases_outlet_id_fkey', 'FOREIGN KEY (outlet_id) REFERENCES outlets(id)')
  ) v(t, n, d)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.n AND conrelid = ('public.' || r.t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', r.t, r.n, r.d);
    END IF;
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS outlets_no_delete ON public.outlets;
CREATE TRIGGER outlets_no_delete BEFORE DELETE ON public.outlets FOR EACH ROW EXECUTE FUNCTION reject_mutation();
DROP TRIGGER IF EXISTS outlets_no_truncate ON public.outlets;
CREATE TRIGGER outlets_no_truncate BEFORE TRUNCATE ON public.outlets FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
DROP TRIGGER IF EXISTS outlets_updated_at ON public.outlets;
CREATE TRIGGER outlets_updated_at BEFORE UPDATE ON public.outlets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS outlet_aliases_no_delete ON public.outlet_aliases;
CREATE TRIGGER outlet_aliases_no_delete BEFORE DELETE ON public.outlet_aliases FOR EACH ROW EXECUTE FUNCTION reject_mutation();
DROP TRIGGER IF EXISTS outlet_aliases_no_truncate ON public.outlet_aliases;
CREATE TRIGGER outlet_aliases_no_truncate BEFORE TRUNCATE ON public.outlet_aliases FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();

-- 2. production article_sources (2026-10-13)
INSERT INTO public.article_sources (id, name, display_name, url, is_party_source, party_affiliation) VALUES
  ('36dac900-c880-4cab-ba5c-d7162962f7d9', 'afp', 'AFP', 'https://www.afp.com', false, NULL),
  ('9fe5039f-6319-48f6-bbd3-587e8584f22e', 'ahramonline', 'Ahram Online', 'https://english.ahram.org.eg', false, NULL),
  ('bb2d405d-c5ad-4893-bf43-210aac267c07', 'aljazeera_ar', 'Al Jazeera Arabic', 'https://www.aljazeera.net', false, NULL),
  ('ace2dddc-d47c-46b8-b803-86ebf448da75', 'aljazeera_en', 'Al Jazeera English', 'https://www.aljazeera.com', false, NULL),
  ('d5f668b7-3208-4711-a727-fafed4199592', 'almonitor', 'Al-Monitor', 'https://www.al-monitor.com', false, NULL),
  ('67c1ed9b-7d91-4b05-8d26-f7d496322a06', 'ap', 'Associated Press', 'https://apnews.com', false, NULL),
  ('ff7ebd28-ecac-496b-b914-6f3f576a4dba', 'bbc_middleeast', 'BBC Middle East', 'https://www.bbc.com/news/world/middle_east', false, NULL),
  ('9a1f64e3-c1f5-4ec7-87bd-bc4bac48956f', 'centcom', 'CENTCOM', 'https://www.centcom.mil', true, 'US Military'),
  ('92250f85-5236-4196-a3d0-aa4ba14a2fdf', 'cnn', 'CNN', 'https://edition.cnn.com', false, NULL),
  ('e9e9afb8-2348-4b5d-8a30-04dab84e154c', 'egyptindependent', 'Egypt Independent', 'https://www.egyptindependent.com', false, NULL),
  ('2618d2de-3f10-4a3f-92a1-84182a05136b', 'fars', 'Fars News Agency', 'https://www.farsnews.ir', true, 'IRGC-affiliated'),
  ('9bc756d3-9b64-4ec4-925b-fd151f7bb8b1', 'ft', 'Financial Times', 'https://www.ft.com', false, NULL),
  ('e77065fa-a7ab-4bd8-a93b-aeaa7b6b07a5', 'haaretz', 'Haaretz', 'https://www.haaretz.com', false, NULL),
  ('53e57d75-d792-4439-826f-7074910afd55', 'hrw', 'Human Rights Watch', 'https://www.hrw.org', false, NULL),
  ('e7682786-5832-49d1-8a7a-51e442685e44', 'idf', 'IDF Spokesperson', 'https://www.idf.il', true, 'Israeli Military'),
  ('135f26b7-740f-4789-bfe0-26958c1f7768', 'irna', 'IRNA', 'https://en.irna.ir', true, 'Iran State Media'),
  ('dab6c7d0-84f8-481c-a0a6-fc5944bcdc83', 'kpler', 'Kpler', 'https://www.kpler.com', false, NULL),
  ('46df9b7e-e90c-4cc5-802a-cb9e02f24d21', 'mee', 'Middle East Eye', 'https://www.middleeasteye.net', false, NULL),
  ('b1e5e9db-1767-4ed9-9cf6-5950815eb5c4', 'netblocks', 'NetBlocks', 'https://netblocks.org', false, NULL),
  ('bcefb1dd-c891-4432-ae54-62fbd33a8821', 'orientsxxi', 'Orient XXI', 'https://orientxxi.info', false, NULL),
  ('fcc634b0-23df-4353-a8fe-5e892932311d', 'presstv', 'PressTV', 'https://www.presstv.ir', true, 'Iran State Media'),
  ('9f4c44dc-dc2d-4159-9e84-946706f9b668', 'reuters', 'Reuters', 'https://www.reuters.com', false, NULL),
  ('1dea9de7-8790-456a-868c-8f6c2bced5d4', 'guardian', 'The Guardian', 'https://www.theguardian.com', false, NULL),
  ('0f149be4-cf94-4d52-b362-4a33aa8b7a38', 'thenationalnews', 'The National', 'https://www.thenationalnews.com', false, NULL),
  ('4f3d8d45-755d-4268-a3ad-40abe3551997', 'vortexa', 'Vortexa', 'https://www.vortexa.com', false, NULL),
  ('e67778cb-e4f0-4890-8c49-3a611859918b', 'wsj', 'Wall Street Journal', 'https://www.wsj.com', false, NULL)
ON CONFLICT (id) DO NOTHING;

-- 3. production top-120 source_names (30 days to 2026-10-13 12:00 UTC)
CREATE TABLE IF NOT EXISTS t_prod_top (source_name text PRIMARY KEY, n integer NOT NULL, hosts text[] NOT NULL);
INSERT INTO t_prod_top VALUES
  ('jpost.com', 999, '{jpost.com}'::text[]),
  ('middleeasteye.net', 691, '{middleeasteye.net}'::text[]),
  ('middleeastmonitor.com', 490, '{middleeastmonitor.com}'::text[]),
  ('aljazeera.com', 372, '{aljazeera.com}'::text[]),
  ('al-monitor.com', 367, '{al-monitor.com}'::text[]),
  ('aawsat.com', 357, '{aawsat.com,english.aawsat.com}'::text[]),
  ('Middle East Eye', 338, '{middleeasteye.net}'::text[]),
  ('haaretz.com', 324, '{haaretz.com}'::text[]),
  ('Intel Slava', 297, '{t.me}'::text[]),
  ('naharnet.com', 240, '{mobile.naharnet.com,naharnet.com,prod.naharnet.com}'::text[]),
  ('thenationalnews.com', 230, '{thenationalnews.com}'::text[]),
  ('rt.com', 228, '{actualidad.rt.com,arabic.rt.com,russian.rt.com}'::text[]),
  ('Mehr News', 204, '{en.mehrnews.com}'::text[]),
  ('IRNA English', 198, '{en.irna.ir}'::text[]),
  ('bignewsnetwork.com', 166, '{bignewsnetwork.com}'::text[]),
  ('gulfnews.com', 163, '{gulfnews.com}'::text[]),
  ('thehindu.com', 161, '{thehindu.com}'::text[]),
  ('cnn.com', 156, '{arabic.cnn.com,cnn.com,cnnespanol.cnn.com,edition.cnn.com,us.cnn.com}'::text[]),
  ('Al Jazeera', 154, '{aljazeera.com}'::text[]),
  ('aninews.in', 150, '{aninews.in}'::text[]),
  ('presstv.co.uk', 150, '{presstv.co.uk}'::text[]),
  ('ISNA (Iran Students)', 148, '{en.isna.ir}'::text[]),
  ('Middle East Monitor', 147, '{middleeastmonitor.com}'::text[]),
  ('dailysabah.com', 145, '{dailysabah.com}'::text[]),
  ('aol.co.uk', 139, '{aol.co.uk}'::text[]),
  ('aa.com.tr', 136, '{aa.com.tr}'::text[]),
  ('bbc.com', 136, '{bbc.com}'::text[]),
  ('Rybar (English)', 134, '{t.me}'::text[]),
  ('indiatimes.com', 125, '{economictimes.indiatimes.com,indiatimes.com,timesofindia.indiatimes.com}'::text[]),
  ('Rybar (Russian)', 125, '{t.me}'::text[]),
  ('aljazeera.net', 120, '{aljazeera.net}'::text[]),
  ('Al-Monitor', 113, '{al-monitor.com}'::text[]),
  ('jns.org', 112, '{jns.org}'::text[]),
  ('arynews.tv', 107, '{arynews.tv}'::text[]),
  ('oilprice.com', 99, '{oilprice.com}'::text[]),
  ('Israel Hayom', 95, '{israelhayom.com}'::text[]),
  ('thepeninsulaqatar.com', 89, '{thepeninsulaqatar.com}'::text[]),
  ('TASS', 88, '{tass.com}'::text[]),
  ('Dawn (Pakistan)', 80, '{dawn.com}'::text[]),
  ('Fana Media Corporation (Ethiopia)', 80, '{fanamc.com}'::text[]),
  ('hurriyetdailynews.com', 78, '{hurriyetdailynews.com}'::text[]),
  ('OilPrice.com', 78, '{oilprice.com}'::text[]),
  ('wn.com', 76, '{article.wn.com}'::text[]),
  ('diariosigloxxi.com', 74, '{diariosigloxxi.com}'::text[]),
  ('NDTV (India)', 72, '{ndtv.com}'::text[]),
  ('haberler.com', 71, '{haberler.com}'::text[]),
  ('egyptindependent.com', 69, '{egyptindependent.com}'::text[]),
  ('globalsecurity.org', 69, '{globalsecurity.org}'::text[]),
  ('bbc.co.uk', 68, '{bbc.co.uk}'::text[]),
  ('France24', 68, '{france24.com}'::text[]),
  ('africanews.com', 67, '{africanews.com}'::text[]),
  ('inewsgr.com', 67, '{inewsgr.com}'::text[]),
  ('israelnationalnews.com', 67, '{israelnationalnews.com}'::text[]),
  ('clevelandjewishnews.com', 66, '{clevelandjewishnews.com}'::text[]),
  ('geo.tv', 63, '{geo.tv}'::text[]),
  ('Hiiraan Online', 63, '{hiiraan.com}'::text[]),
  ('aol.com', 61, '{aol.com}'::text[]),
  ('The Hindu', 61, '{thehindu.com}'::text[]),
  ('prokerala.com', 60, '{prokerala.com}'::text[]),
  ('xinhuanet.com', 59, '{french.xinhuanet.com,spanish.xinhuanet.com}'::text[]),
  ('news.az', 57, '{news.az}'::text[]),
  ('moneycontrol.com', 55, '{moneycontrol.com}'::text[]),
  ('Our Wars Today', 55, '{t.me}'::text[]),
  ('english.news.cn', 52, '{english.news.cn}'::text[]),
  ('hindustantimes.com', 51, '{hindustantimes.com}'::text[]),
  ('ianslive.in', 50, '{ianslive.in}'::text[]),
  ('allafrica.com', 49, '{allafrica.com}'::text[]),
  ('Kurdistan 24', 49, '{kurdistan24.net}'::text[]),
  ('RT (Russian State)', 48, '{rt-english.com,rt.com}'::text[]),
  ('Radio Dabanga (AR)', 46, '{dabangasudan.org}'::text[]),
  ('english.wafa.ps', 43, '{english.wafa.ps}'::text[]),
  ('Sudan Tribune (AR)', 43, '{sudantribune.net}'::text[]),
  ('The Hill', 43, '{thehill.com}'::text[]),
  ('dominicanrepublicpost.com', 42, '{dominicanrepublicpost.com}'::text[]),
  ('dabangasudan.org', 40, '{dabangasudan.org}'::text[]),
  ('ynetnews.com', 40, '{ynetnews.com}'::text[]),
  ('islamicinvitationturkey.com', 39, '{islamicinvitationturkey.com}'::text[]),
  ('yahoo.com', 39, '{finance.yahoo.com,yahoo.com}'::text[]),
  ('en.apa.az', 38, '{en.apa.az}'::text[]),
  ('theyeshivaworld.com', 38, '{theyeshivaworld.com}'::text[]),
  ('Axios', 36, '{axios.com}'::text[]),
  ('SONNA (Somali National News Agency)', 36, '{}'::text[]),
  ('middle-east-online.com', 35, '{middle-east-online.com}'::text[]),
  ('baomoi.com', 33, '{baomoi.com}'::text[]),
  ('siasat.com', 32, '{siasat.com}'::text[]),
  ('foreignpolicy.com', 31, '{foreignpolicy.com}'::text[]),
  ('freemalaysiatoday.com', 31, '{freemalaysiatoday.com}'::text[]),
  ('nypost.com', 31, '{nypost.com}'::text[]),
  ('wgauradio.com', 30, '{wgauradio.com}'::text[]),
  ('eurasiareview.com', 29, '{eurasiareview.com}'::text[]),
  ('europapress.es', 29, '{europapress.es}'::text[]),
  ('jordantimes.com', 29, '{jordantimes.com}'::text[]),
  ('tienphong.vn', 29, '{tienphong.vn}'::text[]),
  ('Egypt Independent', 28, '{egyptindependent.com}'::text[]),
  ('Financial Times', 28, '{ft.com}'::text[]),
  ('i24news.tv', 28, '{i24news.tv}'::text[]),
  ('sana.sy', 28, '{sana.sy}'::text[]),
  ('iranherald.com', 27, '{iranherald.com}'::text[]),
  ('zerohedge.com', 27, '{zerohedge.com}'::text[]),
  ('Asharq Al-Awsat', 26, '{news.google.com}'::text[]),
  ('breakingnews.ie', 26, '{breakingnews.ie}'::text[]),
  ('samaa.tv', 26, '{samaa.tv}'::text[]),
  ('thereporterethiopia.com', 26, '{thereporterethiopia.com}'::text[]),
  ('ARY News (Pakistan)', 25, '{arynews.tv}'::text[]),
  ('azernews.az', 25, '{azernews.az}'::text[]),
  ('BBC World', 25, '{bbc.co.uk}'::text[]),
  ('breitbart.com', 25, '{breitbart.com}'::text[]),
  ('come-on.de', 25, '{come-on.de}'::text[]),
  ('dantri.com.vn', 25, '{dantri.com.vn}'::text[]),
  ('dunyanews.tv', 25, '{dunyanews.tv}'::text[]),
  ('thefrontierpost.com', 25, '{thefrontierpost.com}'::text[]),
  ('winnipegfreepress.com', 25, '{winnipegfreepress.com}'::text[]),
  ('Africanews', 24, '{africanews.com}'::text[]),
  ('finanzen.net', 24, '{finanzen.net}'::text[]),
  ('arabnews.com', 23, '{arabnews.com}'::text[]),
  ('business-standard.com', 23, '{business-standard.com}'::text[]),
  ('heraldglobe.com', 23, '{heraldglobe.com}'::text[]),
  ('dailymail.com', 22, '{dailymail.com}'::text[]),
  ('freerepublic.com', 22, '{freerepublic.com}'::text[]),
  ('middleeaststar.com', 22, '{middleeaststar.com}'::text[])
ON CONFLICT DO NOTHING;
