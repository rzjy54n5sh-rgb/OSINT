-- Data snapshot for 20261013090000_posture_yemen_dual_actor.sql: one md5 per public table over every row
-- (the new `actor` column left out, posture_actors left out). Equal output before and after the
-- migration = it changed no data except the posture_actors seed and the actor default (both checked
-- separately by the runner).
SELECT c.relname || ' ' || (xpath('/row/h/text()',
         query_to_xml(format('SELECT count(*) || '':'' || coalesce(md5(string_agg(md5((to_jsonb(t) - ''actor'')::text), '''' ORDER BY md5((to_jsonb(t) - ''actor'')::text))), '''') AS h FROM public.%I t', c.relname),
                      false, true, '')))[1]::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'posture_actors'
 ORDER BY c.relname;
