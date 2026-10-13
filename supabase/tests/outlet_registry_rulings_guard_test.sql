-- intel_alerts_candidate_guard against the registry after 20261013200000_outlet_registry_rulings.sql (scratch only;
-- needs outlet_registry_guard_fixture.sql, the seed, the rulings and 20261013120100_candidate_guard_distinct_outlets.sql
-- applied). Exits non-zero when a check fails.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;
CREATE TEMP TABLE g (n serial, label text, expect text, got text);
CREATE FUNCTION pg_temp.try(label text, expect text, ev jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  BEGIN
    INSERT INTO public.intel_alerts (alert_kind, severity, conflict_day, topic_id, rule_code, rule_version, rule_snapshot, metrics, evidence, summary, dedupe_key)
    VALUES ('scenario_candidate', 'info', 229, gen_random_uuid(), 'test', 'v1', '{"a":1}', '{"a":1}', ev, 'guard test summary', 'guard-test-' || gen_random_uuid());
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'rollback';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN v := 'accepted';
            WHEN OTHERS THEN v := 'rejected';
  END;
  INSERT INTO g (label, expect, got) VALUES (label, expect, v);
END $$;
CREATE FUNCTION pg_temp.ev(VARIADIC x text[]) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('url', split_part(u, '|', 1), 'outlet', 'x', 'published_at', '2026-10-13',
                                      'party_status', split_part(u, '|', 2))) FROM unnest(x) u $$;
SELECT pg_temp.try('two ruled independents (france24.com + abc.net.au)', 'accepted',
       pg_temp.ev('https://www.france24.com/en/a|independent', 'https://www.abc.net.au/news/b|independent'));
SELECT pg_temp.try('ruled independents with government-linked owners (gulfnews.com + samaa.tv)', 'accepted',
       pg_temp.ev('https://gulfnews.com/a|independent', 'https://www.samaa.tv/b|independent'));
SELECT pg_temp.try('Hürriyet Daily News is state_aligned, not counted (gulfnews.com + hurriyetdailynews.com)', 'rejected',
       pg_temp.ev('https://gulfnews.com/a|independent', 'https://www.hurriyetdailynews.com/b|independent'));
SELECT pg_temp.try('one ruled outlet, two hosts (niacouncil.org + insights.niacouncil.org)', 'rejected',
       pg_temp.ev('https://www.niacouncil.org/a|independent', 'https://insights.niacouncil.org/b|independent'));
SELECT pg_temp.try('ruled state_aligned declared independent are not counted (dailysabah.com + aninews.in)', 'rejected',
       pg_temp.ev('https://www.dailysabah.com/a|independent', 'https://www.aninews.in/b|independent'));
SELECT pg_temp.try('ruled state_aligned declared independent are not counted (middleeastmonitor.com + alhurra.com + kurdistan24.net)', 'rejected',
       pg_temp.ev('https://www.middleeastmonitor.com/a|independent', 'https://www.alhurra.com/b|independent', 'https://www.kurdistan24.net/en/c|independent'));
SELECT pg_temp.try('one ruled independent + one state_aligned (iranintl.com + dailysabah.com)', 'rejected',
       pg_temp.ev('https://www.iranintl.com/en/a|independent', 'https://www.dailysabah.com/b|independent'));
SELECT pg_temp.try('a seed independent + a ruled independent (reuters.com + samaa.tv)', 'accepted',
       pg_temp.ev('https://www.reuters.com/a|independent', 'https://www.samaa.tv/b|independent'));
SELECT CASE WHEN got = expect THEN 'PASS ' ELSE 'FAIL ' END || label || ' -> ' || got FROM g ORDER BY n;
SELECT count(*) || '|' || count(*) FILTER (WHERE got = expect) || '|' || count(*) FILTER (WHERE got <> expect) FROM g;
SELECT 1 / (CASE WHEN bool_and(got = expect) THEN 1 ELSE 0 END) AS all_pass FROM g;
