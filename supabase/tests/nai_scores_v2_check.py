#!/usr/bin/env python3
"""
nai_scores_v2 verification — run ONLY against a throwaway local Postgres, never production.

What it proves
  1. public.nai_c2_point(E, L)          == memo c2(E, L)            for every integer E, L in 0..100 (+ NULLs)
  2. public.nai_c2_category(E, lo, hi)  == memo banded(c2, E, lo, hi) for EVERY integer 0<=lo<=hi<=100, E in 0..100
     (520,251 combinations, exhaustive) plus NULL E / NULL band cases
  3. The generated columns (gap, gap_size, category) of public.nai_scores_v2 match the memo on contract rows
  4. Every CHECK rejects what it should and accepts the data contract 1:1
  5. RLS: anon/authenticated can SELECT, cannot INSERT/UPDATE/DELETE; service_role can write

Usage (needs psql on PATH and a database whose name contains "test"):
  python3 supabase/tests/nai_scores_v2_check.py --apply -- -h /tmp/pg -p 54329 -U postgres -d nai_test
  --apply : create the Supabase roles (anon, authenticated, service_role) if missing and apply
            supabase/migrations/20261006120000_nai_scores_v2.sql to that database first.

Memo source: NAI decision memo 2026-10-06 §3 / candidates.py. The two functions below are copied
verbatim (side, c2, banded); --memo-path optionally imports the original file and asserts the copy
is identical in behaviour.
"""
import os
import subprocess
import sys

U = 'UNSCORABLE'


# ---- verbatim from /tmp/claude-0/nai/candidates.py (memo §3) --------------------------------
def side(x): return x>=50
def c2(E,L):
    if E is None or L is None: return U
    g=abs(E-L)
    if g<10: return 'ALIGNED'
    if g<20: return 'STABLE'
    if g<30: return 'TENSION'
    if side(E)==side(L): return 'FRACTURE'
    return 'INVERSION'
def banded(f,E,lo,hi):
    if E is None or lo is None or hi is None: return U
    cats={f(E,L) for L in range(lo,hi+1)}
    return cats.pop() if len(cats)==1 else U
# ---------------------------------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
MIGRATION = os.path.join(HERE, '..', 'migrations', '20261006120000_nai_scores_v2.sql')

FAILS = []


def check(name, ok, detail=''):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{(' — ' + detail) if detail else ''}")
    if not ok:
        FAILS.append(name)


class PG:
    def __init__(self, args):
        self.args = args

    def run(self, sql, role=None, expect_error=False):
        """Run SQL in one transaction (optionally as a role). Returns (ok, stdout, stderr)."""
        body = sql if role is None else f"SET ROLE {role};\n{sql}"
        p = subprocess.run(
            ['psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '--single-transaction', *self.args],
            input=body, capture_output=True, text=True,
        )
        return p.returncode == 0, p.stdout, p.stderr

    def file(self, path):
        p = subprocess.run(['psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', *self.args, '-f', path],
                           capture_output=True, text=True)
        return p.returncode == 0, p.stdout, p.stderr


def main():
    argv = sys.argv[1:]
    apply = '--apply' in argv
    memo_path = None
    if '--memo-path' in argv:
        memo_path = argv[argv.index('--memo-path') + 1]
    psql_args = argv[argv.index('--') + 1:] if '--' in argv else []
    pg = PG(psql_args)

    ok, dbname, err = pg.run('SELECT current_database();')
    if not ok:
        sys.exit(f'cannot connect: {err}')
    dbname = dbname.strip()
    if 'test' not in dbname:
        sys.exit(f'refusing to run against database "{dbname}" — name must contain "test" (throwaway DB only)')
    ok, ver, _ = pg.run('SHOW server_version;')
    print(f'database={dbname} server_version={ver.strip()}')

    if memo_path:
        sys.path.insert(0, os.path.dirname(memo_path))
        import importlib.util
        spec = importlib.util.spec_from_file_location('memo_candidates', memo_path)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        diff = sum(m.c2(E, L) != c2(E, L) for E in range(101) for L in range(101))
        check('verbatim copy of memo c2 == imported memo c2 (10,201 points)', diff == 0, f'disagreements={diff}')
        diff = sum(m.banded(m.c2, E, lo, hi) != banded(c2, E, lo, hi)
                   for E in range(0, 101, 5) for lo in range(101) for hi in range(lo, 101))
        check('verbatim copy of memo banded == imported memo banded (E step 5, all bands)', diff == 0, f'disagreements={diff}')

    if apply:
        ok, _, err = pg.run("""
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- emulate Supabase default privileges (ALL to anon/authenticated) so the migration's REVOKE is exercised
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
""")
        check('create Supabase roles', ok, err.strip())
        ok, _, err = pg.file(MIGRATION)
        check('apply migration (first run)', ok, err.strip())
        ok, _, err = pg.file(MIGRATION)
        check('apply migration again (idempotent re-run)', ok, err.strip())

    # ---- 1. point function, exhaustive -------------------------------------------------------
    ok, out, err = pg.run("SELECT e, l, public.nai_c2_point(e, l) FROM generate_series(0,100) e, generate_series(0,100) l;")
    rows = [r.split('|') for r in out.split()] if ok else []
    mism = [r for r in rows if c2(int(r[0]), int(r[1])) != r[2]]
    check('nai_c2_point == c2 over all 101x101 integer points', ok and len(rows) == 10201 and not mism,
          f'rows={len(rows)} disagreements={len(mism)} {err.strip()}')

    # ---- 2. banded category, exhaustive over 520,251 (E, lo, hi) -------------------------------
    ok, out, err = pg.run(
        "SELECT e, lo, hi, public.nai_c2_category(e, lo, hi) "
        "FROM generate_series(0,100) e, generate_series(0,100) lo, generate_series(0,100) hi WHERE lo <= hi;")
    n = 0
    mism = []
    if ok:
        for line in out.split():
            e, lo, hi, cat = line.split('|')
            n += 1
            exp = banded(c2, int(e), int(lo), int(hi))
            if exp != cat:
                mism.append((e, lo, hi, cat, exp))
    from collections import Counter
    dist = Counter(line.rsplit('|', 1)[1] for line in out.split()) if ok else {}
    check('nai_c2_category == banded(c2) over every 0<=lo<=hi<=100, E 0..100', ok and n == 520251 and not mism,
          f'combos={n} disagreements={len(mism)} first={mism[:3]} dist={dict(sorted(dist.items()))} {err.strip()}')

    # NULL handling and degenerate inputs
    null_cases = [(None, 40, 60), (50, None, 60), (50, 40, None), (None, None, None), (50, None, None)]
    sql = ' UNION ALL '.join(
        f"SELECT {i}, public.nai_c2_category({'NULL' if e is None else e}::int, {'NULL' if lo is None else lo}::int, {'NULL' if hi is None else hi}::int)"
        for i, (e, lo, hi) in enumerate(null_cases)) + ' ORDER BY 1;'
    ok, out, err = pg.run(sql)
    got = [r.split('|')[1] for r in out.split()] if ok else []
    exp = [banded(c2, *c) for c in null_cases]
    check('NULL E / NULL band -> UNSCORABLE (SQL == memo)', ok and got == exp, f'sql={got} memo={exp}')
    ok, out, _ = pg.run("SELECT public.nai_c2_category(50, 60, 40);")
    check('inverted band lo>hi -> UNSCORABLE (SQL == memo)', out.strip() == banded(c2, 50, 60, 40), f'sql={out.strip()}')

    # ---- 3/4. table: contract rows, generated columns, constraints ----------------------------
    src_e = '{"claim":"MFA readout calls for ceasefire","name":"Reuters","url":"https://www.reuters.com/x","published_at":"2026-10-06T08:00:00Z","party_source":false,"feeds":"E"}'
    src_l = '{"claim":"Poll: 61% oppose continued strikes","name":"AP","url":"https://apnews.com/y","published_at":"2026-10-05T12:00:00Z","party_source":false,"feeds":"L"}'

    def ins(e='70', lo='40', hi='44', conf="'medium'", sources=f"'[{src_e},{src_l}]'", cc="'IR'", day='221', extra_cols='', extra_vals=''):
        return (f"INSERT INTO public.nai_scores_v2 (country_code, conflict_day, as_of, expressed_score, expressed_basis, "
                f"latent_low, latent_high, latent_basis, confidence, sources{extra_cols}) VALUES "
                f"({cc}, {day}, '2026-10-06', {e}, 'basis', {lo}, {hi}, 'basis', {conf}, {sources}::jsonb{extra_vals}) "
                f"RETURNING expressed_score, latent_low, latent_high, gap, gap_size, category, method_version;")

    cases_ok = [
        ('E70 band 40-44', ins()),
        ('E null, band null (all evidence missing)', ins(e='NULL', lo='NULL', hi='NULL', sources=f"'[{src_e}]'")),
        ('E85 band 60-80 (ambiguous band)', ins(e='85', lo='60', hi='80')),
        ('E5 band 60-80', ins(e='5', lo='60', hi='80')),
        ('E50 band null', ins(e='50', lo='NULL', hi='NULL', sources=f"'[{src_e}]'")),
        ('E55 point band 50-50', ins(e='55', lo='50', hi='50')),
    ]
    for name, sql in cases_ok:
        ok, out, err = pg.run(sql + '\nROLLBACK;', role='service_role')
        if not ok:
            check(f'accept contract row: {name}', False, err.strip())
            continue
        e, lo, hi, gap, gsize, cat, mv = out.strip().split('|')
        E = int(e) if e else None
        LO = int(lo) if lo else None
        HI = int(hi) if hi else None
        exp_cat = banded(c2, E, LO, HI)
        if E is not None and LO is not None:
            exp_gap = E - (LO + HI) / 2
            gap_ok = abs(float(gap) - exp_gap) < 1e-9 and abs(float(gsize) - abs(exp_gap)) < 1e-9
        else:
            gap_ok = gap == '' and gsize == ''
        check(f'accept contract row: {name}', cat == exp_cat and gap_ok and mv == 'war-posture-v1',
              f'category={cat} (memo {exp_cat}) gap={gap or "NULL"} gap_size={gsize or "NULL"} method={mv}')

    bad = '{"claim":"x","name":"y","url":"https://a.b","published_at":"2026-10-06","party_source":false,"feeds":"E"}'
    # (name, sql, expected error substring(s) — the rejection must come from the intended guard)
    shape = dict(e='NULL', lo='NULL', hi='NULL')   # isolate the source-shape guard from the E/L-sourced guards
    cases_bad = [
        ('E out of range 101', ins(e='101'), ['expressed_range']),
        ('E negative', ins(e='-1'), ['expressed_range']),
        ('latent_high out of range', ins(hi='101'), ['latent_high_range']),
        ('latent_low > latent_high', ins(lo='60', hi='40'), ['latent_order']),
        ('only latent_low set', ins(lo='40', hi='NULL'), ['latent_both_or_neither']),
        ('only latent_high set', ins(lo='NULL', hi='40'), ['latent_both_or_neither']),
        ('confidence not in enum', ins(conf="'certain'"), ['confidence_chk']),
        ('confidence NULL', ins(conf='NULL'), ['"confidence"']),
        ('sources empty array', ins(sources="'[]'", **shape), ['sources_nonempty']),
        ('sources NULL', ins(sources='NULL'), ['"sources"']),
        ('sources not an array', ins(sources=f"'{src_e}'", **shape), ['sources_nonempty']),
        ('source missing url', ins(sources='\'[{"claim":"x","name":"y","published_at":"2026","party_source":true,"feeds":"E"}]\'', **shape), ['sources_shape']),
        ('source url not http(s)', ins(sources=f"'[{bad.replace('https://a.b', 'ftp://a.b')}]'", **shape), ['sources_shape']),
        ('source empty claim', ins(sources=f"'[{bad.replace('\"claim\":\"x\"', '\"claim\":\" \"')}]'", **shape), ['sources_shape']),
        ('source missing name', ins(sources=f"'[{bad.replace('\"name\":\"y\",', '')}]'", **shape), ['sources_shape']),
        ('source missing published_at', ins(sources=f"'[{bad.replace('\"published_at\":\"2026-10-06\",', '')}]'", **shape), ['sources_shape']),
        ('source feeds invalid', ins(sources=f"'[{bad.replace('\"feeds\":\"E\"', '\"feeds\":\"X\"')}]'", **shape), ['sources_shape']),
        ('source party_source not boolean', ins(sources=f"'[{bad.replace('false', '\"no\"')}]'", **shape), ['sources_shape']),
        ('one good + one bad source', ins(sources=f"'[{src_e},{src_l},{bad.replace('https://a.b', 'not-a-url')}]'"), ['sources_shape']),
        ('E scored but no source feeds E', ins(sources=f"'[{src_l}]'"), ['expressed_sourced']),
        ('band scored but no source feeds L', ins(sources=f"'[{src_e}]'"), ['latent_sourced']),
        ('country_code lowercase', ins(cc="'ir'"), ['country_code_chk']),
        ('conflict_day 0', ins(day='0'), ['conflict_day_chk']),
        ('fractional score "62.5" as JSON text input (integer column)', ins(e="'62.5'"), ['invalid input syntax for type integer']),
        ('category written directly (generated column)', ins(extra_cols=', category', extra_vals=", 'ALIGNED'"), ['cannot insert a non-DEFAULT value']),
    ]
    for name, sql, expect in cases_bad:
        ok, _, err = pg.run(sql + '\nROLLBACK;', role='service_role')
        first = next((l for l in err.splitlines() if l.startswith('ERROR')), '')
        check(f'reject: {name}', (not ok) and any(x in first for x in expect), first[:120] or 'ACCEPTED (no error)')

    ok, _, err = pg.run(ins() + ins(), role='service_role')
    check('reject: duplicate (country_code, conflict_day, method_version)', not ok, (err.strip().splitlines() or [''])[0][:110])
    ok, _, err = pg.run(ins() + ins(extra_cols=', method_version', extra_vals=", 'war-posture-v2'") + '\nROLLBACK;', role='service_role')
    check('accept: same country/day under a different method_version', ok, err.strip())

    # ---- 5. RLS / privileges -------------------------------------------------------------------
    ok, _, err = pg.run(ins(day='999'), role='service_role')   # committed fixture row for SELECT tests
    check('service_role INSERT', ok, err.strip())
    for role in ('anon', 'authenticated'):
        ok, out, err = pg.run('SELECT count(*) FROM public.nai_scores_v2 WHERE conflict_day = 999;', role=role)
        check(f'{role} SELECT', ok and out.strip() == '1', f'count={out.strip()} {err.strip()}')
        ok, _, err = pg.run(ins(day='998') + '\nROLLBACK;', role=role)
        check(f'{role} INSERT rejected', not ok, (err.strip().splitlines() or [''])[0][:110])
        ok, out, err = pg.run("UPDATE public.nai_scores_v2 SET confidence='low' WHERE conflict_day=999 RETURNING 1;\nROLLBACK;", role=role)
        check(f'{role} UPDATE rejected', not ok or out.strip() == '', (err.strip().splitlines() or [''])[0][:110] or 'zero rows')
        ok, out, err = pg.run("DELETE FROM public.nai_scores_v2 WHERE conflict_day=999 RETURNING 1;\nROLLBACK;", role=role)
        check(f'{role} DELETE rejected', not ok or out.strip() == '', (err.strip().splitlines() or [''])[0][:110] or 'zero rows')
    ok, _, err = pg.run('DELETE FROM public.nai_scores_v2 WHERE conflict_day = 999;', role='service_role')
    check('service_role DELETE (cleanup fixture)', ok, err.strip())
    ok, out, _ = pg.run("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nai_scores_v2'::regclass;")
    check('RLS enabled', out.strip() == 't')
    ok, out, _ = pg.run("SELECT provolatile FROM pg_proc WHERE proname IN ('nai_c2_point','nai_c2_category') ORDER BY proname;")
    check('nai_c2_* functions are IMMUTABLE', out.split() == ['i', 'i'], out.strip())
    ok, out, _ = pg.run("SELECT to_regclass('public.nai_scores') IS NULL;")
    check('legacy nai_scores not created/touched by this migration', out.strip() == 't', 'nai_scores absent in throwaway DB')

    print(f'\nSUMMARY: {len(FAILS)} failure(s)' + (f': {FAILS}' if FAILS else ''))
    sys.exit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
