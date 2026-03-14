'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { useConflictDay } from '@/hooks/useConflictDay';
import { createClient } from '@/lib/supabase/client';

interface BriefingMeta {
  conflict_day: number;
  report_type: string;
  title: string;
  lead: string | null;
  cover_stats: Record<string, unknown> | null;
  quality: string;
  source: string;
  generated_at: string;
}

const REPORT_ORDER = ['general', 'egypt', 'uae', 'eschatology', 'business'];

const REPORT_META: Record<string, {
  label: string;
  emoji: string;
  color: string;
  readTime: string;
}> = {
  general: { label: 'GENERAL INTELLIGENCE BRIEF', emoji: '◆', color: 'var(--accent-gold)', readTime: '30–45 min' },
  egypt:   { label: 'EGYPT COUNTRY BRIEF',          emoji: '🇪🇬', color: '#10b981', readTime: '15–20 min' },
  uae:     { label: 'UAE COUNTRY BRIEF',             emoji: '🇦🇪', color: '#3b82f6', readTime: '12–18 min' },
  eschatology: { label: 'ESCHATOLOGY & GEOPOLITICS', emoji: '◎', color: '#a855f7', readTime: '10–15 min' },
  business: { label: 'BUSINESS OPPORTUNITIES',       emoji: '◈', color: '#f59e0b', readTime: '10–15 min' },
};

function dayLabel(day: number): string {
  const date = new Date(2026, 1, 28); // Feb 28, 2026 = Day 1
  date.setDate(date.getDate() + day - 1);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function BriefingsPage() {
  const latestDay = useConflictDay();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [briefings, setBriefings] = useState<BriefingMeta[]>([]);
  const [availableDays, setAvailableDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Load available days
  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from('daily_briefings')
        .select('conflict_day')
        .order('conflict_day', { ascending: false });
      if (data) {
        const days = [...new Set(data.map(r => r.conflict_day))] as number[];
        setAvailableDays(days);
        if (days.length > 0) setSelectedDay(days[0]);
      }
    })();
  }, []);

  // Load briefings for selected day
  useEffect(() => {
    if (!selectedDay) return;
    const supabase = createClient();
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from('daily_briefings')
        .select('conflict_day, report_type, title, lead, cover_stats, quality, source, generated_at')
        .eq('conflict_day', selectedDay)
        .in('report_type', REPORT_ORDER);
      setLoading(false);
      setBriefings((data as BriefingMeta[]) ?? []);
    })();
  }, [selectedDay]);

  const day = selectedDay ?? latestDay ?? 15;
  const byType = Object.fromEntries(briefings.map(b => [b.report_type, b]));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="DAILY INTELLIGENCE BRIEFINGS"
        description="Five structured reports published each conflict day covering all parties, all regions, and all analytical dimensions. Reports are generated from verified open-source intelligence. Source citations are embedded — tap any footnote to view the originating article."
        note="Reports marked PLATFORM are editorial-grade. Reports marked AUTO are generated from the platform's daily analysis database. Historical reports marked RECONSTRUCTED are regenerated from archived DB data."
      />

      {/* Day navigator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2"
           style={{ scrollbarWidth: 'none' }}>
        <span className="font-mono text-xs shrink-0"
              style={{ color: 'var(--text-muted)' }}>DAY</span>
        {availableDays.slice(0, 15).map(d => (
          <button
            key={d}
            onClick={() => setSelectedDay(d)}
            className="shrink-0 font-mono text-xs px-3 py-1.5 border transition-colors"
            style={{
              borderColor: d === selectedDay ? 'var(--accent-gold)' : 'var(--border)',
              color: d === selectedDay ? 'var(--accent-gold)' : 'var(--text-muted)',
              background: d === selectedDay ? 'rgba(232,197,71,0.08)' : 'transparent',
              minWidth: '52px',
              borderRadius: '2px',
            }}
          >
            <div>{d}</div>
            <div style={{ fontSize: '8px', opacity: 0.7 }}>{dayLabel(d)}</div>
          </button>
        ))}
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

      {loading && (
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
        </p>
      )}

      {/* Report grid — 2 cols on mobile, 3 on desktop */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {REPORT_ORDER.map((type, i) => {
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
                          READ →
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
                      NOT AVAILABLE — DAY {day}
                    </p>
                  </OsintCard>
                )}
              </motion.div>
            );
          })}

          {/* + Generate custom country card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.35 }}
          >
            <Link href="/briefings/generate">
              <OsintCard className="block h-full hover:border-border-bright active:scale-[0.98] transition-transform border-dashed"
                         style={{ minHeight: '180px' }}>
                <span className="font-mono text-xs uppercase"
                      style={{ color: 'var(--text-muted)' }}>
                  + ANY COUNTRY REPORT
                </span>
                <p className="font-body text-xs mt-3 leading-relaxed"
                   style={{ color: 'var(--text-muted)' }}>
                  Generate an intelligence brief for any country using your Anthropic API key. Reports are saved to the platform for all users.
                </p>
                <div className="flex items-center justify-between mt-4 pt-3"
                     style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="font-mono text-xs"
                        style={{ color: 'var(--text-muted)' }}>
                    ~$0.04 per report
                  </span>
                  <span className="font-mono text-xs"
                        style={{ color: 'var(--accent-gold)' }}>
                    GENERATE →
                  </span>
                </div>
              </OsintCard>
            </Link>
          </motion.div>
        </div>
      )}
    </div>
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
          style={{ fontSize: '8px', letterSpacing: '1px', color: q.color,
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
          <div className="font-mono" style={{ fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '1px' }}>
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
