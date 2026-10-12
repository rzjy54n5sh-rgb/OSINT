-- Assertions for 20261012090000_brief_lineup_and_scenario_labels.sql (scratch only; run by run_brief_lineup_tests.sh).
-- Prints one PASS/FAIL line per check and a final "total|pass|fail" line; exits non-zero (ON_ERROR_STOP) if any fail.
CREATE TEMP TABLE r (n serial, ok boolean, label text);
CREATE OR REPLACE FUNCTION pg_temp.chk(p_label text, p_ok boolean) RETURNS void LANGUAGE sql AS
$$ INSERT INTO r (ok, label) VALUES (coalesce(p_ok, false), p_label) $$;

SELECT pg_temp.chk('overnight active daily general/operator',
  EXISTS (SELECT 1 FROM public.report_types WHERE code = 'overnight' AND status = 'active' AND cadence = 'daily' AND scope = 'general' AND origin = 'operator'));
SELECT pg_temp.chk('egypt_gulf_economy active daily thematic',
  EXISTS (SELECT 1 FROM public.report_types WHERE code = 'egypt_gulf_economy' AND status = 'active' AND cadence = 'daily' AND scope = 'thematic'));
SELECT pg_temp.chk('eschatology weekly + displayed as Religion, Ideology & Mobilisation',
  EXISTS (SELECT 1 FROM public.report_types WHERE code = 'eschatology' AND cadence = 'weekly' AND name_en = 'Religion, Ideology & Mobilisation'));
SELECT pg_temp.chk('business displayed as Economic Impact & Market Access',
  EXISTS (SELECT 1 FROM public.report_types WHERE code = 'business' AND name_en = 'Economic Impact & Market Access'));
SELECT pg_temp.chk('egypt, uae, business paused (not deleted, not retired by a migration)',
  (SELECT count(*) FROM public.report_types WHERE code IN ('egypt', 'uae', 'business') AND status = 'paused') = 3);
SELECT pg_temp.chk('general / horn / general_weekly untouched (still active)',
  (SELECT count(*) FROM public.report_types WHERE code IN ('general', 'horn', 'general_weekly') AND status = 'active') = 3);
SELECT pg_temp.chk('exactly 2 birth events + 3 pause events by this migration',
  (SELECT count(*) FILTER (WHERE to_status = 'active') = 2 AND count(*) FILTER (WHERE to_status = 'paused') = 3 AND count(*) = 5
     FROM public.report_type_events WHERE actor = '20261012090000_brief_lineup_and_scenario_labels' AND actor_kind = 'migration'));
SELECT pg_temp.chk('display order: overnight < general < horn < egypt_gulf_economy < eschatology < archive',
  (SELECT array_agg(code ORDER BY display_order) FROM public.report_types WHERE code IN ('overnight','general','horn','egypt_gulf_economy','eschatology','egypt'))
    = ARRAY['overnight','general','horn','egypt_gulf_economy','eschatology','egypt']);
SELECT pg_temp.chk('lifecycle flag is off after the migration (guard still blocks a bare status change)',
  current_setting('app.lifecycle_txn', true) IS DISTINCT FROM 'on');
DO $$ BEGIN
  BEGIN
    UPDATE public.report_types SET status = 'active' WHERE code = 'egypt';
    INSERT INTO r (ok, label) VALUES (false, 'guard blocks bare status change egypt paused->active');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO r (ok, label) VALUES (true, 'guard blocks bare status change egypt paused->active');
  END;
END $$;

SELECT pg_temp.chk('scenario labels renamed A-E',
  (SELECT array_agg(name_en ORDER BY code) FROM public.scenarios) = ARRAY[
    'US announces blockade end or a deal', 'None of A, C or D', 'Bab el-Mandeb closed while Hormuz is shut',
    'US strike on Iran or Israel–Iran strike', 'Iran targets the UAE']);
SELECT pg_temp.chk('former names kept',
  (SELECT array_agg(former_name_en ORDER BY code) FROM public.scenarios) = ARRAY['Managed Exit', 'Prolonged War', 'Cascade', 'Escalation Spiral', 'UAE Direct Strike']);
SELECT pg_temp.chk('B definition explains the Frechet range; former definition kept',
  EXISTS (SELECT 1 FROM public.scenarios WHERE code = 'B' AND definition_en LIKE '%Fréchet bounds%'
            AND former_definition_en LIKE 'Sustained, controlled conflict%'));
SELECT pg_temp.chk('A, C, D, E definitions unchanged (former_definition_en NULL)',
  (SELECT count(*) FROM public.scenarios WHERE code <> 'B' AND former_definition_en IS NULL) = 4);
SELECT pg_temp.chk('scenario codes / status / legacy columns unchanged',
  (SELECT array_agg(code || ':' || status || ':' || legacy_column ORDER BY code) FROM public.scenarios)
    = ARRAY['A:active:scenario_a', 'B:active:scenario_b', 'C:active:scenario_c', 'D:active:scenario_d', 'E:active:scenario_e']);

-- privileges as the API roles
SET ROLE anon;
SELECT count(*) AS anon_rt FROM public.report_types
 WHERE code IN ('overnight','general','general_weekly','horn','egypt_gulf_economy','eschatology','egypt','uae','business') \gset
SELECT count(former_name_en) AS anon_former FROM public.scenarios \gset
RESET ROLE;
SELECT pg_temp.chk('anon reads all 9 routable report types (paused rows visible via RLS)', :anon_rt = 9);
SELECT pg_temp.chk('anon reads former_name_en', :anon_former = 5);
SELECT pg_temp.chk('anon cannot read report_type_events', NOT has_table_privilege('anon', 'public.report_type_events', 'SELECT'));
SELECT pg_temp.chk('anon / authenticated cannot write scenarios or report_types',
  NOT has_table_privilege('anon', 'public.scenarios', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.scenarios', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.report_types', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.report_types', 'UPDATE'));
SELECT pg_temp.chk('service_role can read/insert/update, not delete',
  has_table_privilege('service_role', 'public.report_types', 'INSERT') AND has_table_privilege('service_role', 'public.scenarios', 'UPDATE')
  AND NOT has_table_privilege('service_role', 'public.report_types', 'DELETE') AND NOT has_table_privilege('service_role', 'public.scenarios', 'DELETE'));
SELECT pg_temp.chk('a new-type brief can be written (FK accepts overnight)',
  (SELECT count(*) FROM public.report_types WHERE code = 'overnight') = 1);

SELECT (CASE WHEN ok THEN 'PASS ' ELSE 'FAIL ' END) || label FROM r ORDER BY n;
SELECT count(*) || '|' || count(*) FILTER (WHERE ok) || '|' || count(*) FILTER (WHERE NOT ok) FROM r;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM r WHERE NOT ok) THEN RAISE EXCEPTION 'brief_lineup_test: % failing check(s)', (SELECT count(*) FROM r WHERE NOT ok); END IF; END $$;
