-- One md5 over everything the migration may touch or must not touch (updated_at / created_at excluded).
SELECT md5(string_agg(x, E'\n' ORDER BY x)) FROM (
  SELECT 'rt|' || (to_jsonb(r) - 'updated_at' - 'created_at')::text x FROM public.report_types r
  UNION ALL SELECT 'rte|' || (to_jsonb(e) - 'created_at' - 'id' - 'conflict_day')::text FROM public.report_type_events e
  UNION ALL SELECT 'sc|' || (to_jsonb(s) - 'updated_at' - 'created_at')::text FROM public.scenarios s
  UNION ALL SELECT 'db|' || (to_jsonb(b) - 'updated_at')::text FROM public.daily_briefings b
  UNION ALL SELECT 'sp|' || to_jsonb(p)::text FROM public.scenario_probabilities p
  UNION ALL SELECT 'acl|' || c.relname || '|' || coalesce(c.relacl::text, '') FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('report_types', 'report_type_events', 'scenarios', 'daily_briefings', 'scenario_probabilities')
  UNION ALL SELECT 'col|' || attname || '|' || coalesce(attacl::text, '') FROM pg_attribute
    WHERE attrelid = 'public.scenarios'::regclass AND attnum > 0 AND NOT attisdropped
) t;
