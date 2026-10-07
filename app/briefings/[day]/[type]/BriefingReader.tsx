'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { NaiScoreBadge } from '@/components/NaiScoreBadge';
import { createClient } from '@/lib/supabase/client';
import { formatConflictDayDate } from '@/lib/conflict-calendar';
import {
  collectBriefSources,
  hostOf,
  paragraphSources,
  perspectiveLabel,
  safeHttpUrl,
  sourceLookupKey,
  type BriefSource,
} from '@/lib/briefing-sources';
import type { Article } from '@/types/supabase';

interface Paragraph {
  text: string;
  source_ids?: string[];
  /** Linked citations: [{name,url,published_at,tier,party_source}]. Absent on legacy briefs. */
  sources?: unknown;
  perspective?: string;
}

interface Subsection {
  id: string;
  heading: string;
  nai_category?: string;
  nai_expressed?: number;
  nai_latent?: number;
  paragraphs: Paragraph[];
}

interface Section {
  id: string;
  heading: string;
  type: string;
  subsections: Subsection[];
}

interface Briefing {
  id: string;
  conflict_day: number;
  report_type: string;
  title: string;
  lead: string | null;
  cover_stats: Record<string, unknown> | null;
  sections: Section[];
  source_ids: string[] | null;
  source: string;
  quality: string;
  generated_at: string;
  period_start_day?: number | null;
  period_end_day?: number | null;
}

const PERSPECTIVE_COLORS: Record<string, string> = {
  us_israel:  '#3b82f6',
  iran_irgc:  '#22c55e',
  gulf:       '#f59e0b',
  resistance: '#ef4444',
  neutral:    'var(--text-muted)',
  both:       '#a855f7',
};

const TYPE_LABELS: Record<string, string> = {
  general:     'GENERAL INTELLIGENCE BRIEF',
  general_weekly: 'WEEKLY GENERAL DIGEST',
  horn:        'HORN OF AFRICA & RED SEA',
  egypt:       'EGYPT COUNTRY BRIEF',
  uae:         'UAE COUNTRY BRIEF',
  eschatology: 'ESCHATOLOGY & GEOPOLITICS',
  business:    'BUSINESS OPPORTUNITIES',
};

function dayToDate(day: number): string {
  return formatConflictDayDate(day);
}

interface BriefingReaderProps {
  briefing: Briefing;
  day: number;
  type: string;
}

export default function BriefingReader({ briefing, day, type }: BriefingReaderProps) {
  const [readProgress, setReadProgress] = useState(0);
  const [readSections, setReadSections] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [activeSource, setActiveSource] = useState<{
    articleId: string;
    article: Article | null;
    loading: boolean;
  } | null>(null);

  // Restore reading progress from localStorage
  useEffect(() => {
    const key = `briefing-progress-${day}-${type}`;
    const saved = localStorage.getItem(key);
    if (saved) setReadSections(new Set(JSON.parse(saved)));
  }, [day, type]);

  // Track reading progress on scroll
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const id = entry.target.getAttribute('data-section-id');
            if (id) {
              setReadSections(prev => {
                const next = new Set(prev).add(id);
                localStorage.setItem(
                  `briefing-progress-${day}-${type}`,
                  JSON.stringify([...next])
                );
                return next;
              });
            }
          }
        });
      },
      { threshold: 0.5 }
    );
    const sections = contentRef.current.querySelectorAll('[data-section-id]');
    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, [briefing, day, type]);

  // Calculate scroll progress
  useEffect(() => {
    const handleScroll = () => {
      const el = document.documentElement;
      const progress = (el.scrollTop) / (el.scrollHeight - el.clientHeight);
      setReadProgress(Math.min(100, Math.round(progress * 100)));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Load source article on tap
  async function loadSource(articleId: string) {
    if (activeSource?.articleId === articleId) {
      setActiveSource(null);
      return;
    }
    setActiveSource({ articleId, article: null, loading: true });
    const supabase = createClient();
    const { data } = await supabase
      .from('articles')
      .select('id,title,source_name,url,published_at,summary,sentiment,source_type')
      .eq('id', articleId)
      .single();
    setActiveSource({ articleId, article: data as Article | null, loading: false });
  }

  const briefSources = useMemo(() => collectBriefSources(briefing.sections), [briefing.sections]);

  const sections = Array.isArray(briefing.sections) ? briefing.sections : [];
  const totalSections = sections.length;
  const sectionProgress = totalSections > 0
    ? Math.round((readSections.size / totalSections) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      {/* Sticky progress header */}
      <div className="sticky top-[44px] z-40 -mx-4 px-4 py-2 mb-6"
           style={{ background: 'rgba(7,10,15,0.92)', backdropFilter: 'blur(12px)',
                    borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-4 mb-1.5">
          <Link href="/briefings"
                className="font-mono text-xs shrink-0"
                style={{ color: 'var(--accent-gold)' }}>
            ← BRIEFINGS
          </Link>
          <span className="font-mono text-xs text-center truncate"
                style={{ color: 'var(--text-muted)' }}>
            DAY {day} · {TYPE_LABELS[type] ?? type.toUpperCase()}
            {type === 'general_weekly' && briefing.period_start_day != null && briefing.period_end_day != null
              ? ` · DAYS ${briefing.period_start_day}\u2013${briefing.period_end_day}`
              : ''}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono"
                  style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {sectionProgress}%
            </span>
            <button onClick={() => setTocOpen(v => !v)}
                    className="font-mono text-xs px-2 py-1 border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)',
                             fontSize: '11px', letterSpacing: '1px' }}>
              ☰ CONTENTS
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-0.5 rounded-full"
             style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all duration-300"
               style={{ width: `${readProgress}%`,
                        background: 'var(--accent-gold)' }} />
        </div>
      </div>

      {/* Date + quality badge */}
      <div className="flex items-center gap-3 mb-2">
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {dayToDate(day)}
        </span>
        <span className="font-mono"
              style={{ fontSize: '11px', letterSpacing: '1px',
                       color: briefing.quality === 'full' ? 'var(--accent-gold)' : 'var(--text-muted)',
                       border: `1px solid ${briefing.quality === 'full' ? 'var(--accent-gold)' : 'var(--border)'}`,
                       padding: '1px 5px' }}>
          {briefing.quality === 'full' ? 'PLATFORM' :
           briefing.quality === 'auto' ? 'AUTO-GENERATED' :
           briefing.quality === 'reconstructed' ? 'RECONSTRUCTED' : briefing.quality.toUpperCase()}
        </span>
      </div>

      {/* Title */}
      <h1 className="font-display text-2xl sm:text-3xl mb-3"
          style={{ color: 'var(--text-primary)' }}>
        {briefing.title}
      </h1>

      {/* Lead */}
      {briefing.lead && (
        <p className="font-body text-sm leading-relaxed mb-6 pb-6"
           style={{ color: 'var(--text-secondary)',
                    borderBottom: '1px solid var(--border)' }}>
          {briefing.lead}
        </p>
      )}

      {/* TOC slide panel */}
      <AnimatePresence>
        {tocOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <OsintCard>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs" style={{ color: 'var(--accent-gold)' }}>
                  TABLE OF CONTENTS
                </span>
                <button onClick={() => setTocOpen(false)}
                        className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  ✕
                </button>
              </div>
              <ul className="space-y-1">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}
                       onClick={() => setTocOpen(false)}
                       className="flex items-center gap-2 py-1 font-mono text-xs hover:opacity-100 transition-opacity"
                       style={{ color: readSections.has(s.id) ? 'var(--text-muted)' : 'var(--text-secondary)',
                                opacity: readSections.has(s.id) ? 0.6 : 1 }}>
                      <span style={{ color: readSections.has(s.id) ? 'var(--accent-green)' : 'var(--border-bright)' }}>
                        {readSections.has(s.id) ? '✓' : '○'}
                      </span>
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </OsintCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report sections */}
      <div ref={contentRef} className="space-y-8">
        {sections.map((section) => (
          <div key={section.id} id={section.id} data-section-id={section.id}>
            {/* Section heading */}
            <div className="flex items-center gap-3 mb-4 pb-2"
                 style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-display text-lg"
                  style={{ color: 'var(--accent-gold)' }}>
                {section.heading}
              </h2>
              {readSections.has(section.id) && (
                <span className="font-mono"
                      style={{ fontSize: '11px', color: 'var(--accent-green)', opacity: 0.7 }}>
                  ✓ READ
                </span>
              )}
            </div>

            {/* Subsections */}
            <div className="space-y-6">
              {(Array.isArray(section.subsections) ? section.subsections : []).map((sub) => (
                <SubsectionBlock
                  key={sub.id}
                  sub={sub}
                  activeSourceId={activeSource?.articleId ?? null}
                  activeArticle={activeSource}
                  onSourceTap={loadSource}
                  indexByKey={briefSources.indexByKey}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {type === 'business' && (
        <p className="font-mono mt-8" style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
          Market and business content is analysis of public information, not investment advice.
        </p>
      )}

      <SourcesList sources={briefSources.list} />

      {/* Bottom navigation */}
      <div className="flex items-center justify-between mt-10 pt-6"
           style={{ borderTop: '1px solid var(--border)' }}>
        <Link href="/briefings"
              className="font-mono text-xs"
              style={{ color: 'var(--accent-gold)' }}>
          ← ALL BRIEFINGS
        </Link>
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {sectionProgress}% read · DAY {day}
        </span>
      </div>

    </div>
  );
}

function SubsectionBlock({
  sub,
  activeSourceId,
  activeArticle,
  onSourceTap,
  indexByKey,
}: {
  sub: Subsection;
  activeSourceId: string | null;
  activeArticle: { articleId: string; article: Article | null; loading: boolean } | null;
  onSourceTap: (id: string) => void;
  indexByKey: Map<string, BriefSource>;
}) {
  return (
    <div className="pl-0 sm:pl-4"
         style={{ borderLeft: '2px solid var(--border)' }}>
      {/* Subsection heading */}
      <div className="flex flex-wrap items-center gap-2 mb-3 -ml-0 sm:-ml-4 pl-0 sm:pl-4">
        <h3 className="font-display text-base"
            style={{ color: 'var(--text-primary)' }}>
          {sub.heading}
        </h3>
        {sub.nai_category && (
          <NaiScoreBadge
            category={sub.nai_category}
            score={sub.nai_expressed}
          />
        )}
        {sub.nai_expressed != null && sub.nai_latent != null && (
          <span className="font-mono"
                style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            E:{sub.nai_expressed} / L:{sub.nai_latent}
          </span>
        )}
      </div>

      {/* Paragraphs */}
      <div className="space-y-3">
        {(Array.isArray(sub.paragraphs) ? sub.paragraphs : []).map((para, pi) => (
          <ParagraphBlock
            key={pi}
            para={para}
            activeSourceId={activeSourceId}
            activeArticle={activeArticle}
            onSourceTap={onSourceTap}
            indexByKey={indexByKey}
          />
        ))}
      </div>
    </div>
  );
}

function ParagraphBlock({
  para,
  activeSourceId,
  activeArticle,
  onSourceTap,
  indexByKey,
}: {
  para: Paragraph;
  activeSourceId: string | null;
  activeArticle: { articleId: string; article: Article | null; loading: boolean } | null;
  onSourceTap: (id: string) => void;
  indexByKey: Map<string, BriefSource>;
}) {
  const linked = paragraphSources(para.sources);
  const hasSources = para.source_ids && para.source_ids.length > 0;
  const perspColor = PERSPECTIVE_COLORS[para.perspective ?? 'neutral'] ?? 'var(--text-muted)';
  const perspLabel = perspectiveLabel(para.perspective);

  return (
    <div>
      {/* Perspective tag */}
      {para.perspective && para.perspective !== 'neutral' && perspLabel && (
        <div className="mb-1">
          <span className="font-mono"
                title="Which party's framing this paragraph reports"
                style={{ fontSize: '11px', letterSpacing: '1px', color: perspColor,
                         border: `1px solid ${perspColor}`, padding: '0 5px', borderRadius: '2px' }}>
            {perspLabel}
          </span>
        </div>
      )}

      {/* Paragraph text */}
      <p className="font-body text-sm leading-relaxed"
         style={{ color: 'var(--text-secondary)' }}>
        {para.text}
        {hasSources && para.source_ids!.map((sid, si) => (
          <button
            key={sid}
            onClick={() => onSourceTap(sid)}
            className="inline-block ml-0.5 align-super font-mono hover:opacity-100 transition-opacity"
            style={{
              fontSize: '11px',
              color: activeSourceId === sid ? 'var(--accent-gold)' : 'var(--accent-blue)',
              opacity: activeSourceId === sid ? 1 : 0.7,
              padding: '0 2px',
              border: `1px solid ${activeSourceId === sid ? 'var(--accent-gold)' : 'var(--accent-blue)'}`,
              lineHeight: 1.2,
              borderRadius: '2px',
            }}
            aria-label={`Source ${si + 1}`}
          >
            {si + 1}
          </button>
        ))}
      </p>

      {/* Linked citations (stored per paragraph) */}
      {linked.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono list-none p-0" style={{ fontSize: '11px' }}
            aria-label="Sources for this paragraph">
          {linked.map((src, i) => {
            const key = sourceLookupKey(src);
            const entry = key ? indexByKey.get(key) : undefined;
            const url = safeHttpUrl(src.url);
            const label = (typeof src.name === 'string' ? src.name.trim() : '') || hostOf(src.url) || 'Source';
            return (
              <li key={`${key ?? 'x'}-${i}`} className="inline-flex items-baseline gap-1">
                {entry && <span style={{ color: 'var(--text-muted)' }}>[{entry.n}]</span>}
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                     style={{ color: 'var(--accent-blue)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    {label} ↗
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                )}
                {src.party_source && <PartyMarker />}
              </li>
            );
          })}
        </ul>
      )}

      {/* Source expansion — inline below paragraph */}
      {hasSources && para.source_ids!.map((sid) => (
        activeSourceId === sid ? (
          <motion.div
            key={sid}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden"
          >
            <div className="p-3 rounded-sm"
                 style={{ background: 'rgba(30,144,255,0.06)',
                          border: '1px solid rgba(30,144,255,0.2)' }}>
              {activeArticle?.loading ? (
                <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  LOADING SOURCE...
                </p>
              ) : activeArticle?.article ? (
                <>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-mono text-xs"
                          style={{ color: 'var(--accent-blue)' }}>
                      {activeArticle.article.source_name ?? 'UNKNOWN SOURCE'}
                    </span>
                    <span className="font-mono shrink-0"
                          style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {activeArticle.article.published_at
                        ? new Date(activeArticle.article.published_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })
                        : '—'}
                    </span>
                  </div>
                  <p className="font-body text-xs leading-relaxed mb-2"
                     style={{ color: 'var(--text-secondary)' }}>
                    {activeArticle.article.title}
                  </p>
                  {activeArticle.article.url && (
                    <a href={activeArticle.article.url}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="font-mono text-xs"
                       style={{ color: 'var(--accent-gold)' }}>
                      VIEW ARTICLE ↗
                    </a>
                  )}
                </>
              ) : (
                <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  SOURCE NOT IN DATABASE
                </p>
              )}
            </div>
          </motion.div>
        ) : null
      ))}
    </div>
  );
}

function PartyMarker() {
  return (
    <span className="font-mono"
          title="State or party-affiliated outlet: reports that party's own position, not independent verification"
          style={{ fontSize: '10px', letterSpacing: '0.5px', color: 'var(--accent-orange)',
                   border: '1px solid var(--accent-orange)', padding: '0 4px', borderRadius: '2px' }}>
      STATE/PARTY SOURCE
    </span>
  );
}

function SourcesList({ sources }: { sources: BriefSource[] }) {
  return (
    <section id="sources" className="mt-10 pt-6" style={{ borderTop: '1px solid var(--border)' }}
             aria-labelledby="sources-heading">
      <h2 id="sources-heading" className="font-display text-lg mb-1" style={{ color: 'var(--accent-gold)' }}>
        SOURCES{sources.length > 0 ? ` (${sources.length})` : ''}
      </h2>
      {sources.length === 0 ? (
        <p className="font-mono text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          No source citations are recorded for this brief. Briefs published before Day 221, and reconstructed
          weekly digests, predate per-paragraph sourcing.
        </p>
      ) : (
        <>
          <p className="font-mono mb-4 leading-relaxed" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Every source cited in this brief, deduplicated by link. Numbers match the [n] markers under each paragraph.
            Sources flagged STATE/PARTY report a party&apos;s own position and are not independent verification.
          </p>
          <ol className="space-y-2 list-none p-0">
            {sources.map((src) => (
              <li key={src.key} id={`src-${src.n}`} className="font-mono text-xs flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span style={{ color: 'var(--text-muted)', minWidth: '2.2em' }}>[{src.n}]</span>
                {src.url ? (
                  <a href={src.url} target="_blank" rel="noopener noreferrer"
                     style={{ color: 'var(--accent-blue)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                    {src.name} ↗
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>{src.name}</span>
                )}
                {src.party_source && <PartyMarker />}
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  {[
                    src.url ? hostOf(src.url) : null,
                    src.tier != null ? `tier ${src.tier}` : null,
                    typeof src.published_at === 'string' && src.published_at ? src.published_at.slice(0, 10) : null,
                    `cited in ${src.cited} paragraph${src.cited === 1 ? '' : 's'}`,
                  ].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
