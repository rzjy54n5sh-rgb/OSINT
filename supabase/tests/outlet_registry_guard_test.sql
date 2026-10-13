-- intel_alerts_candidate_guard against the seeded registry (scratch only; needs outlet_registry_guard_fixture.sql,
-- the seed and 20261013120100_candidate_guard_distinct_outlets.sql applied). Exits non-zero when a check fails.
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
SELECT pg_temp.try('one outlet, two hosts (bbc.com + bbc.co.uk)', 'rejected',
       pg_temp.ev('https://www.bbc.com/a|independent', 'https://www.bbc.co.uk/b|independent'));
SELECT pg_temp.try('one outlet, two hosts (edition.cnn.com + arabic.cnn.com)', 'rejected',
       pg_temp.ev('https://edition.cnn.com/a|independent', 'https://arabic.cnn.com/b|independent'));
SELECT pg_temp.try('one outlet, two hosts (naharnet.com + mobile.naharnet.com)', 'rejected',
       pg_temp.ev('https://www.naharnet.com/a|independent', 'https://mobile.naharnet.com/b|independent'));
SELECT pg_temp.try('Al Jazeera EN+AR declared party (DECISION-002) are not counted', 'rejected',
       pg_temp.ev('https://unregistered-a.example/a|independent', 'https://unregistered-b.example/b|independent',
                  'https://www.aljazeera.com/c|party', 'https://www.aljazeera.net/d|party'));
SELECT pg_temp.try('state media declared independent are not counted (presstv.ir + en.irna.ir)', 'rejected',
       pg_temp.ev('https://www.presstv.ir/a|independent', 'https://en.irna.ir/b|independent'));
SELECT pg_temp.try('two independent outlets (reuters.com + theguardian.com)', 'accepted',
       pg_temp.ev('https://www.reuters.com/a|independent', 'https://www.theguardian.com/b|independent'));
SELECT pg_temp.try('two independent outlets, one with two hosts (bbc.com + bbc.co.uk + reuters.com)', 'accepted',
       pg_temp.ev('https://www.bbc.com/a|independent', 'https://www.bbc.co.uk/b|independent', 'https://www.reuters.com/c|independent'));
SELECT CASE WHEN got = expect THEN 'PASS ' ELSE 'FAIL ' END || label || ' -> ' || got FROM g ORDER BY n;
SELECT count(*) || '|' || count(*) FILTER (WHERE got = expect) || '|' || count(*) FILTER (WHERE got <> expect) FROM g;
SELECT 1 / (CASE WHEN bool_and(got = expect) THEN 1 ELSE 0 END) AS all_pass FROM g;
