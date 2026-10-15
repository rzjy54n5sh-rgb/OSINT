-- =====================================================================================================
-- supabase/tests/posture_yemen_dual_actor_fixture.sql — SCRATCH ONLY (never production).
--
-- Reproduces the SHAPE of production on 2026-10-13 before 20261013090000_posture_yemen_dual_actor.sql:
-- 6 posture_evidence rows (GB us-iran, US red-sea-houthi, SA red-sea-houthi, AE us-iran, IR us-iran,
-- ET horn-tigray) and 3 posture_scores rows (GB 75 high, US 50 medium, IR 75 medium, all Day 228,
-- new_evidence), same countries / conflicts / kinds / dates / confidences. Quotes and URLs are SYNTHETIC
-- ("TEST", example.test). Loaded after war_posture_v2 and BEFORE the dual-actor migration, so the
-- migration has existing rows to keep valid ("existing rows default to government", "no data change").
-- =====================================================================================================
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, speaker, speaker_office, source_url, page_sha256,
                                     captured_at, stated_at, method_version, quote_language, party_source) VALUES
  ('00000000-0000-0000-0000-0000000f0001', 'GB', 'us-iran',        'TEST GB quote', 'TEST', 'Prime Minister', 'https://example.test/gb', repeat('1', 64), '2026-10-13T02:06:00Z', '2026-10-12T00:00:00Z', 'war-posture-v2', 'en', true),
  ('00000000-0000-0000-0000-0000000f0002', 'US', 'red-sea-houthi', 'TEST US quote', 'TEST', 'President',      'https://example.test/us', repeat('2', 64), '2026-10-13T02:02:16Z', '2026-10-12T00:00:00Z', 'war-posture-v2', 'en', false),
  ('00000000-0000-0000-0000-0000000f0003', 'SA', 'red-sea-houthi', 'TEST SA quote', 'TEST', 'Energy Minister','https://example.test/sa', repeat('3', 64), '2026-10-13T02:02:16Z', '2026-10-12T00:00:00Z', 'war-posture-v2', 'en', false),
  ('00000000-0000-0000-0000-0000000f0004', 'AE', 'us-iran',        'TEST AE quote', 'TEST', 'Minister of State','https://example.test/ae', repeat('4', 64), '2026-10-13T02:02:16Z', '2026-10-12T00:00:00Z', 'war-posture-v2', 'en', false),
  ('00000000-0000-0000-0000-0000000f0005', 'IR', 'us-iran',        'TEST IR quote', 'TEST', 'Chief of staff', 'https://example.test/ir', repeat('5', 64), '2026-10-13T02:04:15Z', '2026-10-11T00:00:00Z', 'war-posture-v2', 'en', false),
  ('00000000-0000-0000-0000-0000000f0006', 'ET', 'horn-tigray',    'TEST ET quote', 'TEST', 'Adviser',        'https://example.test/et', repeat('6', 64), '2026-10-13T02:04:15Z', '2026-10-12T00:00:00Z', 'war-posture-v2', 'en', false);
INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason) VALUES
  ('GB', 'us-iran',        228, '2026-10-13', 'position', 'continued_pressure', 75, '00000000-0000-0000-0000-0000000f0001', 'high',   'new_evidence'),
  ('US', 'red-sea-houthi', 228, '2026-10-13', 'position', 'ambivalent',         50, '00000000-0000-0000-0000-0000000f0002', 'medium', 'new_evidence'),
  ('IR', 'us-iran',        228, '2026-10-13', 'position', 'continued_pressure', 75, '00000000-0000-0000-0000-0000000f0005', 'medium', 'new_evidence');
COMMIT;
