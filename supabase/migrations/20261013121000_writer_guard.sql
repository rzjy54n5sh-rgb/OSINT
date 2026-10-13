-- =====================================================================================================
-- 20261013121000_writer_guard.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (PG 17)
--
-- Action plan task 19: "AI task read-only; code-checked writer; strip hidden characters".
-- The daily routine is an unattended Claude task that writes briefs with raw SQL as role postgres. The
-- database itself now refuses a bad brief, WHOEVER writes it (postgres, service_role / PostgREST, a
-- future script). Three risks are closed:
--   (a) malformed JSON that breaks the site            -> shape check on sections / sections_ar / cover_stats
--   (b) hidden Unicode carried from scraped pages      -> hidden-character check on every published text
--       (zero-width, bidi overrides, tag characters …)    (REJECT, never silently strip: see "why reject")
--   (c) paragraphs without sources                     -> every paragraph needs >= 1 source with an
--                                                         http(s) URL, except the desk's fixed neutral lines
--
--   §1 public.first_hidden_char(text)          -> 'U+XXXX' of the first forbidden character, or NULL
--      public.strip_hidden_chars(text)         -> the text with every forbidden character removed (for writers)
--      public.strip_hidden_chars_jsonb(jsonb)  -> same, applied to every string (and key) in a JSON document
--      public.jsonb_first_hidden_char(jsonb,text) -> {path, 'U+XXXX'} of the first offending string, or NULL
--   §2 public.brief_fixed_line_ok(text)        -> true for the desk's fixed lines that may carry zero sources
--      public.brief_sections_problems(jsonb, text)         -> every shape / sourcing problem, with its path
--      public.brief_content_problems(title, lead, sections, cover_stats, title_ar, lead_ar, sections_ar)
--                                              -> every problem of a brief (dry-run for writers)
--      public.country_report_content_problems(jsonb) -> every problem of a country_reports.content_json
--   §3 trigger daily_briefings_writer_guard   BEFORE INSERT OR UPDATE ON daily_briefings, ENABLE ALWAYS
--      trigger country_reports_writer_guard   BEFORE INSERT OR UPDATE OF content_json ON country_reports, ENABLE ALWAYS
--   §4 grants   §5 post-conditions (+ NOTICE: how many EXISTING rows would fail if rewritten — informational)
--
-- Forbidden characters (all invisible or direction-changing; production had ZERO of them in daily_briefings
-- and country_reports on 2026-10-13, read-only check):
--   U+007F-U+009F (DEL, C1 controls)  U+00AD soft hyphen       U+061C Arabic letter mark   U+180E
--   U+200B ZWSP  U+200C ZWNJ (*)  U+200D ZWJ  U+200E LRM  U+200F RLM
--   U+202A-U+202E bidi embeddings / overrides (incl. U+202E RLO)   U+2028 / U+2029 line / paragraph separator
--   U+2060-U+206F word joiner, invisible operators, bidi isolates (U+2066-U+2069), deprecated format chars
--   U+FEFF BOM / ZWNBSP   U+FFF9-U+FFFB interlinear annotation   U+E0000-U+E007F tag characters
--   (*) U+200C ZWNJ is allowed only BETWEEN two Arabic-script characters: Persian orthography needs it
--       (e.g. the Persian verb mi<ZWNJ>khaham), and Iranian sources are quoted. Anywhere else (e.g. inside a Latin word, where it
--       splits keywords for filter evasion) it is refused. Arabic letters, harakat (U+064B-U+0652), shadda,
--       tatweel (U+0640) and Arabic punctuation are ordinary visible text and pass.
--
-- Why reject instead of strip: a database that silently rewrites published text would contradict the
-- no-silent-edit rule (20261009090000_trust_ledgers.sql). The writer cleans its own text first with
-- public.strip_hidden_chars(...) / public.strip_hidden_chars_jsonb(...), so what it wrote is what is stored.
--
-- daily_briefings rules (field by field; a field is checked on INSERT of a new brief, and on UPDATE only
-- when it CHANGES — an UPDATE that leaves title/lead/sections/cover_stats/Arabic columns as they are is not
-- re-validated, so the existing legacy rows are untouched and stay correctable on their other fields; an
-- UPDATE that moves a brief to another (conflict_day, report_type) is checked like a new brief):
--   title       hidden characters; not blank
--   lead        hidden characters (NULL allowed)
--   cover_stats NULL or a JSON object ({} allowed); hidden characters in any key/value
--   sections    a JSON array ([] allowed). Each section: object, "id" string (not blank), "heading" string
--               (not blank), "type" string when present (ANY value — production has ~150 different types),
--               "subsections" array. Each subsection: object, "id" and "heading" strings (blank allowed — 4
--               production subsections have one), "paragraphs" array; other keys (nai_category, nai_expressed,
--               nai_latent) allowed. Each paragraph: object, "text" non-blank string, "perspective" one of
--               us_israel | iran_irgc | gulf | neutral | both, "sources" an ARRAY (a missing key is refused).
--               Each source: object with "url" a string matching ^https?://[^[:space:]]+$ ; "archive_url",
--               when present and not null, the same. Other source keys free (name, tier, party_source, …).
--               ZERO sources is allowed only when perspective = 'neutral' AND public.brief_fixed_line_ok(text).
--               Hidden characters in any key/value.
--   title_ar / lead_ar  hidden characters.  sections_ar  NULL, or the same rules as sections.
-- country_reports.content_json (on INSERT, and on UPDATE when content_json changes): NULL, or an object with
--   EXACTLY the keys assessment (non-blank string), key_risks (array of non-blank strings, may be empty),
--   stabilizers (same), sources (NON-EMPTY array of objects whose "url" matches ^https?://[^[:space:]]+$),
--   data_integrity_note (string), generated_at (string, ISO 8601 timestamp); hidden characters anywhere.
--   All 25 production rows pass (2026-10-13).
-- Errors: SQLSTATE 23514 check_violation (PostgREST: HTTP 400), MESSAGE names the field + problem (+ code
--   point), DETAIL gives the path (e.g. sections[2].subsections[0].paragraphs[3].sources) and how many further
--   problems exist, HINT says how to fix it.
--
-- The no-silent-edit correction path (SET LOCAL app.correction_id, then INSERT … ON CONFLICT
-- (conflict_day, report_type) DO UPDATE, or a plain UPDATE) keeps working: a BEFORE INSERT trigger fires
-- before ON CONFLICT is resolved, so — exactly like daily_briefings_reject_inactive_type — when a brief with
-- the same (conflict_day, report_type) ALREADY EXISTS the INSERT branch defers: UNIQUE
-- daily_briefings_day_type_uniq guarantees the INSERT cannot add a row (it becomes DO UPDATE, DO NOTHING or
-- a unique_violation), and the DO UPDATE runs this trigger again as an UPDATE, which checks exactly the
-- fields the correction changes, against the row actually written.
--
-- Trigger order. Postgres fires BEFORE ROW triggers of one table in NAME order. On daily_briefings:
--   1 daily_briefings_no_silent_edit        (ALWAYS)  is this edit allowed at all? (correction needed?)
--   2 daily_briefings_provenance            (origin)  fills / checks provenance (may modify NEW.provenance)
--   3 daily_briefings_reject_inactive_type  (origin)  may this report type get a new brief?
--   4 daily_briefings_writer_guard          (ALWAYS)  is the content well-formed, sourced and clean?
-- The guard runs LAST on purpose: (i) it then validates the final row after every trigger that may modify
-- NEW (none of 1-3 touches the content columns today, but a future one might); (ii) the cheaper,
-- more fundamental refusals (silent edit, paused type) are reported first — a writer who needs a
-- correction or used a paused type learns that before fixing paragraph-level problems. On country_reports
-- the guard runs after country_reports_updated_at (which only sets updated_at). Both guards are ENABLE
-- ALWAYS (like no_silent_edit), so SET session_replication_role = replica does not skip them.
--
-- Security: SECURITY INVOKER + SET search_path TO '' everywhere. Trigger functions: EXECUTE revoked from
-- PUBLIC, anon, authenticated. Helpers: revoked from PUBLIC, anon, authenticated; granted to service_role
-- (the pipeline key; the trigger calls them with the writer's privileges). postgres owns them.
-- Writes NO data. Idempotent (CREATE OR REPLACE, DROP TRIGGER IF EXISTS). ONE TRANSACTION. Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261013121000_writer_guard.sql
-- Depends on 20261007100300_report_registry.sql (daily_briefings_day_type_uniq) and 20261009090000_trust_ledgers.sql.
-- Tested: supabase/tests/run_writer_guard_tests.sh (scratch cluster only, incl. a replay of the 49
-- production briefs of Days 219-228 and the 25 production country_reports rows).
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- §0 preflight --------------------------------------------------------------------------------------
DO $pre$
BEGIN
  IF current_setting('server_version_num')::int < 160000 THEN
    RAISE EXCEPTION 'preflight: PostgreSQL 16+ required (pg_input_is_valid)';
  END IF;
  IF to_regclass('public.daily_briefings') IS NULL OR to_regclass('public.country_reports') IS NULL THEN
    RAISE EXCEPTION 'preflight: public.daily_briefings / public.country_reports missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'daily_briefings'
         AND column_name IN ('title', 'lead', 'sections', 'cover_stats', 'title_ar', 'lead_ar', 'sections_ar',
                             'conflict_day', 'report_type')) <> 9 THEN
    RAISE EXCEPTION 'preflight: daily_briefings is missing one of title/lead/sections/cover_stats/title_ar/lead_ar/sections_ar/conflict_day/report_type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                    AND table_name = 'country_reports' AND column_name = 'content_json' AND data_type = 'jsonb') THEN
    RAISE EXCEPTION 'preflight: country_reports.content_json (jsonb) missing';
  END IF;
  -- The INSERT branch defers to the UPDATE branch when (conflict_day, report_type) exists; that is only
  -- sound with UNIQUE (conflict_day, report_type). Refuse to install without it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indrelid = 'public.daily_briefings'::regclass AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
       AND i.indnatts = 2
       AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum ORDER BY k.ord)
           = ARRAY['conflict_day', 'report_type']) THEN
    RAISE EXCEPTION 'preflight: daily_briefings has no valid UNIQUE (conflict_day, report_type) index (daily_briefings_day_type_uniq)';
  END IF;
END $pre$;

-- §1 hidden characters -------------------------------------------------------------------------------
-- One pattern, written once per function (an IMMUTABLE SQL constant would not be inlined behind SET search_path).
-- [ … ]                     : always forbidden
-- (?<![arabic])\u200C | \u200C(?![arabic]) : ZWNJ not between two Arabic-script characters
CREATE OR REPLACE FUNCTION public.first_hidden_char(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $f$
  SELECT CASE WHEN m IS NULL THEN NULL
              WHEN ascii(m) < 65536 THEN 'U+' || upper(lpad(to_hex(ascii(m)), 4, '0'))   -- lpad would truncate 5 hex digits
              ELSE 'U+' || upper(to_hex(ascii(m))) END
    FROM regexp_substr(p_text,
      '[\u007F-\u009F\u00AD\u061C\u180E\u200B\u200D-\u200F\u202A-\u202E\u2028\u2029\u2060-\u206F\uFEFF\uFFF9-\uFFFB\U000E0000-\U000E007F]'
      || '|(?<![\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC])\u200C'
      || '|\u200C(?![\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC])') AS m
$f$;
COMMENT ON FUNCTION public.first_hidden_char(text) IS
  'Writer guard (20261013121000): ''U+XXXX'' of the first forbidden invisible / direction-changing character in the text, or NULL. '
  'Forbidden: U+007F-009F, U+00AD, U+061C, U+180E, U+200B, U+200D-200F, U+202A-202E, U+2028-2029, U+2060-206F, U+FEFF, U+FFF9-FFFB, '
  'U+E0000-E007F, and U+200C (ZWNJ) unless it sits between two Arabic-script characters (Persian orthography).';

CREATE OR REPLACE FUNCTION public.strip_hidden_chars(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path TO ''
AS $f$
  SELECT regexp_replace(p_text,
      '[\u007F-\u009F\u00AD\u061C\u180E\u200B\u200D-\u200F\u202A-\u202E\u2028\u2029\u2060-\u206F\uFEFF\uFFF9-\uFFFB\U000E0000-\U000E007F]'
      || '|(?<![\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC])\u200C'
      || '|\u200C(?![\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC])', '', 'g')
$f$;
COMMENT ON FUNCTION public.strip_hidden_chars(text) IS
  'Writer guard (20261013121000): returns the text with every character public.first_hidden_char() forbids removed (ZWNJ between '
  'two Arabic-script characters is kept). Writers wrap every published string in it BEFORE writing: the database refuses, never strips. '
  'Nothing else is changed (no normalisation, no trimming). Idempotent; the result always passes the guard''s hidden-character check.';

CREATE OR REPLACE FUNCTION public.strip_hidden_chars_jsonb(p_doc jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path TO ''
AS $f$
  -- jsonb::text prints every forbidden character literally (jsonb escapes only ", \ and U+0000-U+001F), and none of
  -- them is JSON syntax, so removing them from the text form keeps the document valid and only changes strings / keys.
  SELECT public.strip_hidden_chars(p_doc::text)::jsonb
$f$;
COMMENT ON FUNCTION public.strip_hidden_chars_jsonb(jsonb) IS
  'Writer guard (20261013121000): public.strip_hidden_chars() applied to every string value and key of a JSON document '
  '(for sections / sections_ar / cover_stats / content_json). Structure and all other characters are unchanged.';

CREATE OR REPLACE FUNCTION public.jsonb_first_hidden_char(p_doc jsonb, p_path text DEFAULT '$')
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $f$
DECLARE
  v_key  text;
  v_val  jsonb;
  v_i    int;
  v_cp   text;
  v_hit  text[];
BEGIN
  IF p_doc IS NULL OR public.first_hidden_char(p_doc::text) IS NULL THEN
    RETURN NULL;                                    -- fast path: nothing anywhere below this node
  END IF;
  CASE jsonb_typeof(p_doc)
    WHEN 'object' THEN
      FOR v_key, v_val IN SELECT e.key, e.value FROM jsonb_each(p_doc) e ORDER BY e.key LOOP
        v_cp := public.first_hidden_char(v_key);
        IF v_cp IS NOT NULL THEN
          RETURN ARRAY[p_path || ' (key ' || to_json(public.strip_hidden_chars(v_key))::text || ')', v_cp];
        END IF;
        v_hit := public.jsonb_first_hidden_char(v_val, p_path || '.' || v_key);
        IF v_hit IS NOT NULL THEN RETURN v_hit; END IF;
      END LOOP;
    WHEN 'array' THEN
      FOR v_i IN 0 .. jsonb_array_length(p_doc) - 1 LOOP
        v_hit := public.jsonb_first_hidden_char(p_doc -> v_i, p_path || '[' || v_i || ']');
        IF v_hit IS NOT NULL THEN RETURN v_hit; END IF;
      END LOOP;
    WHEN 'string' THEN
      v_cp := public.first_hidden_char(p_doc #>> '{}');
      IF v_cp IS NOT NULL THEN RETURN ARRAY[p_path, v_cp]; END IF;
    ELSE
      NULL;
  END CASE;
  RETURN ARRAY[p_path, public.first_hidden_char(p_doc::text)];   -- not reached in practice; never lose a hit
END $f$;
COMMENT ON FUNCTION public.jsonb_first_hidden_char(jsonb, text) IS
  'Writer guard (20261013121000): {path, ''U+XXXX''} of the first string value or key (keys sorted) holding a forbidden character, or NULL.';

-- §2 content rules -----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.brief_fixed_line_ok(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $f$
  -- The desk's fixed lines: the only paragraphs that may carry ZERO sources (and only with perspective 'neutral').
  -- Built from every zero-source paragraph in production (Days 221-228, read-only 2026-10-13) plus the two lines the
  -- routine prompt prescribes. Each is anchored at both ends and length-capped.
  SELECT coalesce(
       t ~ '^No sourced data available for Day [0-9]{1,4}\.$'                                    -- prescribed empty-day line
    OR t ~ '^No further sourced changes between ([01][0-9]|2[0-3]):[0-5][0-9] and ([01][0-9]|2[0-3]):[0-5][0-9] UTC\.$'  -- quiet window
    OR (length(t) <= 400                                                                         -- correction note
        AND t ~ '^Corrected [0-3]?[0-9] (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20[0-9]{2}, ([01][0-9]|2[0-3]):[0-5][0-9] UTC: [^\n]+$')
    OR (length(t) <= 400                                                                         -- gap statement
        AND t ~ '^No [^.\n]{3,240} (could|can) be (opened|sourced|found|verified|confirmed)( at source)?( in this (run|edition window|reporting window|window|cycle))?\.( [^\n]+)?$')
    OR (length(t) <= 600                                                                         -- desk market collector row
        AND t ~ '^On the collector row timestamped [0-9]{4}-[0-9]{2}-[0-9]{2} ([01][0-9]|2[0-3]):[0-5][0-9] UTC, [^\n]+$'),
    false)
    FROM (SELECT btrim(p_text) AS t) s
$f$;
COMMENT ON FUNCTION public.brief_fixed_line_ok(text) IS
  'Writer guard (20261013121000): true when a paragraph text is one of the desk''s fixed lines that may be published with zero sources '
  '(perspective must also be ''neutral''): "No sourced data available for Day <n>."; "No further sourced changes between HH:MM and HH:MM UTC."; '
  '"Corrected <d Mon yyyy>, HH:MM UTC: …" (<= 400 chars); a gap statement "No … could be opened|sourced|found|verified|confirmed [at source] [in this run|…]. …" '
  '(<= 400 chars); "On the collector row timestamped yyyy-mm-dd HH:MM UTC, …" (<= 600 chars). Anything else needs >= 1 source.';

CREATE OR REPLACE FUNCTION public.brief_sections_problems(p_sections jsonb, p_field text DEFAULT 'sections')
RETURNS TABLE (path text, problem text)
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $f$
DECLARE
  v_n     int := 0;
  v_max   constant int := 100;                 -- stop listing after this many problems
  si int; ui int; pi int; ri int;
  v_sec jsonb; v_sub jsonb; v_par jsonb; v_src jsonb;
  v_sp text; v_up text; v_pp text; v_rp text;
BEGIN
  IF p_sections IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(p_sections) <> 'array' THEN
    path := p_field; problem := format('must be a JSON array of sections, got %s', jsonb_typeof(p_sections)); RETURN NEXT; RETURN;
  END IF;
  FOR si IN 0 .. jsonb_array_length(p_sections) - 1 LOOP
    v_sec := p_sections -> si; v_sp := format('%s[%s]', p_field, si);
    IF jsonb_typeof(v_sec) <> 'object' THEN
      path := v_sp; problem := format('section must be an object, got %s', jsonb_typeof(v_sec)); RETURN NEXT;
      v_n := v_n + 1; IF v_n >= v_max THEN RETURN; END IF; CONTINUE;
    END IF;
    IF jsonb_typeof(v_sec -> 'id') IS DISTINCT FROM 'string' OR btrim(v_sec ->> 'id') = '' THEN
      path := v_sp || '.id'; problem := 'section "id" must be a non-blank string'; RETURN NEXT; v_n := v_n + 1;
    END IF;
    IF jsonb_typeof(v_sec -> 'heading') IS DISTINCT FROM 'string' OR btrim(v_sec ->> 'heading') = '' THEN
      path := v_sp || '.heading'; problem := 'section "heading" must be a non-blank string'; RETURN NEXT; v_n := v_n + 1;
    END IF;
    IF v_sec ? 'type' AND jsonb_typeof(v_sec -> 'type') <> 'string' THEN
      path := v_sp || '.type'; problem := 'section "type", when present, must be a string'; RETURN NEXT; v_n := v_n + 1;
    END IF;
    IF jsonb_typeof(v_sec -> 'subsections') IS DISTINCT FROM 'array' THEN
      path := v_sp || '.subsections'; problem := 'section "subsections" must be an array'; RETURN NEXT;
      v_n := v_n + 1; IF v_n >= v_max THEN RETURN; END IF; CONTINUE;
    END IF;
    IF v_n >= v_max THEN RETURN; END IF;
    FOR ui IN 0 .. jsonb_array_length(v_sec -> 'subsections') - 1 LOOP
      v_sub := v_sec -> 'subsections' -> ui; v_up := format('%s.subsections[%s]', v_sp, ui);
      IF jsonb_typeof(v_sub) <> 'object' THEN
        path := v_up; problem := format('subsection must be an object, got %s', jsonb_typeof(v_sub)); RETURN NEXT;
        v_n := v_n + 1; IF v_n >= v_max THEN RETURN; END IF; CONTINUE;
      END IF;
      IF jsonb_typeof(v_sub -> 'id') IS DISTINCT FROM 'string' THEN
        path := v_up || '.id'; problem := 'subsection "id" must be a string'; RETURN NEXT; v_n := v_n + 1;
      END IF;
      IF jsonb_typeof(v_sub -> 'heading') IS DISTINCT FROM 'string' THEN
        path := v_up || '.heading'; problem := 'subsection "heading" must be a string'; RETURN NEXT; v_n := v_n + 1;
      END IF;
      IF jsonb_typeof(v_sub -> 'paragraphs') IS DISTINCT FROM 'array' THEN
        path := v_up || '.paragraphs'; problem := 'subsection "paragraphs" must be an array'; RETURN NEXT;
        v_n := v_n + 1; IF v_n >= v_max THEN RETURN; END IF; CONTINUE;
      END IF;
      IF v_n >= v_max THEN RETURN; END IF;
      FOR pi IN 0 .. jsonb_array_length(v_sub -> 'paragraphs') - 1 LOOP
        v_par := v_sub -> 'paragraphs' -> pi; v_pp := format('%s.paragraphs[%s]', v_up, pi);
        IF jsonb_typeof(v_par) <> 'object' THEN
          path := v_pp; problem := format('paragraph must be an object {text, perspective, sources}, got %s', jsonb_typeof(v_par)); RETURN NEXT;
          v_n := v_n + 1; IF v_n >= v_max THEN RETURN; END IF; CONTINUE;
        END IF;
        IF jsonb_typeof(v_par -> 'text') IS DISTINCT FROM 'string' OR btrim(v_par ->> 'text') = '' THEN
          path := v_pp || '.text'; problem := 'paragraph "text" must be a non-blank string'; RETURN NEXT; v_n := v_n + 1;
        END IF;
        IF jsonb_typeof(v_par -> 'perspective') IS DISTINCT FROM 'string'
           OR (v_par ->> 'perspective') NOT IN ('us_israel', 'iran_irgc', 'gulf', 'neutral', 'both') THEN
          path := v_pp || '.perspective';
          problem := format('paragraph "perspective" must be one of us_israel, iran_irgc, gulf, neutral, both (got %s)',
                            coalesce((v_par -> 'perspective')::text, 'nothing'));
          RETURN NEXT; v_n := v_n + 1;
        END IF;
        IF jsonb_typeof(v_par -> 'sources') IS DISTINCT FROM 'array' THEN
          path := v_pp || '.sources';
          problem := CASE WHEN v_par ? 'sources' THEN format('paragraph "sources" must be an array, got %s', jsonb_typeof(v_par -> 'sources'))
                          ELSE 'paragraph has no "sources" array — every paragraph must cite at least one source' END;
          RETURN NEXT; v_n := v_n + 1;
        ELSIF jsonb_array_length(v_par -> 'sources') = 0 THEN
          IF NOT ((v_par ->> 'perspective') = 'neutral' AND public.brief_fixed_line_ok(v_par ->> 'text')) THEN
            path := v_pp || '.sources';
            problem := 'paragraph has zero sources — only the desk''s fixed neutral lines may (public.brief_fixed_line_ok)';
            RETURN NEXT; v_n := v_n + 1;
          END IF;
        ELSE
          FOR ri IN 0 .. jsonb_array_length(v_par -> 'sources') - 1 LOOP
            v_src := v_par -> 'sources' -> ri; v_rp := format('%s.sources[%s]', v_pp, ri);
            IF jsonb_typeof(v_src) <> 'object' THEN
              path := v_rp; problem := format('source must be an object with a "url", got %s', jsonb_typeof(v_src)); RETURN NEXT; v_n := v_n + 1;
            ELSIF jsonb_typeof(v_src -> 'url') IS DISTINCT FROM 'string' OR (v_src ->> 'url') !~* '^https?://[^[:space:]]+$' THEN
              path := v_rp || '.url';
              problem := format('source "url" must be an http(s) URL without spaces (got %s)', coalesce(left((v_src -> 'url')::text, 80), 'nothing'));
              RETURN NEXT; v_n := v_n + 1;
            END IF;
            IF jsonb_typeof(v_src) = 'object' AND jsonb_typeof(v_src -> 'archive_url') = 'string'
               AND (v_src ->> 'archive_url') !~* '^https?://[^[:space:]]+$' THEN
              path := v_rp || '.archive_url'; problem := 'source "archive_url", when set, must be an http(s) URL without spaces'; RETURN NEXT; v_n := v_n + 1;
            ELSIF jsonb_typeof(v_src) = 'object' AND v_src ? 'archive_url' AND jsonb_typeof(v_src -> 'archive_url') NOT IN ('string', 'null') THEN
              path := v_rp || '.archive_url'; problem := 'source "archive_url" must be a string or null'; RETURN NEXT; v_n := v_n + 1;
            END IF;
            IF v_n >= v_max THEN RETURN; END IF;
          END LOOP;
        END IF;
        IF v_n >= v_max THEN RETURN; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $f$;
COMMENT ON FUNCTION public.brief_sections_problems(jsonb, text) IS
  'Writer guard (20261013121000): every shape / sourcing problem of a sections (or sections_ar) document as (path, problem); '
  'no rows = well-formed. See the migration header for the rules. Hidden characters are checked by brief_content_problems().';

CREATE OR REPLACE FUNCTION public.brief_content_problems(
  p_title text, p_lead text, p_sections jsonb, p_cover_stats jsonb,
  p_title_ar text DEFAULT NULL, p_lead_ar text DEFAULT NULL, p_sections_ar jsonb DEFAULT NULL)
RETURNS TABLE (field text, path text, problem text, code_point text)
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
SET search_path TO ''
AS $f$
-- A NULL argument means "not supplied / not checked" (NOT NULL columns are enforced by the table itself).
DECLARE
  v_cp  text;
  v_hit text[];
  r     record;
  v_txt text;
  v_fld text;
BEGIN
  -- plain text columns
  FOR v_fld, v_txt IN VALUES ('title', p_title), ('lead', p_lead), ('title_ar', p_title_ar), ('lead_ar', p_lead_ar) LOOP
    CONTINUE WHEN v_txt IS NULL;
    v_cp := public.first_hidden_char(v_txt);
    IF v_cp IS NOT NULL THEN
      field := v_fld; code_point := v_cp;
      path := format('%s (character %s)', v_fld, regexp_instr(v_txt,
                '[\u007F-\u009F\u00AD\u061C\u180E\u200B\u200D-\u200F\u202A-\u202E\u2028\u2029\u2060-\u206F\uFEFF\uFFF9-\uFFFB\U000E0000-\U000E007F]'
                || '|(?<![\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC])\u200C'
                || '|\u200C(?![\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC])'));
      problem := format('contains the hidden character %s', v_cp);
      RETURN NEXT;
    END IF;
    IF v_fld IN ('title', 'title_ar') AND btrim(v_txt) = '' THEN
      field := v_fld; path := v_fld; problem := 'must not be blank'; code_point := NULL; RETURN NEXT;
    END IF;
  END LOOP;

  -- cover_stats: NULL or an object
  IF p_cover_stats IS NOT NULL THEN
    IF jsonb_typeof(p_cover_stats) <> 'object' THEN
      field := 'cover_stats'; path := 'cover_stats'; code_point := NULL;
      problem := format('must be a JSON object (or NULL), got %s', jsonb_typeof(p_cover_stats)); RETURN NEXT;
    END IF;
    v_hit := public.jsonb_first_hidden_char(p_cover_stats, 'cover_stats');
    IF v_hit IS NOT NULL THEN
      field := 'cover_stats'; path := v_hit[1]; code_point := v_hit[2];
      problem := format('contains the hidden character %s', v_hit[2]); RETURN NEXT;
    END IF;
  END IF;

  -- sections / sections_ar
  FOR v_fld IN VALUES ('sections'), ('sections_ar') LOOP
    CONTINUE WHEN (CASE v_fld WHEN 'sections' THEN p_sections ELSE p_sections_ar END) IS NULL;
    v_hit := public.jsonb_first_hidden_char(CASE v_fld WHEN 'sections' THEN p_sections ELSE p_sections_ar END, v_fld);
    IF v_hit IS NOT NULL THEN
      field := v_fld; path := v_hit[1]; code_point := v_hit[2];
      problem := format('contains the hidden character %s', v_hit[2]); RETURN NEXT;
    END IF;
    FOR r IN SELECT * FROM public.brief_sections_problems(CASE v_fld WHEN 'sections' THEN p_sections ELSE p_sections_ar END, v_fld) LOOP
      field := v_fld; path := r.path; problem := r.problem; code_point := NULL; RETURN NEXT;
    END LOOP;
  END LOOP;
END $f$;
COMMENT ON FUNCTION public.brief_content_problems(text, text, jsonb, jsonb, text, text, jsonb) IS
  'Writer guard (20261013121000): every problem the daily_briefings writer guard would refuse, as (field, path, problem, code_point). '
  'Dry-run before writing: SELECT * FROM public.brief_content_problems(title, lead, sections, cover_stats[, title_ar, lead_ar, sections_ar]); '
  'no rows = the write will pass the guard. NULL arguments are not checked.';

CREATE OR REPLACE FUNCTION public.country_report_content_problems(p_doc jsonb)
RETURNS TABLE (path text, problem text, code_point text)
LANGUAGE plpgsql
STABLE PARALLEL SAFE                              -- pg_input_is_valid(…, 'timestamptz') depends on DateStyle / TimeZone
SET search_path TO ''
AS $f$
DECLARE
  v_keys  constant text[] := ARRAY['assessment', 'data_integrity_note', 'generated_at', 'key_risks', 'sources', 'stabilizers'];
  v_k     text;
  v_i     int;
  v_el    jsonb;
  v_hit   text[];
BEGIN
  IF p_doc IS NULL THEN RETURN; END IF;
  code_point := NULL;
  IF jsonb_typeof(p_doc) <> 'object' THEN
    path := 'content_json'; problem := format('must be a JSON object, got %s', jsonb_typeof(p_doc)); RETURN NEXT; RETURN;
  END IF;
  FOR v_k IN SELECT k FROM jsonb_object_keys(p_doc) k WHERE NOT (k = ANY (v_keys)) ORDER BY 1 LOOP
    path := 'content_json.' || v_k;
    problem := format('unexpected key %s (allowed exactly: %s)', to_json(public.strip_hidden_chars(v_k))::text, array_to_string(v_keys, ', ')); RETURN NEXT;
  END LOOP;
  FOR v_k IN SELECT k FROM unnest(v_keys) k WHERE NOT p_doc ? k LOOP
    path := 'content_json.' || v_k; problem := 'required key is missing'; RETURN NEXT;
  END LOOP;
  IF p_doc ? 'assessment' AND (jsonb_typeof(p_doc -> 'assessment') <> 'string' OR btrim(p_doc ->> 'assessment') = '') THEN
    path := 'content_json.assessment'; problem := 'must be a non-blank string'; RETURN NEXT;
  END IF;
  IF p_doc ? 'data_integrity_note' AND jsonb_typeof(p_doc -> 'data_integrity_note') <> 'string' THEN
    path := 'content_json.data_integrity_note'; problem := 'must be a string'; RETURN NEXT;
  END IF;
  IF p_doc ? 'generated_at' AND (jsonb_typeof(p_doc -> 'generated_at') <> 'string'
       OR (p_doc ->> 'generated_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
       OR NOT pg_catalog.pg_input_is_valid(p_doc ->> 'generated_at', 'timestamptz')) THEN
    path := 'content_json.generated_at'; problem := 'must be an ISO 8601 timestamp string (e.g. 2026-10-13T02:10:00Z)'; RETURN NEXT;
  END IF;
  FOREACH v_k IN ARRAY ARRAY['key_risks', 'stabilizers'] LOOP
    CONTINUE WHEN NOT p_doc ? v_k;
    IF jsonb_typeof(p_doc -> v_k) <> 'array' THEN
      path := 'content_json.' || v_k; problem := 'must be an array of strings'; RETURN NEXT;
    ELSE
      FOR v_i IN 0 .. jsonb_array_length(p_doc -> v_k) - 1 LOOP
        v_el := p_doc -> v_k -> v_i;
        IF jsonb_typeof(v_el) <> 'string' OR btrim(v_el #>> '{}') = '' THEN
          path := format('content_json.%s[%s]', v_k, v_i); problem := 'must be a non-blank string'; RETURN NEXT;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF p_doc ? 'sources' THEN
    IF jsonb_typeof(p_doc -> 'sources') <> 'array' OR jsonb_array_length(p_doc -> 'sources') = 0 THEN
      path := 'content_json.sources'; problem := 'must be a non-empty array of sources {url, …}'; RETURN NEXT;
    ELSE
      FOR v_i IN 0 .. jsonb_array_length(p_doc -> 'sources') - 1 LOOP
        v_el := p_doc -> 'sources' -> v_i;
        IF jsonb_typeof(v_el) <> 'object' THEN
          path := format('content_json.sources[%s]', v_i); problem := 'source must be an object with a "url"'; RETURN NEXT;
        ELSIF jsonb_typeof(v_el -> 'url') IS DISTINCT FROM 'string' OR (v_el ->> 'url') !~* '^https?://[^[:space:]]+$' THEN
          path := format('content_json.sources[%s].url', v_i);
          problem := format('source "url" must be an http(s) URL without spaces (got %s)', coalesce(left((v_el -> 'url')::text, 80), 'nothing'));
          RETURN NEXT;
        END IF;
      END LOOP;
    END IF;
  END IF;
  v_hit := public.jsonb_first_hidden_char(p_doc, 'content_json');
  IF v_hit IS NOT NULL THEN
    path := v_hit[1]; code_point := v_hit[2]; problem := format('contains the hidden character %s', v_hit[2]); RETURN NEXT;
  END IF;
END $f$;
COMMENT ON FUNCTION public.country_report_content_problems(jsonb) IS
  'Writer guard (20261013121000): every problem of a country_reports.content_json as (path, problem, code_point); no rows = passes. '
  'Shape: exactly {assessment, key_risks, stabilizers, sources, data_integrity_note, generated_at}; sources non-empty with http(s) urls; no hidden characters.';

-- §3 trigger functions + triggers ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_briefings_writer_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $f$
DECLARE
  c_title boolean; c_lead boolean; c_sections boolean; c_cover boolean;
  c_title_ar boolean; c_lead_ar boolean; c_sections_ar boolean;
  v_first record;
  v_count int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- BEFORE INSERT fires before ON CONFLICT is resolved. If (conflict_day, report_type) already exists, this INSERT
    -- cannot add a row (UNIQUE daily_briefings_day_type_uniq): it becomes ON CONFLICT DO UPDATE (which fires this
    -- trigger again as an UPDATE and checks what actually changes), DO NOTHING, or a unique_violation.
    IF NEW.conflict_day IS NOT NULL AND NEW.report_type IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.daily_briefings b
          WHERE b.conflict_day = NEW.conflict_day AND b.report_type = NEW.report_type) THEN
      RETURN NEW;
    END IF;
    c_title := true; c_lead := true; c_sections := true; c_cover := true;
    c_title_ar := true; c_lead_ar := true; c_sections_ar := true;
  ELSIF NEW.conflict_day IS DISTINCT FROM OLD.conflict_day OR NEW.report_type IS DISTINCT FROM OLD.report_type THEN
    -- moving a brief to another (conflict_day, report_type) publishes it as a different brief: check everything
    c_title := true; c_lead := true; c_sections := true; c_cover := true;
    c_title_ar := true; c_lead_ar := true; c_sections_ar := true;
  ELSE
    c_title       := NEW.title       IS DISTINCT FROM OLD.title;
    c_lead        := NEW.lead        IS DISTINCT FROM OLD.lead;
    c_sections    := NEW.sections    IS DISTINCT FROM OLD.sections;
    c_cover       := NEW.cover_stats IS DISTINCT FROM OLD.cover_stats;
    c_title_ar    := NEW.title_ar    IS DISTINCT FROM OLD.title_ar;
    c_lead_ar     := NEW.lead_ar     IS DISTINCT FROM OLD.lead_ar;
    c_sections_ar := NEW.sections_ar IS DISTINCT FROM OLD.sections_ar;
    IF NOT (c_title OR c_lead OR c_sections OR c_cover OR c_title_ar OR c_lead_ar OR c_sections_ar) THEN
      RETURN NEW;                                   -- no content change: nothing to validate
    END IF;
  END IF;

  SELECT p.*, count(*) OVER () AS n INTO v_first
    FROM public.brief_content_problems(
           CASE WHEN c_title       THEN NEW.title       END,
           CASE WHEN c_lead        THEN NEW.lead        END,
           CASE WHEN c_sections    THEN NEW.sections    END,
           CASE WHEN c_cover       THEN NEW.cover_stats END,
           CASE WHEN c_title_ar    THEN NEW.title_ar    END,
           CASE WHEN c_lead_ar     THEN NEW.lead_ar     END,
           CASE WHEN c_sections_ar THEN NEW.sections_ar END) p
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  v_count := v_first.n;

  RAISE EXCEPTION 'daily_briefings writer guard: % %', v_first.field, v_first.problem
    USING ERRCODE = 'check_violation',
          DETAIL = format('Brief Day %s %s (%s). Path: %s.%s',
                          NEW.conflict_day, NEW.report_type, lower(TG_OP), v_first.path,
                          CASE WHEN v_count > 1
                               THEN format(' %s further problem(s) — list them all with SELECT * FROM public.brief_content_problems(title, lead, sections, cover_stats, title_ar, lead_ar, sections_ar).', v_count - 1)
                               ELSE '' END),
          HINT = CASE
            WHEN v_first.code_point IS NOT NULL THEN
              format('Remove %s from %s: write every published string through public.strip_hidden_chars(text) — and sections / '
                     'sections_ar / cover_stats through public.strip_hidden_chars_jsonb(jsonb) — then retry. The database refuses '
                     'rather than strips, because published text must never change silently.', v_first.code_point, v_first.field)
            WHEN v_first.problem LIKE '%sources%' OR v_first.problem LIKE '%source "%' THEN
              'Every paragraph needs "sources": [{"name": …, "url": "https://…", …}, …] with at least one http(s) URL. Zero sources is '
              'allowed only for the desk''s fixed neutral lines (perspective "neutral"; see public.brief_fixed_line_ok): '
              '"No sourced data available for Day <n>.", "No further sourced changes between HH:MM and HH:MM UTC.", '
              '"Corrected <d Mon yyyy>, HH:MM UTC: …", a "No … could be opened|sourced… in this run." gap statement, or a collector-row line.'
            WHEN v_first.problem LIKE '%perspective%' THEN
              'Use one of the five perspective codes: us_israel, iran_irgc, gulf, neutral, both.'
            ELSE
              'Expected shape: sections = [{"id": "…", "heading": "…", "type": "…", "subsections": [{"id": "…", "heading": "…", '
              '"paragraphs": [{"text": "…", "perspective": "neutral", "sources": [{"name": "…", "url": "https://…"}]}]}]}]; '
              'cover_stats = a JSON object or NULL. Dry-run with SELECT * FROM public.brief_content_problems(…).'
          END;
END $f$;
COMMENT ON FUNCTION public.daily_briefings_writer_guard() IS
  'BEFORE INSERT OR UPDATE on daily_briefings, ENABLE ALWAYS (20261013121000). Refuses (23514) a brief whose title / lead / sections / '
  'cover_stats / title_ar / lead_ar / sections_ar break the writer rules (public.brief_content_problems). On UPDATE only CHANGED fields '
  'are checked (all fields when the brief moves to another conflict_day / report_type); an INSERT whose (conflict_day, report_type) '
  'already exists defers to the UPDATE it becomes (correction upserts).';

CREATE OR REPLACE FUNCTION public.country_reports_writer_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $f$
DECLARE
  v_first record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.content_json IS NOT DISTINCT FROM OLD.content_json THEN
    RETURN NEW;
  END IF;
  SELECT p.*, count(*) OVER () AS n INTO v_first
    FROM public.country_report_content_problems(NEW.content_json) p LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'country_reports writer guard: content_json %', v_first.problem
    USING ERRCODE = 'check_violation',
          DETAIL = format('Country %s (%s). Path: %s.%s', NEW.country_code, lower(TG_OP), v_first.path,
                          CASE WHEN v_first.n > 1
                               THEN format(' %s further problem(s) — list them with SELECT * FROM public.country_report_content_problems(content_json).', v_first.n - 1)
                               ELSE '' END),
          HINT = CASE
            WHEN v_first.code_point IS NOT NULL THEN
              format('Remove %s: write content_json through public.strip_hidden_chars_jsonb(jsonb) (strings through '
                     'public.strip_hidden_chars(text)) and retry. The database refuses rather than strips.', v_first.code_point)
            ELSE
              'content_json must be exactly {"assessment": "…", "key_risks": ["…"], "stabilizers": ["…"], "sources": [{"name": "…", '
              '"url": "https://…", "tier": …, "party_source": …, "published_at": …}], "data_integrity_note": "…", "generated_at": "2026-10-13T02:10:00Z"}.'
          END;
END $f$;
COMMENT ON FUNCTION public.country_reports_writer_guard() IS
  'BEFORE INSERT OR UPDATE OF content_json on country_reports, ENABLE ALWAYS (20261013121000). Refuses (23514) a content_json that '
  'public.country_report_content_problems() rejects; an UPDATE that leaves content_json unchanged is not checked.';

DROP TRIGGER IF EXISTS daily_briefings_writer_guard ON public.daily_briefings;
CREATE TRIGGER daily_briefings_writer_guard
  BEFORE INSERT OR UPDATE ON public.daily_briefings
  FOR EACH ROW EXECUTE FUNCTION public.daily_briefings_writer_guard();
ALTER TABLE public.daily_briefings ENABLE ALWAYS TRIGGER daily_briefings_writer_guard;

DROP TRIGGER IF EXISTS country_reports_writer_guard ON public.country_reports;
CREATE TRIGGER country_reports_writer_guard
  BEFORE INSERT OR UPDATE OF content_json ON public.country_reports
  FOR EACH ROW EXECUTE FUNCTION public.country_reports_writer_guard();
ALTER TABLE public.country_reports ENABLE ALWAYS TRIGGER country_reports_writer_guard;

-- §4 grants --------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.daily_briefings_writer_guard()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.country_reports_writer_guard()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.first_hidden_char(text)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.strip_hidden_chars(text)                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.strip_hidden_chars_jsonb(jsonb)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jsonb_first_hidden_char(jsonb, text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.brief_fixed_line_ok(text)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.brief_sections_problems(jsonb, text)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.brief_content_problems(text, text, jsonb, jsonb, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.country_report_content_problems(jsonb)           FROM PUBLIC, anon, authenticated;
-- service_role writes through PostgREST; the SECURITY INVOKER triggers call these helpers with its privileges.
GRANT EXECUTE ON FUNCTION public.first_hidden_char(text)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.strip_hidden_chars(text)                         TO service_role;
GRANT EXECUTE ON FUNCTION public.strip_hidden_chars_jsonb(jsonb)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.jsonb_first_hidden_char(jsonb, text)             TO service_role;
GRANT EXECUTE ON FUNCTION public.brief_fixed_line_ok(text)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.brief_sections_problems(jsonb, text)             TO service_role;
GRANT EXECUTE ON FUNCTION public.brief_content_problems(text, text, jsonb, jsonb, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.country_report_content_problems(jsonb)           TO service_role;

-- §5 post-conditions ---------------------------------------------------------------------------------
DO $post$
DECLARE
  v_fn text;
  v_bad_briefs int;
  v_bad_reports int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.daily_briefings'::regclass
                    AND t.tgname = 'daily_briefings_writer_guard' AND t.tgenabled = 'A' AND NOT t.tgisinternal
                    AND t.tgfoid = 'public.daily_briefings_writer_guard()'::regprocedure) THEN
    RAISE EXCEPTION 'post: trigger daily_briefings_writer_guard missing or not ENABLE ALWAYS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.country_reports'::regclass
                    AND t.tgname = 'country_reports_writer_guard' AND t.tgenabled = 'A' AND NOT t.tgisinternal
                    AND t.tgfoid = 'public.country_reports_writer_guard()'::regprocedure) THEN
    RAISE EXCEPTION 'post: trigger country_reports_writer_guard missing or not ENABLE ALWAYS';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY['public.daily_briefings_writer_guard()', 'public.country_reports_writer_guard()',
                              'public.first_hidden_char(text)', 'public.strip_hidden_chars(text)', 'public.strip_hidden_chars_jsonb(jsonb)',
                              'public.jsonb_first_hidden_char(jsonb, text)', 'public.brief_fixed_line_ok(text)',
                              'public.brief_sections_problems(jsonb, text)',
                              'public.brief_content_problems(text, text, jsonb, jsonb, text, text, jsonb)',
                              'public.country_report_content_problems(jsonb)'] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'post: % is executable by anon/authenticated', v_fn;
    END IF;
  END LOOP;
  -- the hidden-character rules behave as documented
  IF public.strip_hidden_chars(U&'a\200Bb\202Ec\+0E0041d\00ADe\FEFFf') <> 'abcdef'
     OR public.first_hidden_char(U&'x\202Ey') <> 'U+202E'
     OR public.first_hidden_char(U&'x\+0E0041y') <> 'U+E0041'
     OR public.first_hidden_char(U&'\0645\064A\200C\062E\0648\0627\0647\0645') IS NOT NULL      -- Persian ZWNJ kept
     OR public.first_hidden_char(U&'ig\200Cnore') <> 'U+200C'
     OR public.first_hidden_char(U&'\0627\0644\062D\064E\0631\0652\0628\064F \0640\0640') IS NOT NULL THEN  -- harakat, tatweel
    RAISE EXCEPTION 'post: hidden-character functions misbehave';
  END IF;
  -- Informational only (nothing is changed): existing rows that would be refused IF rewritten as they are.
  SELECT count(*) INTO v_bad_briefs FROM public.daily_briefings b
   WHERE EXISTS (SELECT 1 FROM public.brief_content_problems(b.title, b.lead, b.sections, b.cover_stats, b.title_ar, b.lead_ar, b.sections_ar));
  SELECT count(*) INTO v_bad_reports FROM public.country_reports c
   WHERE EXISTS (SELECT 1 FROM public.country_report_content_problems(c.content_json));
  RAISE NOTICE 'writer guard installed. Existing rows that would fail if rewritten unchanged (left untouched): daily_briefings %, country_reports %',
    v_bad_briefs, v_bad_reports;
END $post$;

COMMIT;
