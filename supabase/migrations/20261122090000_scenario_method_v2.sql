-- market-anchored-v2 (operator ruling A-01, 2026-11-22; memo claude/scenario-v2-memo-2026-11-04.md).
--
-- Why: scenario D's defining event occurred. Polymarket resolved "US x Iran ceasefire continues through
-- November 30?" and "... December 31?" No on 2026-11-03 (Day 249 by the market's calendar). Under v1 that
-- closed core market freezes every run (KEEP_FROZEN since Day 249). v2 ends that one link and measures D as
-- D-prime from Day 250 on the markets that still price it. The site draws each method_version as its own
-- series, so the chart breaks at the change; readings for Days up to 248 stay as published (no correction).
--
-- What this migration does (idempotent, no data deleted):
--   1. registers method_version 'market-anchored-v2' (a new row; the published v1 row is never edited);
--   2. updates scenario D's public name and definition to say what v2 measures and what it no longer does.
-- Status, code, group, legacy column and born_day of D are untouched (the guard trigger forbids changing them).

INSERT INTO public.scenario_methods (method_version, family, description, spec_ref, code_ref)
VALUES (
  'market-anchored-v2', 'market-anchored',
  'Market-anchored v2: as v1 (class probability = highest qualifying proxy, mid of YES bid/ask; floors spread<=0.05, '
  || 'liquidity>=$10k, volume>=$10k, resolution=H; C via Hormuz gate; B residual; precedence D>C>A>B; Hamilton '
  || 'rounding; E independent), except that from Day 250 the US-Iran ceasefire link is ended because the scenario D '
  || 'event occurred on Day 249 (ruling A-01). D is measured as D-prime: an Israel-Iran strike, a US invasion of Iran, '
  || 'an Israeli ground operation in Iran, loss of Iranian control of Kharg, or a new state belligerent striking Iran. '
  || 'Further limited US strikes on Iran are unmeasured: no open market prices them. A closed core market without an '
  || 'operator ruling still freezes the run.',
  'claude/scenario-v2-memo-2026-11-04.md (options i-b then ii); operator ruling A-01 2026-11-22',
  '.github/workflows/scripts/scenario_daily.py (METHOD_VERSION market-anchored-v2, V2_FROM_DAY 250, D_OCCURRED)'
)
ON CONFLICT (method_version) DO NOTHING;

UPDATE public.scenarios
   SET name_en = 'Israel–Iran strike or ground war on Iran',
       definition_en = 'From Day 250 (method market-anchored-v2, ruling A-01): within the horizon, any one of: an '
         || 'Israel-Iran strike (that ceasefire breaks); a US invasion of Iran; an Israeli ground operation in Iran; '
         || 'Kharg Island leaves Iranian control; a new state belligerent strikes Iran. Further limited US strikes on '
         || 'Iran are not measured, because no open market prices them. Up to Day 249 (market-anchored-v1) D also '
         || 'counted a US kinetic strike on Iranian territory (ruling J1); that event occurred on Day 249.',
       updated_at = now()
 WHERE code = 'D'
   AND name_en = 'US strike on Iran or Israel–Iran strike';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.scenario_methods WHERE method_version = 'market-anchored-v2') THEN
    RAISE EXCEPTION 'market-anchored-v2 not registered';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scenarios WHERE code = 'D' AND status = 'active'
                   AND name_en = 'Israel–Iran strike or ground war on Iran') THEN
    RAISE EXCEPTION 'scenario D not updated (name changed since 2026-11-22?)';
  END IF;
END $$;
