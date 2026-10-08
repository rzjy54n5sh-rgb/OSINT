-- Catalog + data fingerprint of everything 20261009090000_trust_ledgers.sql creates. Equal output before
-- and after a second apply = the re-run is a no-op. Prints one md5 per area, then one combined md5.
WITH rels AS (
  SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('corrections','forecast_ledger','forecast_resolutions','posture_evidence','market_reads','operator_rulings')
), parts AS (
  SELECT 'tables' AS area, md5(string_agg(r.relname || ':' || c.relrowsecurity || ':' || coalesce(c.relacl::text, '') || ':' || coalesce(obj_description(c.oid, 'pg_class'), ''), '|' ORDER BY r.relname)) AS h
    FROM rels r JOIN pg_class c ON c.oid = r.oid
  UNION ALL
  SELECT 'columns', md5(string_agg(r.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' || coalesce(a.attacl::text, '') || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), '|' ORDER BY r.relname, a.attnum))
    FROM rels r JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  UNION ALL
  SELECT 'constraints+indexes', md5(coalesce((SELECT string_agg(conrelid::regclass || ':' || conname || ':' || pg_get_constraintdef(oid), '|' ORDER BY conrelid::regclass::text, conname) FROM pg_constraint WHERE conrelid IN (SELECT oid FROM rels)), '')
                                  || coalesce((SELECT string_agg(indexrelid::regclass || ':' || pg_get_indexdef(indexrelid), '|' ORDER BY indexrelid::regclass::text) FROM pg_index WHERE indrelid IN (SELECT oid FROM rels)), ''))
  UNION ALL
  SELECT 'policies', md5(coalesce(string_agg(tablename || ':' || policyname || ':' || permissive || ':' || roles::text || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' ORDER BY tablename, policyname), ''))
    FROM pg_policies WHERE schemaname = 'public' AND tablename IN (SELECT relname FROM rels)
  UNION ALL
  SELECT 'triggers', md5(coalesce(string_agg(tgrelid::regclass || ':' || tgname || ':' || tgenabled::text || ':' || pg_get_triggerdef(t.oid), '|' ORDER BY tgrelid::regclass::text, tgname), ''))
    FROM pg_trigger t WHERE NOT tgisinternal AND (tgrelid IN (SELECT oid FROM rels) OR tgname = 'daily_briefings_no_silent_edit')
  UNION ALL
  SELECT 'functions', md5(coalesce(string_agg(p.oid::regprocedure || ':' || md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, '') || ':' || coalesce(obj_description(p.oid, 'pg_proc'), ''), '|' ORDER BY p.oid::regprocedure::text), ''))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('trust_append_only_guard','trust_stamp_created_at','briefing_edit_window','corrections_guard',
         'daily_briefings_no_silent_edit','forecast_ledger_canonical','forecast_ledger_row_hash','forecast_ledger_chain',
         'forecast_resolutions_check','verify_forecast_chain')
  UNION ALL
  SELECT 'data', md5(coalesce((SELECT string_agg(md5(t::text), '' ORDER BY t::text) FROM public.corrections t), '')
                  || coalesce((SELECT string_agg(md5(t::text), '' ORDER BY t::text) FROM public.forecast_ledger t), '')
                  || coalesce((SELECT string_agg(md5(t::text), '' ORDER BY t::text) FROM public.forecast_resolutions t), '')
                  || coalesce((SELECT string_agg(md5(t::text), '' ORDER BY t::text) FROM public.posture_evidence t), '')
                  || coalesce((SELECT string_agg(md5(t::text), '' ORDER BY t::text) FROM public.market_reads t), '')
                  || coalesce((SELECT string_agg(md5(t::text), '' ORDER BY t::text) FROM public.operator_rulings t), '')
                  || (SELECT md5(string_agg(md5(t::text), '' ORDER BY t.id)) FROM public.daily_briefings t))
)
SELECT area, h FROM parts
UNION ALL SELECT 'ALL', md5(string_agg(area || '=' || h, ',' ORDER BY area)) FROM parts;
