import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { getConflictDay } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { AdminRole } from '@/types';
import { canAccess } from '@/lib/admin/permissions';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { formatConflictDayShort } from '@/lib/conflict-calendar';

const REPORT_TYPES = ['general', 'egypt', 'uae', 'eschatology', 'business'] as const;
const SOURCES = ['platform', 'claude-daily', 'claude-backfill', 'claude-recovered', 'community'] as const;
const QUALITIES = ['full', 'limited', 'retrospective', 'auto'] as const;
const PAGE_SIZE = 50;
const STATS_PAGE = 1000; // PostgREST default cap — never rely on a single unbounded select
const STATS_MAX_PAGES = 20; // hard stop: 20k rows

type SearchParams = Record<string, string | string[] | undefined>;

type BriefingRow = {
  conflict_day: number;
  report_type: string;
  title: string | null;
  source: string | null;
  quality: string | null;
  generated_at: string | null;
  country_code: string | null;
  country_name: string | null;
};

type CountryReportRow = {
  country_code: string;
  country_name: string | null;
  nai_score: number | null;
  nai_category: string | null;
  content_json: unknown;
  updated_at: string;
  conflict_day: number | null;
};

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

function oneOf<T extends string>(v: string, allowed: readonly T[]): T | '' {
  return (allowed as readonly string[]).includes(v) ? (v as T) : '';
}

function posInt(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function fmtTs(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** Distinct conflict_day values across the WHOLE table (unfiltered), fetched desc in bounded pages. */
async function loadCoverage(admin: ReturnType<typeof createAdminClient>) {
  const days = new Set<number>();
  let total = 0;
  let truncated = false;
  for (let page = 0; page < STATS_MAX_PAGES; page++) {
    const { data, error } = await admin
      .from('daily_briefings')
      .select('conflict_day')
      .order('conflict_day', { ascending: false })
      .range(page * STATS_PAGE, page * STATS_PAGE + STATS_PAGE - 1);
    if (error) return { days, total, truncated, error: error.message };
    const rows = (data ?? []) as { conflict_day: number }[];
    for (const r of rows) days.add(r.conflict_day);
    total += rows.length;
    if (rows.length < STATS_PAGE) return { days, total, truncated, error: null as string | null };
  }
  truncated = true;
  return { days, total, truncated, error: null as string | null };
}

function pageHref(params: Record<string, string>, page: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `/admin/reports?${s}` : '/admin/reports';
}

const inputStyle = { borderColor: 'var(--border)', color: 'var(--text-primary)' } as const;
const inputCls = 'font-mono text-xs px-2 py-2 border rounded-sm bg-transparent';

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getUser();
  if (!user) redirect('/login');
  const adminClient = createAdminClient();
  const { data: adminUser } = await adminClient.from('admin_users').select('id, role, is_active').eq('user_id', user.id).single();
  if (!adminUser?.is_active) redirect('/');
  const role = adminUser.role as AdminRole;
  if (!canAccess('reports', role)) redirect('/admin');

  const sp = await searchParams;
  const fType = oneOf(first(sp.type), REPORT_TYPES);
  const fSource = oneOf(first(sp.source), SOURCES);
  const fQuality = oneOf(first(sp.quality), QUALITIES);
  const fFrom = posInt(first(sp.from));
  const fTo = posInt(first(sp.to));
  const page = posInt(first(sp.page)) ?? 1;
  const filterParams: Record<string, string> = {
    type: fType,
    source: fSource,
    quality: fQuality,
    from: fFrom ? String(fFrom) : '',
    to: fTo ? String(fTo) : '',
  };
  const anyFilter = Object.values(filterParams).some(Boolean);

  const currentDay = await getConflictDay();

  // Filtered, paginated briefing list (newest day first; range keeps us under the 1000-row cap).
  let q = adminClient
    .from('daily_briefings')
    .select('conflict_day, report_type, title, source, quality, generated_at, country_code, country_name', { count: 'exact' });
  if (fType) q = q.eq('report_type', fType);
  if (fSource) q = q.eq('source', fSource);
  if (fQuality) q = q.eq('quality', fQuality);
  if (fFrom) q = q.gte('conflict_day', fFrom);
  if (fTo) q = q.lte('conflict_day', fTo);
  const from = (page - 1) * PAGE_SIZE;

  const [listRes, coverage, countryRes] = await Promise.all([
    q
      .order('conflict_day', { ascending: false })
      .order('report_type', { ascending: true })
      .range(from, from + PAGE_SIZE - 1),
    loadCoverage(adminClient),
    adminClient
      .from('country_reports')
      .select('country_code, country_name, nai_score, nai_category, content_json, updated_at, conflict_day')
      .order('country_code', { ascending: true })
      .range(0, 999),
  ]);

  const rows = (listRes.data ?? []) as BriefingRow[];
  const matchCount = listRes.count ?? rows.length;
  const totalPages = Math.max(1, Math.ceil(matchCount / PAGE_SIZE));
  const countries = (countryRes.data ?? []) as CountryReportRow[];

  // Summary strip — computed from the data, calendar day from the DAY LOCK helper.
  const dayList = [...coverage.days].sort((a, b) => b - a);
  const latestDay = dayList.length ? dayList[0] : null;
  let missing = 0;
  for (let d = 1; d <= currentDay; d++) if (!coverage.days.has(d)) missing++;
  const aheadDays = dayList.filter((d) => d > currentDay).length;

  // Group the current page's rows by day (rows are already ordered day desc).
  const groups: { day: number; rows: BriefingRow[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.day === r.conflict_day) last.rows.push(r);
    else groups.push({ day: r.conflict_day, rows: [r] });
  }

  const stat = (label: string, value: string, note?: string) => (
    <div className="border rounded-sm p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="font-mono text-[10px] uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '1px' }}>{label}</div>
      <div className="font-mono text-lg" style={{ color: 'var(--text-primary)' }}>{value}</div>
      {note && <div className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{note}</div>}
    </div>
  );

  return (
    <div className="p-6 max-w-6xl space-y-8">
      <h1 className="font-mono text-sm uppercase" style={{ color: 'var(--text-muted)' }}>Reports</h1>

      {/* Summary strip */}
      <section aria-label="Coverage summary">
        {coverage.error ? (
          <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>
            Could not compute coverage: {coverage.error}
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stat('Total briefings', String(coverage.total), coverage.truncated ? `at least — scan capped at ${STATS_PAGE * STATS_MAX_PAGES} rows` : undefined)}
            {stat('Distinct days covered', String(coverage.days.size))}
            {stat('Latest day', latestDay ? `Day ${latestDay}` : '—', latestDay ? formatConflictDayShort(latestDay) : 'no briefings')}
            {stat(`Days missing (1..${currentDay})`, String(missing), aheadDays ? `${aheadDays} day(s) stamped after today` : `calendar today = Day ${currentDay}`)}
          </div>
        )}
      </section>

      {/* Daily briefings */}
      <section aria-label="Daily briefings" className="space-y-4">
        <h2 className="font-mono text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '1px' }}>Daily briefings</h2>

        <form method="get" action="/admin/reports" className="flex flex-wrap gap-2 items-end">
          <label className="font-mono text-[10px] uppercase flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            Type
            <select name="type" defaultValue={fType} className={inputCls} style={inputStyle}>
              <option value="">All</option>
              {REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="font-mono text-[10px] uppercase flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            Source
            <select name="source" defaultValue={fSource} className={inputCls} style={inputStyle}>
              <option value="">All</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="font-mono text-[10px] uppercase flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            Quality
            <select name="quality" defaultValue={fQuality} className={inputCls} style={inputStyle}>
              <option value="">All</option>
              {QUALITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="font-mono text-[10px] uppercase flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            Day from
            <input type="number" min={1} name="from" defaultValue={fFrom ?? ''} className={`${inputCls} w-20`} style={inputStyle} />
          </label>
          <label className="font-mono text-[10px] uppercase flex flex-col gap-1" style={{ color: 'var(--text-muted)' }}>
            Day to
            <input type="number" min={1} name="to" defaultValue={fTo ?? ''} className={`${inputCls} w-20`} style={inputStyle} />
          </label>
          <button type="submit" className={`${inputCls} uppercase`} style={inputStyle}>Apply</button>
          {anyFilter && (
            <Link href="/admin/reports" className="font-mono text-xs py-2 underline" style={{ color: 'var(--text-muted)' }}>Clear</Link>
          )}
        </form>

        {listRes.error ? (
          <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>Could not load briefings: {listRes.error.message}</p>
        ) : rows.length === 0 ? (
          <p className="font-mono text-xs py-6" style={{ color: 'var(--text-muted)' }}>
            {matchCount > 0
              ? `No briefings on page ${page} — this filter has ${matchCount} result(s) over ${totalPages} page(s).`
              : anyFilter
                ? 'No briefings match these filters.'
                : 'No briefings exist in daily_briefings.'}
          </p>
        ) : (
          <>
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {matchCount} briefing(s){anyFilter ? ' matching filters' : ''} — page {page} of {totalPages}
            </p>
            <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
                    <th className="text-left p-2">Day</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Title</th>
                    <th className="text-left p-2">Source</th>
                    <th className="text-left p-2">Quality</th>
                    <th className="text-left p-2">Generated</th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.day} style={{ color: 'var(--text-secondary)' }}>
                    {g.rows.map((r, i) => {
                      const href = `/briefings/${r.conflict_day}/${encodeURIComponent(r.report_type)}`;
                      return (
                        <tr key={`${r.conflict_day}-${r.report_type}-${r.country_code ?? ''}-${i}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="p-2">{i === 0 ? `Day ${g.day}` : ''}</td>
                          <td className="p-2">{i === 0 ? formatConflictDayShort(g.day) : ''}</td>
                          <td className="p-2">{r.report_type}{r.country_code ? ` · ${r.country_code}` : ''}</td>
                          <td className="p-2">
                            <Link href={href} className="underline" style={{ color: 'var(--accent-gold)' }}>{r.title || `(untitled) Day ${g.day} / ${r.report_type}`}</Link>
                          </td>
                          <td className="p-2">{r.source ?? '—'}</td>
                          <td className="p-2">{r.quality ?? '—'}</td>
                          <td className="p-2">{fmtTs(r.generated_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
            {totalPages > 1 && (
              <nav className="flex gap-4 font-mono text-xs" aria-label="Pagination">
                {page > 1 ? (
                  <Link href={pageHref(filterParams, page - 1)} style={{ color: 'var(--accent-gold)' }}>← Newer</Link>
                ) : <span style={{ color: 'var(--text-muted)' }}>← Newer</span>}
                {page < totalPages ? (
                  <Link href={pageHref(filterParams, page + 1)} style={{ color: 'var(--accent-gold)' }}>Older →</Link>
                ) : <span style={{ color: 'var(--text-muted)' }}>Older →</span>}
              </nav>
            )}
          </>
        )}
      </section>

      {/* Country reports — every row, never filtered by day */}
      <section aria-label="Country reports" className="space-y-4">
        <h2 className="font-mono text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '1px' }}>
          Country reports ({countries.length})
        </h2>
        {countryRes.error ? (
          <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>Could not load country reports: {countryRes.error.message}</p>
        ) : countries.length === 0 ? (
          <p className="font-mono text-xs py-6" style={{ color: 'var(--text-muted)' }}>No country reports exist in country_reports.</p>
        ) : (
          <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full font-mono text-xs">
              <thead>
                <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
                  <th className="text-left p-2">Country</th>
                  <th className="text-left p-2">NAI score</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-left p-2">As of</th>
                  <th className="text-left p-2">Updated</th>
                  <th className="text-left p-2">Content</th>
                </tr>
              </thead>
              <tbody style={{ color: 'var(--text-secondary)' }}>
                {countries.map((c) => {
                  const hasContent =
                    c.content_json != null &&
                    (typeof c.content_json === 'object' ? Object.keys(c.content_json as object).length > 0 : true);
                  return (
                    <tr key={c.country_code} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="p-2">{c.country_name || c.country_code} <span style={{ color: 'var(--text-muted)' }}>({c.country_code})</span></td>
                      <td className="p-2">{c.nai_score ?? '—'}</td>
                      <td className="p-2">{c.nai_category ?? '—'}</td>
                      <td className="p-2"><DataAsOf section="COUNTRY" latestDay={c.conflict_day} currentDay={currentDay} /></td>
                      <td className="p-2">{fmtTs(c.updated_at)}</td>
                      <td className="p-2">
                        {hasContent ? <span style={{ color: 'var(--accent-green)' }}>✓ present</span> : <span style={{ color: 'var(--text-muted)' }}>✗ empty content_json</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
