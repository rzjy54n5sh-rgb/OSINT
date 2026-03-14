'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { NaiScoreBadge } from '@/components/NaiScoreBadge';
import { useBriefing, type Section, type Subsection, type Paragraph } from '@/hooks/useBriefing';
import { createClient } from '@/lib/supabase/client';
import type { Article } from '@/types/supabase';

const PERSPECTIVE_COLORS: Record<string, string> = {
  us_israel:  '#3b82f6',
  iran_irgc:  '#22c55e',
  gulf:       '#f59e0b',
  resistance: '#ef4444',
  neutral:    'var(--text-muted)',
  both:       '#a855f7',
};

const PERSPECTIVE_LABELS: Record<string, string> = {
  us_israel:  'US/ISRAEL',
  iran_irgc:  'IRAN/IRGC',
  gulf:       'GULF',
  resistance: 'RESISTANCE',
  neutral:    'NEUTRAL',
  both:       'ALL PARTIES',
};

const TYPE_LABELS: Record<string, string> = {
  general:     'GENERAL INTELLIGENCE BRIEF',
  egypt:       'EGYPT COUNTRY BRIEF',
  uae:         'UAE COUNTRY BRIEF',
  eschatology: 'ESCHATOLOGY & GEOPOLITICS',
  business:    'BUSINESS OPPORTUNITIES',
};

function dayToDate(day: number): string {
  const date = new Date(2026, 1, 28);
  date.setDate(date.getDate() + day - 1);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function BriefingReaderPage() {
  const params = useParams();
  const day = parseInt(typeof params.day === 'string' ? params.day : '15', 10);
  const type = typeof params.type === 'string' ? params.type : 'general';

  const { briefing, loading, error } = useBriefing(day, type);

  // Reading progress
  const [readProgress, setReadProgress] = useState(0);
  const [readSections, setReadSections] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // TOC panel
  const [tocOpen, setTocOpen] = useState(false);

  // Source panel
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

  if (loading) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
        LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
      </p>
    </div>
  );

  if (error || !briefing) return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/briefings" className="font-mono text-xs mb-6 inline-block"
            style={{ color: 'var(--accent-gold)' }}>← BRIEFINGS</Link>
      <p className="redacted py-12">NO BRIEFING AVAILABLE — DAY {day} / {type.toUpperCase()}</p>
    </div>
  );

  const totalSections = briefing.sections.length;
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
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono"
                  style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              {sectionProgress}%
            </span>
            <button onClick={() => setTocOpen(v => !v)}
                    className="font-mono text-xs px-2 py-1 border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)',
                             fontSize: '9px', letterSpacing: '1px' }}>
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
              style={{ fontSize: '8px', letterSpacing: '1px',
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
                {briefing.sections.map((s) => (
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
        {briefing.sections.map((section) => (
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
                      style={{ fontSize: '9px', color: 'var(--accent-green)', opacity: 0.7 }}>
                  ✓ READ
                </span>
              )}
            </div>

            {/* Subsections */}
            <div className="space-y-6">
              {section.subsections.map((sub) => (
                <SubsectionBlock
                  key={sub.id}
                  sub={sub}
                  activeSourceId={activeSource?.articleId ?? null}
                  activeArticle={activeSource}
                  onSourceTap={loadSource}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

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
}: {
  sub: Subsection;
  activeSourceId: string | null;
  activeArticle: { articleId: string; article: Article | null; loading: boolean } | null;
  onSourceTap: (id: string) => void;
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
                style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            E:{sub.nai_expressed} / L:{sub.nai_latent}
          </span>
        )}
      </div>

      {/* Paragraphs */}
      <div className="space-y-3">
        {sub.paragraphs.map((para, pi) => (
          <ParagraphBlock
            key={pi}
            para={para}
            activeSourceId={activeSourceId}
            activeArticle={activeArticle}
            onSourceTap={onSourceTap}
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
}: {
  para: Paragraph;
  activeSourceId: string | null;
  activeArticle: { articleId: string; article: Article | null; loading: boolean } | null;
  onSourceTap: (id: string) => void;
}) {
  const hasSources = para.source_ids && para.source_ids.length > 0;
  const perspColor = PERSPECTIVE_COLORS[para.perspective ?? 'neutral'] ?? 'var(--text-muted)';
  const perspLabel = PERSPECTIVE_LABELS[para.perspective ?? 'neutral'];

  return (
    <div>
      {/* Perspective badge */}
      {para.perspective && para.perspective !== 'neutral' && (
        <div className="mb-1">
          <span className="font-mono"
                style={{ fontSize: '8px', letterSpacing: '1px',
                         color: perspColor, opacity: 0.8 }}>
            [{perspLabel}]
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
              fontSize: '8px',
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
                          style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
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
