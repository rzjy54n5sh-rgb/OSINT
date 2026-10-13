-- Assertions for 20261013121000_writer_guard.sql (scratch only; run by run_writer_guard_tests.sh).
-- Each probe runs its statements in a sub-transaction that is ALWAYS rolled back (probes never change the
-- database) and records the SQLSTATE it ended with.
--   expect: 'ok' | a SQLSTATE ('23514' check_violation = this guard or the paused-type guard,
--           '23001' restrict_violation = no-silent-edit, '42501' insufficient_privilege)
--   p_check (optional): a boolean SELECT evaluated after the statements, inside the same sub-transaction
--   p_msg_like (optional): LIKE pattern matched against 'MESSAGE | DETAIL | HINT'
-- Prints one PASS/FAIL line per probe, the verbatim error of selected probes, and "total|pass|fail";
-- exits non-zero if any probe fails.
\set ON_ERROR_STOP 1
SET TimeZone = 'UTC';
CREATE TEMP TABLE r (n serial, ok boolean, label text, got text, detail text, show boolean);

CREATE OR REPLACE FUNCTION pg_temp.probe(p_label text, p_expect text, p_sql text[], p_check text DEFAULT NULL,
                                         p_msg_like text DEFAULT NULL, p_show boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_got text; v_msg text := ''; v_det text := ''; v_hint text := ''; s text; v_ok boolean; v_all text;
BEGIN
  BEGIN
    FOREACH s IN ARRAY p_sql LOOP EXECUTE s; END LOOP;
    v_got := 'ok';
    IF p_check IS NOT NULL THEN
      EXECUTE p_check INTO v_ok;
      IF v_ok IS NOT TRUE THEN v_got := 'ok_but_check_failed'; END IF;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = '__rollback__';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_got = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_det = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  END;
  v_all := coalesce(v_msg, '') || ' | ' || coalesce(v_det, '') || ' | ' || coalesce(v_hint, '');
  INSERT INTO r (ok, label, got, detail, show)
  VALUES (v_got = p_expect AND (p_msg_like IS NULL OR v_all LIKE p_msg_like), p_label, v_got,
          CASE WHEN v_got IN ('ok', 'ok_but_check_failed') THEN '' ELSE v_all END, p_show);
END $f$;

-- ---- synthetic TEST fixtures (scratch only, never published) --------------------------------------------
CREATE TEMP TABLE fx (name text PRIMARY KEY, j jsonb);
GRANT SELECT ON fx TO PUBLIC;
INSERT INTO fx VALUES
 ('good', $j$[{"id": "s1", "type": "military", "heading": "TEST strikes", "subsections": [{"id": "s1a", "heading": "TEST overnight",
   "paragraphs": [
     {"text": "TEST paragraph citing a party source.", "perspective": "iran_irgc",
      "sources": [{"name": "IRNA", "url": "https://en.irna.ir/news/0000", "published_at": "2026-10-13T01:00:00Z",
                   "retrieved_at": "2026-10-13T02:00:00Z", "archive_url": null, "tier": 3, "party_source": true}]},
     {"text": "No sourced data available for Day 229.", "perspective": "neutral", "sources": []}]}]}]$j$),
 ('arabic', $j$[{"id": "s1", "heading": "الضربات", "subsections": [{"id": "s1a", "heading": "الليلة الماضية",
   "paragraphs": [{"text": "أفادَتْ وكالةُ الأنباءِ بوقوعِ ضرباتٍ قُربَ أصفهانَ ـــ وفقاً للمصدر.", "perspective": "neutral",
                   "sources": [{"name": "وكالة", "url": "https://example.org/ar/1"}]}]}]}]$j$);

-- helper: INSERT a NEW brief (Day 9229 general, active type; provenance left to the provenance trigger)
CREATE OR REPLACE FUNCTION pg_temp.ins(p_sections text, p_title text DEFAULT 'TEST title', p_lead text DEFAULT 'TEST lead',
                                       p_cover text DEFAULT 'NULL', p_extra_cols text DEFAULT '', p_extra_vals text DEFAULT '',
                                       p_type text DEFAULT 'general', p_day int DEFAULT 9229)
RETURNS text LANGUAGE sql AS $f$
  SELECT format('INSERT INTO public.daily_briefings (conflict_day, report_type, title, lead, sections, cover_stats%s) VALUES (%s, %L, %L, %L, (%s)::jsonb, (%s)::jsonb%s)',
                p_extra_cols, p_day, p_type, p_title, p_lead, p_sections, p_cover, p_extra_vals)
$f$;
-- helper: good sections with one change at a json path
CREATE OR REPLACE FUNCTION pg_temp.good_with(p_path text, p_value text) RETURNS text LANGUAGE sql AS $f$
  SELECT format('jsonb_set((SELECT j FROM fx WHERE name = ''good''), %L, %L::jsonb)', p_path, p_value)
$f$;
\set G '(SELECT j FROM fx WHERE name = ''good'')'

-- ============ 1. the guard is installed, ordered and always on ============================================
SELECT pg_temp.probe('trigger order on daily_briefings = no_silent_edit, provenance, reject_inactive_type, writer_guard', 'ok', ARRAY['SELECT 1'],
  $$SELECT string_agg(tgname || ':' || tgenabled::text, ',' ORDER BY tgname) = 'daily_briefings_no_silent_edit:A,daily_briefings_provenance:O,daily_briefings_reject_inactive_type:O,daily_briefings_writer_guard:A'
      FROM pg_trigger WHERE tgrelid = 'public.daily_briefings'::regclass AND NOT tgisinternal$$);
SELECT pg_temp.probe('country_reports triggers = country_reports_updated_at, country_reports_writer_guard (ALWAYS)', 'ok', ARRAY['SELECT 1'],
  $$SELECT string_agg(tgname || ':' || tgenabled::text, ',' ORDER BY tgname) = 'country_reports_updated_at:O,country_reports_writer_guard:A'
      FROM pg_trigger WHERE tgrelid = 'public.country_reports'::regclass AND NOT tgisinternal$$);

-- ============ 2. real production rows (Days 219-228) replayed as NEW briefs ==============================
-- Each real row is re-inserted with a fresh id on conflict_day + 1000 under session_replication_role = replica:
-- ORIGIN triggers (provenance, paused-type) and FKs are skipped, ALWAYS triggers (no_silent_edit, writer guard) run.
-- Days 221-228 (per-paragraph sources format) must pass; Days 219-220 predate that format (no "sources" key in any
-- paragraph) and must be refused if written again — they stay untouched in place (section 6).
SELECT pg_temp.probe(format('replay real Day %s %-18s as a new brief -> %s', d, rt, CASE WHEN d >= 221 THEN 'accepted' ELSE 'refused (legacy, no sources)' END),
  CASE WHEN d >= 221 THEN 'ok' ELSE '23514' END,
  ARRAY['SET LOCAL session_replication_role = replica',
        format($q$INSERT INTO public.daily_briefings SELECT (jsonb_populate_record(NULL::public.daily_briefings, %L::jsonb || jsonb_build_object('id', gen_random_uuid(), 'conflict_day', %s))).*$q$, j::text, d + 1000)],
  NULL, CASE WHEN d >= 221 THEN NULL ELSE 'daily_briefings writer guard: %' END)
  FROM (SELECT j, (j->>'conflict_day')::int d, j->>'report_type' rt FROM wg_dump.db) x ORDER BY d DESC, rt;
SELECT pg_temp.probe('replay real Day 228 briefs through the FULL trigger stack (no replica mode, provenance recomputed)', 'ok',
  ARRAY[$q$INSERT INTO public.daily_briefings SELECT (jsonb_populate_record(NULL::public.daily_briefings, j || jsonb_build_object('id', gen_random_uuid(), 'conflict_day', 1228, 'provenance', NULL, 'generated_at', now()))).*
          FROM wg_dump.db WHERE (j->>'conflict_day')::int = 228$q$],
  $$SELECT count(*) = 4 FROM public.daily_briefings WHERE conflict_day = 1228$$);
SELECT pg_temp.probe('Days 219-220 refusal reasons: EVERY paragraph lacks a "sources" array (176 of 176) + Day 220 cover_stats is an array (5 rows)', 'ok', ARRAY['SELECT 1'],
  $$SELECT (SELECT count(*) FROM wg_dump.db, public.brief_content_problems(j->>'title', j->>'lead', j->'sections', CASE WHEN j->'cover_stats' = 'null' THEN NULL ELSE j->'cover_stats' END) p
             WHERE (j->>'conflict_day')::int <= 220 AND p.problem LIKE '%no "sources" array%') = 176
       AND (SELECT count(*) FROM wg_dump.db, jsonb_array_elements(j->'sections') s, jsonb_array_elements(s->'subsections') u, jsonb_array_elements(u->'paragraphs') para
             WHERE (j->>'conflict_day')::int <= 220) = 176
       AND (SELECT count(*) FROM wg_dump.db, public.brief_content_problems(j->>'title', j->>'lead', j->'sections', CASE WHEN j->'cover_stats' = 'null' THEN NULL ELSE j->'cover_stats' END) p
             WHERE (j->>'conflict_day')::int <= 220 AND p.problem NOT LIKE '%no "sources" array%') = 5$$);
SELECT pg_temp.probe('every zero-source paragraph in real Days 221-228 is a fixed neutral line (brief_fixed_line_ok)', 'ok', ARRAY['SELECT 1'],
  $$SELECT count(*) = 6 AND bool_and(para->>'perspective' = 'neutral' AND public.brief_fixed_line_ok(para->>'text'))
      FROM wg_dump.db, jsonb_array_elements(j->'sections') s, jsonb_array_elements(s->'subsections') u, jsonb_array_elements(u->'paragraphs') para
     WHERE (j->>'conflict_day')::int >= 221 AND jsonb_array_length(para->'sources') = 0$$);
SELECT pg_temp.probe('brief_content_problems() finds nothing in any real Day 221-228 brief', 'ok', ARRAY['SELECT 1'],
  $$SELECT count(*) = 0 FROM wg_dump.db, public.brief_content_problems(j->>'title', j->>'lead', j->'sections', CASE WHEN j->'cover_stats' = 'null' THEN NULL ELSE j->'cover_stats' END)
     WHERE (j->>'conflict_day')::int >= 221$$);

-- ============ 3. shape and sourcing refusals (new Day 9229 general brief) ================================
SELECT pg_temp.probe('good synthetic brief (sourced paragraph + fixed line) -> accepted', 'ok', ARRAY[pg_temp.ins(:'G')],
  $$SELECT count(*) = 1 FROM public.daily_briefings WHERE conflict_day = 9229$$);
SELECT pg_temp.probe('sections = [] -> accepted (empty brief carries no unsourced text)', 'ok', ARRAY[pg_temp.ins($$'[]'$$)]);
SELECT pg_temp.probe('sections is an object -> refused', '23514', ARRAY[pg_temp.ins($$'{"id":"s1"}'$$)], NULL, '%sections must be a JSON array%');
SELECT pg_temp.probe('sections is a JSON string -> refused', '23514', ARRAY[pg_temp.ins($$'"[]"'$$)], NULL, '%must be a JSON array of sections, got string%');
SELECT pg_temp.probe('section without id -> refused, path sections[0].id', '23514', ARRAY[pg_temp.ins(format('(%s) #- ''{0,id}''', :'G'))], NULL, '%Path: sections[0].id.%');
SELECT pg_temp.probe('section heading is a number -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,heading}', '7'))], NULL, '%section "heading" must be a non-blank string%');
SELECT pg_temp.probe('section type is an object -> refused (any STRING type is fine)', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,type}', '{"x":1}'))]);
SELECT pg_temp.probe('section type = "brand_new_type" (unknown string) -> accepted', 'ok', ARRAY[pg_temp.ins(pg_temp.good_with('{0,type}', '"brand_new_type"'))]);
SELECT pg_temp.probe('subsections missing -> refused', '23514', ARRAY[pg_temp.ins(format('(%s) #- ''{0,subsections}''', :'G'))], NULL, '%subsections" must be an array%');
SELECT pg_temp.probe('paragraphs is an object -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs}', '{}'))], NULL, '%Path: sections[0].subsections[0].paragraphs.%');
SELECT pg_temp.probe('paragraph is a bare string -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0}', '"TEST text"'))]);
SELECT pg_temp.probe('paragraph text blank -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,text}', '"   "'))], NULL, '%text" must be a non-blank string%');
SELECT pg_temp.probe('paragraph text is a number -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,text}', '42'))]);
SELECT pg_temp.probe('bad perspective "anti_us_intervention" -> refused, HINT lists the five codes', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,perspective}', '"anti_us_intervention"'))],
  NULL, '%perspective" must be one of us_israel, iran_irgc, gulf, neutral, both (got "anti_us_intervention")%Use one of the five perspective codes%', true);
SELECT pg_temp.probe('perspective missing -> refused', '23514', ARRAY[pg_temp.ins(format('(%s) #- ''{0,subsections,0,paragraphs,0,perspective}''', :'G'))], NULL, '%(got nothing)%');
SELECT pg_temp.probe('MISSING sources key -> refused with path and HINT', '23514', ARRAY[pg_temp.ins(format('(%s) #- ''{0,subsections,0,paragraphs,0,sources}''', :'G'))],
  NULL, 'daily_briefings writer guard: sections paragraph has no "sources" array%Path: sections[0].subsections[0].paragraphs[0].sources.%Every paragraph needs%', true);
SELECT pg_temp.probe('sources = [] on an ordinary paragraph -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,sources}', '[]'))], NULL, '%zero sources%');
SELECT pg_temp.probe('sources is an object -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,sources}', '{"url":"https://x.org"}'))]);
SELECT pg_temp.probe('source url "javascript:alert(1)" -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,sources,0,url}', '"javascript:alert(1)"'))], NULL, '%sources[0].url%');
SELECT pg_temp.probe('source url with a space -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,sources,0,url}', '"https://x.org/a b"'))]);
SELECT pg_temp.probe('source without url (name only) -> refused', '23514', ARRAY[pg_temp.ins(format('(%s) #- ''{0,subsections,0,paragraphs,0,sources,0,url}''', :'G'))]);
SELECT pg_temp.probe('source is a bare URL string -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,sources,0}', '"https://x.org"'))]);
SELECT pg_temp.probe('archive_url "ftp://x" -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,sources,0,archive_url}', '"ftp://x"'))]);
SELECT pg_temp.probe('2nd paragraph bad -> DETAIL path sections[0].subsections[0].paragraphs[1].sources', '23514',
  ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,1,text}', '"TEST unsourced claim."'))], NULL, '%Path: sections[0].subsections[0].paragraphs[1].sources.%');
SELECT pg_temp.probe('three problems -> DETAIL counts 2 further problems', '23514',
  ARRAY[pg_temp.ins(format('jsonb_set(jsonb_set(%s, ''{0,subsections,0,paragraphs,0,perspective}'', ''"x"''), ''{0,subsections,0,paragraphs,1,text}'', ''"TEST unsourced"'') #- ''{0,id}''', :'G'))],
  NULL, '%2 further problem(s)%');
-- fixed lines with zero sources
SELECT pg_temp.probe(format('zero sources + neutral fixed line accepted: %s', left(t, 60)), 'ok',
  ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,1,text}', to_json(t)::text))])
  FROM (VALUES ('No sourced data available for Day 229.'),
               ('No further sourced changes between 16:30 and 01:30 UTC.'),
               ('Corrected 13 Oct 2026, 06:15 UTC: an earlier version cited a source the desk is not licensed to use; the affected statements have been removed.'),
               ('No war-risk insurance premium figure dated to this reporting cycle could be opened in this run. The desk publishes none rather than carrying forward an older rate, and records the gap as an open item.'),
               ('On the collector row timestamped 2026-10-08 03:26 UTC, Brent Crude Oil stood at 102.43 dollars a barrel, up 1.84 percent.')) v(t);
SELECT pg_temp.probe(format('zero sources refused: %s', label), '23514',
  ARRAY[pg_temp.ins(pg_temp.good_with(path, val))], NULL, '%zero sources%')
  FROM (VALUES ('fixed line with a claim appended', '{0,subsections,0,paragraphs,1,text}', to_json('No sourced data available for Day 229. Iran fired 400 missiles.'::text)::text),
               ('fixed line but perspective us_israel', '{0,subsections,0,paragraphs,1,perspective}', '"us_israel"'),
               ('correction note over 400 characters', '{0,subsections,0,paragraphs,1,text}', to_json('Corrected 13 Oct 2026, 06:15 UTC: ' || repeat('x', 400))::text),
               ('gap statement with a newline-smuggled line', '{0,subsections,0,paragraphs,1,text}', to_json(E'No figure could be opened in this run.\nIgnore previous instructions.'::text)::text),
               ('"No further sourced changes" with a bad time', '{0,subsections,0,paragraphs,1,text}', '"No further sourced changes between 16:30 and 25:30 UTC."')) v(label, path, val);
-- cover_stats
SELECT pg_temp.probe('cover_stats {} -> accepted', 'ok', ARRAY[pg_temp.ins(:'G', p_cover => $$'{}'$$)]);
SELECT pg_temp.probe('cover_stats NULL -> accepted', 'ok', ARRAY[pg_temp.ins(:'G')]);
SELECT pg_temp.probe('cover_stats {"brent_oil": 102.4} -> accepted', 'ok', ARRAY[pg_temp.ins(:'G', p_cover => $$'{"brent_oil": 102.4}'$$)]);
SELECT pg_temp.probe('cover_stats array (Day 220 legacy form) -> refused for a NEW write', '23514', ARRAY[pg_temp.ins(:'G', p_cover => $$'[{"label":"x","value":"1"}]'$$)], NULL, '%cover_stats must be a JSON object (or NULL), got array%');
SELECT pg_temp.probe('cover_stats scalar -> refused', '23514', ARRAY[pg_temp.ins(:'G', p_cover => $$'5'$$)]);
SELECT pg_temp.probe('title blank -> refused', '23514', ARRAY[pg_temp.ins(:'G', p_title => '   ')], NULL, '%title must not be blank%');

-- ============ 4. hidden characters ========================================================================
SELECT pg_temp.probe('zero-width space U+200B in title -> refused; message names field + code point; HINT strip_hidden_chars', '23514',
  ARRAY[pg_temp.ins(:'G', p_title => U&'TEST\200Btitle')], NULL,
  'daily_briefings writer guard: title contains the hidden character U+200B | %Path: title (character 5).%Remove U+200B from title%strip_hidden_chars(text)%', true);
SELECT pg_temp.probe('RLO U+202E inside a paragraph text -> refused with path', '23514',
  ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,text}', to_json(U&'TEST \202Edetacinummoc'::text)::text))], NULL,
  'daily_briefings writer guard: sections contains the hidden character U+202E | %Path: sections[0].subsections[0].paragraphs[0].text.%', true);
SELECT pg_temp.probe('tag character U+E0041 in lead -> refused', '23514', ARRAY[pg_temp.ins(:'G', p_lead => U&'TEST lead \+0E0041\+0E0042')], NULL, '%lead contains the hidden character U+E0041%');
SELECT pg_temp.probe('JSON-escaped "\u200b" in a heading (decoded by jsonb) -> refused', '23514',
  ARRAY[pg_temp.ins(pg_temp.good_with('{0,heading}', '"TEST\u200bheading"'))], NULL, '%U+200B%Path: sections[0].heading.%');
SELECT pg_temp.probe('BOM U+FEFF in a cover_stats value -> refused', '23514', ARRAY[pg_temp.ins(:'G', p_cover => format('%L', json_build_object('brent_oil', U&'\FEFF102'::text)))], NULL, '%cover_stats contains the hidden character U+FEFF%Path: cover_stats.brent_oil.%');
SELECT pg_temp.probe('soft hyphen U+00AD in a source name -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,sources,0,name}', to_json(U&'IR\00ADNA'::text)::text))], NULL, '%U+00AD%sources[0].name%');
SELECT pg_temp.probe('hidden character inside a JSON KEY -> refused', '23514', ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,sources,0}', format('{"url":"https://x.org","na%sme":"x"}', U&'\2060')))], NULL, '%U+2060%(key %');
SELECT pg_temp.probe('first_hidden_char flags each forbidden class with its exact code point (incl. 5-digit tags U+E0001/E0041/E007F)', 'ok', ARRAY['SELECT 1'],
  $$SELECT bool_and(public.first_hidden_char('a' || chr(cp) || 'b') = 'U+' || CASE WHEN cp < 65536 THEN lpad(upper(to_hex(cp)), 4, '0') ELSE upper(to_hex(cp)) END)
      FROM unnest(ARRAY[x'7F'::int, x'85'::int, x'AD'::int, x'61C'::int, x'180E'::int, x'200B'::int, x'200D'::int, x'200E'::int, x'200F'::int,
                        x'202A'::int, x'202C'::int, x'202E'::int, x'2028'::int, x'2029'::int, x'2060'::int, x'2064'::int, x'2066'::int, x'2069'::int,
                        x'206F'::int, x'FEFF'::int, x'FFF9'::int, x'E0001'::int, x'E0041'::int, x'E007F'::int]) cp$$);
SELECT pg_temp.probe('ordinary characters are NOT flagged (Latin, accents, Arabic, harakat, tatweel, Hebrew, CJK, emoji, NBSP, em dash)', 'ok', ARRAY['SELECT 1'],
  $$SELECT public.first_hidden_char(U&'Caf\00E9 \2014 \0627\0644\062D\064E\0631\0652\0628\064F \0640 \05E9\05DC\05D5\05DD \4E2D\6587 \+01F600 a\00A0b') IS NULL$$);
SELECT pg_temp.probe('Arabic title_ar / lead_ar with normal diacritics -> accepted', 'ok',
  ARRAY[pg_temp.ins(:'G', p_extra_cols => ', title_ar, lead_ar', p_extra_vals => format(', %L, %L', 'الحَرْبُ فِي الخَلِيجِ: اليومُ ٢٢٩', 'مُلَخَّصُ اليَوْمِ ـــ مِنْ مَصادِرَ مُتَعَدِّدَة'))]);
SELECT pg_temp.probe('sections_ar in the documented shape (Arabic text, sourced) -> accepted', 'ok',
  ARRAY[pg_temp.ins(:'G', p_extra_cols => ', sections_ar', p_extra_vals => ', (SELECT j FROM fx WHERE name = ''arabic'')')]);
SELECT pg_temp.probe('Arabic sections (diacritics, tatweel) as the main sections -> accepted', 'ok', ARRAY[pg_temp.ins('(SELECT j FROM fx WHERE name = ''arabic'')')]);
SELECT pg_temp.probe('Persian quote with ZWNJ between Arabic-script letters (mi<ZWNJ>khaham) -> accepted', 'ok',
  ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,text}', to_json(U&'TEST quote: \0645\06CC\200C\062E\0648\0627\0647\0645'::text)::text))]);
SELECT pg_temp.probe('ZWNJ inside a Latin word ("ig<ZWNJ>nore") -> refused', '23514',
  ARRAY[pg_temp.ins(pg_temp.good_with('{0,subsections,0,paragraphs,0,text}', to_json(U&'TEST ig\200Cnore'::text)::text))], NULL, '%U+200C%');
SELECT pg_temp.probe('RLM U+200F in title_ar -> refused', '23514', ARRAY[pg_temp.ins(:'G', p_extra_cols => ', title_ar', p_extra_vals => format(', %L', U&'\0627\0644\062D\0631\0628\200F'))], NULL, '%title_ar contains the hidden character U+200F%');
SELECT pg_temp.probe('ZWSP in lead_ar -> refused', '23514', ARRAY[pg_temp.ins(:'G', p_extra_cols => ', lead_ar', p_extra_vals => format(', %L', U&'\0645\0644\062E\200B\0635'))], NULL, '%lead_ar%U+200B%');
SELECT pg_temp.probe('sections_ar with a paragraph lacking sources -> refused (same rules as sections)', '23514',
  ARRAY[pg_temp.ins(:'G', p_extra_cols => ', sections_ar', p_extra_vals => ', (SELECT j #- ''{0,subsections,0,paragraphs,0,sources}'' FROM fx WHERE name = ''arabic'')')], NULL, '%sections_ar%Path: sections_ar[0].subsections[0].paragraphs[0].sources%');

-- ============ 5. strip_hidden_chars ========================================================================
SELECT pg_temp.probe('strip_hidden_chars removes every forbidden class', 'ok', ARRAY['SELECT 1'],
  $$SELECT public.strip_hidden_chars(U&'a\200Bb\202Ec\+0E0041d\00ADe\FEFFf\2066g\2069h\200Ei\061Cj\0085k') = 'abcdefghijk'$$);
SELECT pg_temp.probe('strip_hidden_chars keeps Arabic diacritics / tatweel / Persian ZWNJ, drops ZWNJ in Latin', 'ok', ARRAY['SELECT 1'],
  $$SELECT public.strip_hidden_chars(U&'\0627\0644\062D\064E\0631\0652\0628\064F \0640 \0645\06CC\200C\062E\0648\0627\0647\0645 ig\200Cnore')
         = U&'\0627\0644\062D\064E\0631\0652\0628\064F \0640 \0645\06CC\200C\062E\0648\0627\0647\0645 ignore'$$);
SELECT pg_temp.probe('strip_hidden_chars: NULL -> NULL, idempotent, output always passes first_hidden_char', 'ok', ARRAY['SELECT 1'],
  $$SELECT public.strip_hidden_chars(NULL) IS NULL
       AND bool_and(public.strip_hidden_chars(public.strip_hidden_chars(t)) = public.strip_hidden_chars(t)
                    AND public.first_hidden_char(public.strip_hidden_chars(t)) IS NULL)
      FROM (VALUES (U&'\0628\200C\200C\0628'), (U&'a\200C\200C\0628'), (U&'\0628\200B\200C\0628'), (U&'\200C\0628'), (U&'x\+0E0001\202Ey'), ('plain')) v(t)$$);
SELECT pg_temp.probe('strip_hidden_chars is IMMUTABLE, STRICT, search_path ''''', 'ok', ARRAY['SELECT 1'],
  $$SELECT provolatile = 'i' AND proisstrict AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.strip_hidden_chars(text)'::regprocedure$$);
SELECT pg_temp.probe('writer path: dirty title through strip_hidden_chars() and dirty sections through strip_hidden_chars_jsonb() -> accepted', 'ok',
  ARRAY[format($q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, lead, sections)
                  VALUES (9229, 'general', public.strip_hidden_chars(%L), public.strip_hidden_chars(%L), public.strip_hidden_chars_jsonb(%s))$q$,
               U&'TEST\200B ti\202Etle', U&'TEST \+0E0041lead', pg_temp.good_with('{0,subsections,0,paragraphs,0,text}', to_json(U&'TEST \202Etext \200Bhere'::text)::text))],
  $$SELECT title = 'TEST title' AND lead = 'TEST lead' AND sections #>> '{0,subsections,0,paragraphs,0,text}' = 'TEST text here'
      FROM public.daily_briefings WHERE conflict_day = 9229$$);
SELECT pg_temp.probe('brief_content_problems() dry-run lists every problem with field/path/code point', 'ok', ARRAY['SELECT 1'],
  $$SELECT count(*) = 3 FROM public.brief_content_problems(U&'T\200B', 'L', jsonb_set(jsonb_set((SELECT j FROM fx WHERE name = 'good'), '{0,subsections,0,paragraphs,0,perspective}', '"x"'), '{0,subsections,0,paragraphs,0,sources}', '[]'), NULL)$$);

-- ============ 6. existing rows, corrections, and the sibling triggers =====================================
\set CORR227B '$$WITH c AS (INSERT INTO public.corrections (target_table, target_id, correction_class, summary) SELECT ''daily_briefings'', id::text, ''minor'', ''TEST correction'' FROM public.daily_briefings WHERE conflict_day = 227 AND report_type = ''business'' RETURNING id) SELECT set_config(''app.correction_id'', id::text, true) FROM c$$'
\set CORR220G '$$WITH c AS (INSERT INTO public.corrections (target_table, target_id, correction_class, summary) SELECT ''daily_briefings'', id::text, ''minor'', ''TEST correction'' FROM public.daily_briefings WHERE conflict_day = 220 AND report_type = ''general'' RETURNING id) SELECT set_config(''app.correction_id'', id::text, true) FROM c$$'
SELECT pg_temp.probe('correction UPSERT on real Day 227 business (paused type, > 2h old): new title, real sections -> accepted', 'ok',
  ARRAY[:CORR227B,
        $q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, lead, sections, cover_stats)
           SELECT 227, 'business', 'TEST corrected title', lead, sections, cover_stats FROM public.daily_briefings WHERE conflict_day = 227 AND report_type = 'business'
           ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, lead = EXCLUDED.lead, sections = EXCLUDED.sections, cover_stats = EXCLUDED.cover_stats$q$],
  $$SELECT title = 'TEST corrected title' FROM public.daily_briefings WHERE conflict_day = 227 AND report_type = 'business'$$);
SELECT pg_temp.probe('correction UPSERT on real Day 227 business rewriting a paragraph (still sourced) -> accepted', 'ok',
  ARRAY[:CORR227B,
        $q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections)
           SELECT 227, 'business', title, jsonb_set(sections, '{0,subsections,0,paragraphs,0,text}', '"TEST corrected paragraph text."') FROM public.daily_briefings WHERE conflict_day = 227 AND report_type = 'business'
           ON CONFLICT (conflict_day, report_type) DO UPDATE SET sections = EXCLUDED.sections$q$],
  $$SELECT sections #>> '{0,subsections,0,paragraphs,0,text}' = 'TEST corrected paragraph text.' FROM public.daily_briefings WHERE conflict_day = 227 AND report_type = 'business'$$);
SELECT pg_temp.probe('correction UPSERT on Day 227 business that strips a paragraph''s sources -> refused by the guard even with a correction', '23514',
  ARRAY[:CORR227B,
        $q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections)
           SELECT 227, 'business', title, jsonb_set(sections, '{0,subsections,0,paragraphs,0,sources}', '[]') FROM public.daily_briefings WHERE conflict_day = 227 AND report_type = 'business'
           ON CONFLICT (conflict_day, report_type) DO UPDATE SET sections = EXCLUDED.sections$q$], NULL, '%(update). Path: sections[0].subsections[0].paragraphs[0].sources.%');
SELECT pg_temp.probe('correction plain UPDATE on Day 227 business adding RLO -> refused', '23514',
  ARRAY[:CORR227B, format($q$UPDATE public.daily_briefings SET title = %L WHERE conflict_day = 227 AND report_type = 'business'$q$, U&'TEST \202Etitle')], NULL, '%U+202E%');
SELECT pg_temp.probe('Day 227 business silent edit with BAD content and NO correction -> no-silent-edit refuses first (23001)', '23001',
  ARRAY[$q$UPDATE public.daily_briefings SET sections = '"bad"' WHERE conflict_day = 227 AND report_type = 'business'$q$], NULL, 'No silent edits%');
SELECT pg_temp.probe('legacy Day 220 general (no paragraph sources, cover_stats array): title-only correction UPSERT -> accepted', 'ok',
  ARRAY[:CORR220G,
        $q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, lead, sections, cover_stats)
           SELECT 220, 'general', 'TEST corrected legacy title', lead, sections, cover_stats FROM public.daily_briefings WHERE conflict_day = 220 AND report_type = 'general'
           ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, lead = EXCLUDED.lead, sections = EXCLUDED.sections, cover_stats = EXCLUDED.cover_stats$q$],
  $$SELECT title = 'TEST corrected legacy title' FROM public.daily_briefings WHERE conflict_day = 220 AND report_type = 'general'$$);
SELECT pg_temp.probe('legacy Day 220 general: correction that CHANGES its sections must bring them to the sourced format -> refused', '23514',
  ARRAY[:CORR220G, $q$UPDATE public.daily_briefings SET sections = sections - 0 WHERE conflict_day = 220 AND report_type = 'general'$q$], NULL, '%no "sources" array%');
SELECT pg_temp.probe('legacy Day 220 general MOVED to another day (with a correction, content unchanged) -> checked like a new brief -> refused', '23514',
  ARRAY[:CORR220G, $q$UPDATE public.daily_briefings SET conflict_day = 9230 WHERE conflict_day = 220 AND report_type = 'general'$q$], NULL, '%(update). Path: cover_stats.%');
SELECT pg_temp.probe('legacy Day 220 general: UPDATE of a non-content column (updated_at) -> accepted, no correction needed', 'ok',
  ARRAY[$q$UPDATE public.daily_briefings SET updated_at = now() WHERE conflict_day = 220 AND report_type = 'general'$q$]);
SELECT pg_temp.probe('legacy Day 220 general: first Arabic translation (NULL -> clean text) -> accepted', 'ok',
  ARRAY[$q$UPDATE public.daily_briefings SET title_ar = 'عنوان' WHERE conflict_day = 220 AND report_type = 'general'$q$]);
SELECT pg_temp.probe('ON CONFLICT DO NOTHING with bad content on an existing (day, type) -> no-op, no error', 'ok',
  ARRAY[$q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections) VALUES (228, 'general', 'x', '"bad"') ON CONFLICT DO NOTHING$q$],
  $$SELECT jsonb_typeof(sections) = 'array' FROM public.daily_briefings WHERE conflict_day = 228 AND report_type = 'general'$$);
SELECT pg_temp.probe('NEW brief of PAUSED type egypt with bad content -> paused-type guard refuses first', '23514',
  ARRAY[pg_temp.ins($$'"bad"'$$, p_type => 'egypt')], NULL, '%report type "egypt" is paused%');
SELECT pg_temp.probe('in-window rewrite (daily build re-upsert of a fresh brief) with bad sections -> refused', '23514',
  ARRAY[pg_temp.ins(:'G'),
        $q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections) VALUES (9229, 'general', 'TEST', '[{"id":"s"}]')
           ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, sections = EXCLUDED.sections$q$], NULL, '%(update)%');
SELECT pg_temp.probe('in-window rewrite with good sections -> accepted', 'ok',
  ARRAY[pg_temp.ins(:'G'),
        format($q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections) VALUES (9229, 'general', 'TEST v2', %s)
           ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, sections = EXCLUDED.sections$q$, :'G')],
  $$SELECT title = 'TEST v2' FROM public.daily_briefings WHERE conflict_day = 9229$$);
SELECT pg_temp.probe('session_replication_role = replica does NOT skip the guard (ENABLE ALWAYS)', '23514',
  ARRAY['SET LOCAL session_replication_role = replica', pg_temp.ins($$'"bad"'$$)], NULL, '%writer guard%');
SELECT pg_temp.probe('as service_role (PostgREST pipeline key): good brief -> accepted', 'ok', ARRAY['SET LOCAL ROLE service_role', pg_temp.ins(:'G')]);
SELECT pg_temp.probe('as service_role: brief with a ZWSP title -> refused by the guard (23514, not a privilege error)', '23514',
  ARRAY['SET LOCAL ROLE service_role', pg_temp.ins(:'G', p_title => U&'x\200By')], NULL, '%U+200B%');
SELECT pg_temp.probe('anon cannot call strip_hidden_chars (EXECUTE revoked)', '42501', ARRAY['SET LOCAL ROLE anon', $$SELECT public.strip_hidden_chars('x')$$]);
SELECT pg_temp.probe('authenticated cannot call brief_content_problems (EXECUTE revoked)', '42501', ARRAY['SET LOCAL ROLE authenticated', $$SELECT * FROM public.brief_content_problems('x', NULL, '[]', NULL)$$]);

-- ============ 7. country_reports.content_json =============================================================
SELECT pg_temp.probe(format('replay real country_reports %s (delete + re-insert verbatim) -> accepted', j->>'country_code'), 'ok',
  ARRAY[format('DELETE FROM public.country_reports WHERE country_code = %L', j->>'country_code'),
        format('INSERT INTO public.country_reports SELECT (jsonb_populate_record(NULL::public.country_reports, %L::jsonb)).*', j::text)],
  format('SELECT content_json = %L::jsonb FROM public.country_reports WHERE country_code = %L', (j->'content_json')::text, j->>'country_code'))
  FROM wg_dump.cr ORDER BY j->>'country_code';
SELECT pg_temp.probe(format('country_reports %s -> refused', label), '23514',
  ARRAY[format('UPDATE public.country_reports SET content_json = %s WHERE country_code = ''IR''', expr)], NULL, msg, show)
  FROM (VALUES
    ('missing key "sources"',                 $$content_json - 'sources'$$,                                       '%required key is missing%Path: content_json.sources.%', false),
    ('extra key "scenarios" (retired writer)', $$content_json || '{"scenarios": {"A": 25, "B": 25, "C": 25, "D": 25}}'$$, 'country_reports writer guard: content_json unexpected key "scenarios"%', true),
    ('sources = []',                          $$jsonb_set(content_json, '{sources}', '[]')$$,                     '%non-empty array%', false),
    ('source url "www.x.org" (no scheme)',    $$jsonb_set(content_json, '{sources,0,url}', '"www.x.org"')$$,       '%content_json.sources[0].url%', false),
    ('RLO in assessment',                     format('jsonb_set(content_json, ''{assessment}'', %L)', to_json(U&'TEST \202Etext'::text)::text), '%U+202E%Path: content_json.assessment.%strip_hidden_chars_jsonb%', true),
    ('key_risks element is a number',         $$jsonb_set(content_json, '{key_risks}', '[1]')$$,                   '%content_json.key_risks[0]%', false),
    ('generated_at "yesterday"',              $$jsonb_set(content_json, '{generated_at}', '"yesterday"')$$,       '%ISO 8601%', false),
    ('blank assessment',                      $$jsonb_set(content_json, '{assessment}', '"  "')$$,                '%non-blank%', false),
    ('content_json is an array',              $$'[]'::jsonb$$,                                                    '%must be a JSON object%', false),
    ('legacy daily_analysis.py payload',      $$'{"nai": {"expressed": 50}, "scenarios": {"A": 25}, "key_risks": ["No sourced data for Day 229."], "stabilizers": [], "assessment": "x", "social_summary": "x", "data_integrity_note": "x", "pipeline_version": "4.0", "generated_at": "2026-10-13T00:00:00Z"}'::jsonb$$, '%unexpected key%', false)
  ) v(label, expr, msg, show);
SELECT pg_temp.probe('country_reports: UPDATE nai_score only (content_json untouched) -> accepted', 'ok', ARRAY[$$UPDATE public.country_reports SET nai_score = nai_score WHERE country_code = 'IR'$$]);
SELECT pg_temp.probe('country_reports: PATCH re-sending the same content_json -> accepted', 'ok', ARRAY[$$UPDATE public.country_reports SET content_json = content_json, conflict_day = conflict_day WHERE country_code = 'IR'$$]);
SELECT pg_temp.probe('country_reports: content_json NULL -> accepted (nullable column, nothing published)', 'ok', ARRAY[$$UPDATE public.country_reports SET content_json = NULL WHERE country_code = 'IR'$$]);
SELECT pg_temp.probe('country_reports: dirty content_json through strip_hidden_chars_jsonb() -> accepted', 'ok',
  ARRAY[format($$UPDATE public.country_reports SET content_json = public.strip_hidden_chars_jsonb(jsonb_set(content_json, '{assessment}', %L)) WHERE country_code = 'IR'$$, to_json(U&'TEST \200Bclean\FEFF'::text)::text)],
  $$SELECT content_json->>'assessment' = 'TEST clean' FROM public.country_reports WHERE country_code = 'IR'$$);
SELECT pg_temp.probe('country_reports: session_replication_role = replica does NOT skip the guard', '23514',
  ARRAY['SET LOCAL session_replication_role = replica', $$UPDATE public.country_reports SET content_json = content_json - 'sources' WHERE country_code = 'IR'$$]);

-- ---- report -------------------------------------------------------------------------------------------------
SELECT CASE WHEN ok THEN 'PASS ' ELSE 'FAIL ' END || label || ' -> ' || got
       || CASE WHEN NOT ok AND detail <> '' THEN '  [' || left(detail, 300) || ']' ELSE '' END
  FROM r ORDER BY n;
SELECT 'ERROR TEXT (' || label || '): ' || detail FROM r WHERE show AND ok ORDER BY n;
SELECT count(*) || '|' || count(*) FILTER (WHERE ok) || '|' || count(*) FILTER (WHERE NOT ok) FROM r;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM r WHERE NOT ok) THEN RAISE EXCEPTION 'writer_guard_test: % failing probe(s)', (SELECT count(*) FROM r WHERE NOT ok); END IF; END $$;
