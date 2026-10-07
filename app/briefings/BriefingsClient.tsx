'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { createClient } from '@/lib/supabase/client';
import { DataAsOf } from '@/components/ui/DataAsOf';

interface BriefingMeta {
  conflict_day: number;
  report_type: string;
  title: string;
  lead: string | null;
  cover_stats: Record<string, unknown> | null;
  quality: string;
  source: string;
  generated_at: string;
  period_start_day?: number | null;
  period_end_day?: number | null;
}

const REPORT_ORDER = ['general', 'general_weekly', 'horn', 'egypt', 'uae', 'eschatology', 'business'];

const REPORT_META: Record<string, {
  label: string;
  emoji: string;
  color: string;
  readTime: string;
}> = {
  general: { label: 'GENERAL INTELLIGENCE BRIEF', emoji: '\u25C6', color: 'var(--accent-gold)', readTime: '30\u201345 min' },
  general_weekly: { label: 'WEEKLY GENERAL DIGEST', emoji: '\u25C7', color: 'var(--accent-gold)', readTime: '20\u201330 min' },
  horn:    { label: 'HORN OF AFRICA & RED SEA',      emoji: '\u25CD', color: '#14b8a6', readTime: '12\u201318 min' },
  egypt:   { label: 'EGYPT COUNTRY BRIEF',          emoji: '\uD83C\uDDEA\uD83C\uDDEC', color: '#10b981', readTime: '15\u201320 min' },
  uae:     { label: 'UAE COUNTRY BRIEF',             emoji: '\uD83C\uDDE6\uD83C\uDDEA', color: '#3b82f6', readTime: '12\u201318 min' },
  eschatology: { label: 'ESCHATOLOGY & GEOPOLITICS', emoji: '\u25CE', color: '#a855f7', readTime: '10\u201315 min' },
  business: { label: 'BUSINESS OPPORTUNITIES',       emoji: '\u25C8', color: '#f59e0b', readTime: '10\u201315 min' },
};

/** "Days 36\u201342" for a weekly digest. Uses period_start_day/period_end_day when the row has them
 *  (added by the report-registry migration); falls back to the legacy
 *  "Retrospective Digest - Days a-b" title; returns null when neither is available. */
function periodLabel(b: { title?: string | null; period_start_day?: number | null; period_end_day?: number | null }): string | null {
  if (b.period_start_day != null && b.period_end_day != null) {
    return `Days ${b.period_start_day}\u2013${b.period_end_day}`;
  }
  const m = /Days\s+(\d+)\s*[-\u2013]\s*(\d+)/.exec(b.title ?? '');
  return m ? `Days ${m[1]}\u2013${m[2]}` : null;
}

function dayLabel(day: number): string {
  const date = new Date(2026, 1, 28); // Feb 28, 2026 = Day 1
  date.setDate(date.getDate() + day - 1);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** What exists for one conflict day (from daily_briefings' own rows). */
export interface DayAvailability {
  day: number;
  types: string[];
  /** For a general_weekly row: the period it digests. */
  digestFrom: number | null;
  digestTo: number | null;
}

interface BriefingsClientProps {
  initialBriefings: BriefingMeta[];
  /** Day initially displayed (calendar day, or latest available day when today has none). */
  conflictDay: number;
  /** Calendar day (DAY LOCK). */
  currentDay: number;
  /** MAX(conflict_day) of daily_briefings. */
  latestBriefingDay: number | null;
  /** Availability per day that has at least one brief. */
  availability: DayAvailability[];
}

export default function BriefingsClient({
  initialBriefings,
  conflictDay,
  currentDay,
  latestBriefingDay,
  availability,
}: BriefingsClientProps) {
  const [selectedDay, setSelectedDay] = useState<number>(conflictDay);
  const [briefings, setBriefings] = useState<BriefingMeta[]>(initialBriefings);
  const [loading, setLoading] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [dayInput, setDayInput] = useState<string>(String(conflictDay));

  const availByDay = useMemo(() => new Map(availability.map((a) => [a.day, a])), [availability]);
  const maxDay = Math.max(currentDay, latestBriefingDay ?? 0, 1);

  function goToDay(raw: number) {
    if (!Number.isFinite(raw)) return;
    const d = Math.min(maxDay, Math.max(1, Math.trunc(raw)));
    setSelectedDay(d);
    setDayInput(String(d));
  }

  // Re-fetch when user selects a different day than the initial one
  useEffect(() => {
    if (selectedDay === conflictDay) {
      // Already have the data from the server
      setBriefings(initialBriefings);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('daily_briefings')
          .select('conflict_day, report_type, title, lead, cover_stats, quality, source, generated_at, period_start_day, period_end_day')
          .eq('conflict_day', selectedDay)
          .in('report_type', REPORT_ORDER);
        if (cancelled) return;
        if (error) setBriefings([]);
        else setBriefings((data as BriefingMeta[]) ?? []);
      } catch {
        if (!cancelled) setBriefings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDay, conflictDay, initialBriefings]);

  const day = selectedDay;
  const byType = Object.fromEntries(briefings.map(b => [b.report_type, b]));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="DAILY INTELLIGENCE BRIEFINGS"
        description="Structured reports for every conflict day from Day 1: a general brief plus Horn of Africa, Egypt, UAE, eschatology and business briefs (not every type exists for every day), and weekly digests that cover the days between full briefs. From Day 221 onward each paragraph lists its sources as links, state or party outlets are flagged, and every brief ends with a deduplicated Sources list. Earlier briefs and reconstructed digests predate per-paragraph sourcing and carry no citations."
        note="Reports marked PLATFORM are editorial-grade. Reports marked AUTO are generated from the platform's daily analysis database. Historical reports marked RECONSTRUCTED are regenerated from archived DB data."
      />

      {/* Section freshness: daily_briefings' own latest day vs calendar day */}
      <DataAsOf section="BRIEFINGS" latestDay={latestBriefingDay} currentDay={currentDay} className="mb-4" />

      {/* Day navigator — every day 1..today is reachable */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3 font-mono text-xs">
          <button type="button" onClick={() => goToDay(selectedDay - 1)} disabled={selectedDay <= 1}
                  aria-label="Previous day"
                  className="px-3 py-1.5 border disabled:opacity-30"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', borderRadius: 2 }}>
            {'\u25C0'} PREV
          </button>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); goToDay(Number(dayInput)); }}
          >
            <label htmlFor="briefing-day-input" style={{ color: 'var(--text-muted)' }}>DAY</label>
            <input
              id="briefing-day-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxDay}
              value={dayInput}
              onChange={(e) => setDayInput(e.target.value)}
              className="w-20 px-2 py-1.5 border bg-transparent"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', borderRadius: 2 }}
            />
            <button type="submit" className="px-3 py-1.5 border"
                    style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)', borderRadius: 2 }}>
              GO
            </button>
          </form>
          <button type="button" onClick={() => goToDay(selectedDay + 1)} disabled={selectedDay >= maxDay}
                  aria-label="Next day"
                  className="px-3 py-1.5 border disabled:opacity-30"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', borderRadius: 2 }}>
            NEXT {'\u25B6'}
          </button>
          {latestBriefingDay != null && (
            <button type="button" onClick={() => goToDay(latestBriefingDay)}
                    className="px-3 py-1.5 border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', borderRadius: 2 }}>
              LATEST (DAY {latestBriefingDay})
            </button>
          )}
          <button type="button" onClick={() => setGridOpen((v) => !v)} aria-expanded={gridOpen}
                  className="px-3 py-1.5 border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', borderRadius: 2 }}>
            {gridOpen ? 'HIDE' : 'ALL'} DAYS 1{'\u2013'}{maxDay}
          </button>
        </div>

        {/* Quick strip: the most recent days that have briefs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          <span className="font-mono text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>RECENT</span>
          {availability.slice(0, 15).map((a) => (
            <DayChip key={a.day} d={a.day} selected={a.day === selectedDay} kind={chipKind(a)} onPick={goToDay} />
          ))}
        </div>

        {gridOpen && (
          <div className="mt-3 p-3 border" style={{ borderColor: 'var(--border)', borderRadius: 2 }}>
            <p className="font-mono mb-2" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--accent-gold)' }}>{'\u25A0'}</span> briefs{' '}
              <span style={{ color: 'var(--accent-blue)' }}>{'\u25A0'}</span> weekly digest only{' '}
              <span>{'\u25A1'}</span> nothing published (covered by a digest if one spans it)
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-72 overflow-y-auto" data-testid="briefing-day-grid">
              {Array.from({ length: maxDay }, (_, i) => maxDay - i).map((d) => (
                <DayChip key={d} d={d} selected={d === selectedDay} kind={chipKind(availByDay.get(d))} onPick={goToDay} compact />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Day header */}
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="font-display text-2xl"
            style={{ color: 'var(--text-primary)' }}>
          DAY {day} BRIEFINGS
        </h1>
        <span className="font-mono text-xs"
              style={{ color: 'var(--text-muted)' }}>
          {dayLabel(day)}
        </span>
        {briefings.length === 0 && !loading && (
          <span className="font-mono text-xs"
                style={{ color: 'var(--accent-orange)' }}>
            NO BRIEFINGS FOR THIS DAY
          </span>
        )}
      </div>

      {briefings.length === 0 && !loading && (() => {
        const cover = availability.find(
          (a) => a.digestFrom != null && a.digestTo != null && day >= a.digestFrom && day <= a.digestTo
        );
        return cover ? (
          <p className="font-mono text-xs mb-6" style={{ color: 'var(--text-secondary)' }}>
            Day {day} is covered by the weekly digest for Days {cover.digestFrom}{'\u2013'}{cover.digestTo}:{' '}
            <Link href={`/briefings/${cover.day}/general_weekly`} style={{ color: 'var(--accent-gold)' }}>
              read the digest {'\u2192'}
            </Link>
          </p>
        ) : null;
      })()}

      {loading && (
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>{'\u2588'}</span>
        </p>
      )}

      {/* Report grid — 2 cols on mobile, 3 on desktop */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {REPORT_ORDER.filter(type => type !== 'general_weekly' || byType[type]).map((type, i) => {
            const b = byType[type];
            const meta = REPORT_META[type];
            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.06 }}
              >
                {b ? (
                  <Link href={`/briefings/${day}/${type}`}>
                    <OsintCard className="block h-full hover:border-border-bright active:scale-[0.98] transition-transform"
                               style={{ minHeight: '180px' }}>
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-base mr-2">{meta.emoji}</span>
                          <span className="font-mono text-xs uppercase"
                                style={{ color: meta.color }}>
                            {meta.label}
                          </span>
                          {type === 'general_weekly' && periodLabel(b) && (
                            <span className="font-mono text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                              {periodLabel(b)}
                            </span>
                          )}
                        </div>
                        <QualityBadge quality={b.quality} />
                      </div>

                      {/* Lead text */}
                      {b.lead && (
                        <p className="font-body text-xs leading-relaxed mb-3 line-clamp-3"
                           style={{ color: 'var(--text-secondary)' }}>
                          {b.lead}
                        </p>
                      )}

                      {/* Cover stats */}
                      {b.cover_stats && (
                        <CoverStats stats={b.cover_stats} type={type} />
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-3 pt-3"
                           style={{ borderTop: '1px solid var(--border)' }}>
                        <span className="font-mono text-xs"
                              style={{ color: 'var(--text-muted)' }}>
                          {meta.readTime}
                        </span>
                        <span className="font-mono text-xs"
                              style={{ color: meta.color }}>
                          READ {'\u2192'}
                        </span>
                      </div>
                    </OsintCard>
                  </Link>
                ) : (
                  <OsintCard className="h-full opacity-40"
                             style={{ minHeight: '180px' }}>
                    <span className="text-base mr-2">{meta.emoji}</span>
                    <span className="font-mono text-xs uppercase"
                          style={{ color: 'var(--text-muted)' }}>
                      {meta.label}
                    </span>
                    <p className="font-mono text-xs mt-4 redacted">
                      NOT AVAILABLE {'\u2014'} DAY {day}
                    </p>
                  </OsintCard>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ChipKind = 'briefs' | 'digest' | 'none';

function chipKind(a: DayAvailability | undefined): ChipKind {
  if (!a || a.types.length === 0) return 'none';
  return a.types.some((t) => t !== 'general_weekly') ? 'briefs' : 'digest';
}

function DayChip({
  d, selected, kind, onPick, compact,
}: { d: number; selected: boolean; kind: ChipKind; onPick: (d: number) => void; compact?: boolean }) {
  const accent = kind === 'briefs' ? 'var(--accent-gold)' : kind === 'digest' ? 'var(--accent-blue)' : 'var(--text-muted)';
  return (
    <button
      type="button"
      onClick={() => onPick(d)}
      aria-pressed={selected}
      aria-label={`Day ${d}${kind === 'none' ? ' (no briefs)' : kind === 'digest' ? ' (weekly digest)' : ''}`}
      className="shrink-0 font-mono text-xs border transition-colors"
      style={{
        borderColor: selected ? 'var(--accent-gold)' : kind === 'none' ? 'var(--border)' : accent,
        color: selected ? 'var(--accent-gold)' : accent,
        background: selected ? 'rgba(232,197,71,0.08)' : 'transparent',
        opacity: kind === 'none' && !selected ? 0.55 : 1,
        minWidth: compact ? '44px' : '52px',
        padding: compact ? '4px 6px' : '6px 12px',
        borderRadius: '2px',
      }}
    >
      <div>{d}</div>
      {!compact && <div style={{ fontSize: '11px', opacity: 0.7 }}>{dayLabel(d)}</div>}
    </button>
  );
}

function QualityBadge({ quality }: { quality: string }) {
  const map: Record<string, { label: string; color: string }> = {
    full:          { label: 'PLATFORM', color: 'var(--accent-gold)' },
    auto:          { label: 'AUTO', color: 'var(--accent-blue)' },
    reconstructed: { label: 'RECONSTRUCTED', color: 'var(--text-muted)' },
    community:     { label: 'COMMUNITY', color: '#a855f7' },
  };
  const q = map[quality] ?? { label: quality.toUpperCase(), color: 'var(--text-muted)' };
  return (
    <span className="font-mono shrink-0"
          style={{ fontSize: '11px', letterSpacing: '1px', color: q.color,
                   border: `1px solid ${q.color}`, padding: '1px 4px' }}>
      {q.label}
    </span>
  );
}

function CoverStats({ stats, type }: { stats: Record<string, unknown>; type: string }) {
  const entries: { label: string; value: string; alert?: boolean }[] = [];

  if (type === 'general') {
    if (stats.regional_dead) entries.push({ label: 'REGIONAL DEAD', value: `${stats.regional_dead}+`, alert: true });
    if (stats.brent_oil) entries.push({ label: 'BRENT', value: `$${stats.brent_oil}` });
    if (stats.iran_blackout_hours) entries.push({ label: 'BLACKOUT', value: `${stats.iran_blackout_hours}h` });
  } else if (type === 'egypt') {
    if (stats.egp_usd) entries.push({ label: 'EGP/USD', value: `${stats.egp_usd}+`, alert: true });
    if (stats.suez_drop_pct) entries.push({ label: 'SUEZ DROP', value: `-${stats.suez_drop_pct}%` });
  } else if (type === 'uae') {
    if (stats.ballistic_tracked) entries.push({ label: 'BALLISTIC', value: `${stats.ballistic_tracked}` });
    if (stats.intercept_rate_pct) entries.push({ label: 'INTERCEPT', value: `${stats.intercept_rate_pct}%` });
    if (stats.civilian_kia) entries.push({ label: 'KIA', value: `${stats.civilian_kia}`, alert: true });
  } else if (type === 'business') {
    if (stats.brent_oil) entries.push({ label: 'BRENT', value: `$${stats.brent_oil}` });
    if (stats.oil_change_pct) entries.push({ label: 'SURGE', value: `+${stats.oil_change_pct}%` });
    if (stats.window_status) entries.push({ label: 'WINDOW', value: String(stats.window_status).split(' ')[0] });
  } else if (type === 'eschatology') {
    if (stats.mrff_complaints) entries.push({ label: 'COMPLAINTS', value: `${stats.mrff_complaints}+` });
    if (stats.units_affected) entries.push({ label: 'UNITS', value: `${stats.units_affected}+` });
    if (stats.faiths_invoking_prophecy) entries.push({ label: 'FAITHS', value: String(stats.faiths_invoking_prophecy) });
  }

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {entries.map((e, i) => (
        <div key={i}>
          <div className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '1px' }}>
            {e.label}
          </div>
          <div className="font-display text-sm"
               style={{ color: e.alert ? 'var(--accent-red)' : 'var(--accent-gold)' }}>
            {e.value}
          </div>
        </div>
      ))}
    </div>
  );
}
