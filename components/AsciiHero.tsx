'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { UIStringKey } from '@/lib/i18n';

// Full-width ASCII logo — scales via font-size
const ASCII_LOGO = `
███╗   ███╗███████╗███╗   ██╗ █████╗     ██╗███╗   ██╗████████╗███████╗██╗         ██████╗ ███████╗███████╗██╗  ██╗
████╗ ████║██╔════╝████╗  ██║██╔══██╗    ██║████╗  ██║╚══██╔══╝██╔════╝██║         ██╔══██╗██╔════╝██╔════╝██║ ██╔╝
██╔████╔██║█████╗  ██╔██╗ ██║███████║    ██║██╔██╗ ██║   ██║   █████╗  ██║         ██║  ██║█████╗  ███████╗█████╔╝ 
██║╚██╔╝██║██╔══╝  ██║╚██╗██║██╔══██║    ██║██║╚██╗██║   ██║   ██╔══╝  ██║         ██║  ██║██╔══╝  ╚════██║██╔═██╗ 
██║ ╚═╝ ██║███████╗██║ ╚████║██║  ██║    ██║██║ ╚████║   ██║   ███████╗███████╗    ██████╔╝███████╗███████║██║  ██╗
╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚══════╝   ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝`.trim();

function getBootLines(
  conflictDay: number | null | undefined,
  articleCount: number,
  countriesTracked: number,
  t: (k: UIStringKey) => string
) {
  return [
    '> INITIALIZING OSINT COLLECTION SYSTEMS........... OK',
    '> ESTABLISHING SECURE CHANNEL TO DATABASE......... OK',
    '> LOADING NARRATIVE ALIGNMENT INDEX MATRICES...... OK',
    `> ${t('asciiConflictLine')}`,
    '> NAI SCORING ENGINE: OPERATIONAL',
    `> ARTICLES INDEXED: ${articleCount > 0 ? articleCount : 'LOADING...'} | COUNTRIES TRACKED: ${countriesTracked}`,
    `> ${t('conflictDay')} ${conflictDay ?? '—'} ${t('conflictDayBootSuffix')}`,
  ];
}

type Phase = 'logo' | 'boot' | 'done';

interface AsciiHeroProps {
  articleCount?: number;
  conflictDay?: number | null;
  countriesTracked?: number;
}

export function AsciiHero({
  articleCount = 0,
  conflictDay,
  countriesTracked = 20,
}: AsciiHeroProps) {
  const { t, lang } = useI18n();
  const bootLines = useMemo(
    () => getBootLines(conflictDay, articleCount, countriesTracked, t),
    [conflictDay, articleCount, countriesTracked, t, lang]
  );
  const [displayedLogo, setDisplayedLogo] = useState('');
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine]     = useState('');
  const [lineIndex, setLineIndex]         = useState(0);
  const [phase, setPhase]                 = useState<Phase>('logo');

  // prefers-reduced-motion: show the finished state at once (no typing animation).
  useEffect(() => {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setDisplayedLogo(ASCII_LOGO);
    setCompletedLines(bootLines);
    setLineIndex(bootLines.length);
    setPhase('done');
  }, [bootLines]);

  // Phase 1 — reveal ASCII logo fast. One React update per animation frame (it used to be
  // one every 6 ms), ~35 frames in total.
  useEffect(() => {
    if (phase !== 'logo') return;
    let i = 0;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      i += 24;
      if (i >= ASCII_LOGO.length) {
        setDisplayedLogo(ASCII_LOGO);
        timer = setTimeout(() => setPhase((p) => (p === 'logo' ? 'boot' : p)), 500);
        return;
      }
      setDisplayedLogo(ASCII_LOGO.slice(0, i));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [phase]);

  // Phase 2 — type each boot line
  const typeNextLine = useCallback(() => {
    if (lineIndex >= bootLines.length) {
      setPhase('done');
      return;
    }
    const line = bootLines[lineIndex];
    let i = 0;
    const id = setInterval(() => {
      i++;
      setCurrentLine(line.slice(0, i));
      if (i >= line.length) {
        clearInterval(id);
        setTimeout(() => {
          setCompletedLines(prev => [...prev, line]);
          setCurrentLine('');
          setLineIndex(prev => prev + 1);
        }, 120);
      }
    }, 18);
    return () => clearInterval(id);
  }, [lineIndex, bootLines]);

  useEffect(() => {
    if (phase !== 'boot') return;
    const cleanup = typeNextLine();
    return cleanup;
  }, [phase, lineIndex, typeNextLine]);

  const isLineGreen = (line: string) =>
    line.includes('OK') || line.includes('100%');

  return (
    <div
      className="relative flex flex-col items-center justify-center scanlines"
      style={{ minHeight: '72vh', padding: '48px 24px' }}
    >
      {/* Ghost background text */}
      <span
        className="ghost-text"
        style={{ top: '-20px', right: '-60px', opacity: 0.03 }}
        aria-hidden
      >
        OSINT
      </span>

      {/* ASCII animation — hidden on mobile to prevent horizontal scroll */}
      <div className="ascii-hero-full">
      <div
        style={{
          width: '100%',
          maxWidth: '1400px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        <pre
          aria-label="MENA Intel Desk"
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 'clamp(3.5px, 0.9vw, 9.5px)',
            lineHeight: 1.25,
            letterSpacing: 0,
            color: '#E8C547',
            textShadow: '0 0 18px rgba(232,197,71,0.35)',
            whiteSpace: 'pre',
            userSelect: 'none',
            margin: '0 auto',
            display: 'block',
            textAlign: 'left',
            minWidth: 'max-content',
          }}
        >
          {displayedLogo}
          {/* Unrevealed remainder is laid out but invisible (visibility:hidden, so it is also
              ignored by layout-shift accounting), so the logo box has its final size from the
              first paint and nothing below it moves while it "types" (CLS). */}
          <span aria-hidden style={{ visibility: 'hidden' }}>
            {ASCII_LOGO.slice(displayedLogo.length)}
          </span>
        </pre>
      </div>

      {/* Boot sequence terminal — always laid out (one row reserved per boot line) so it does
          not push the page down when the logo finishes. */}
      {(
        <div
          style={{
            marginTop: '32px',
            width: '100%',
            maxWidth: '640px',
            padding: '16px 20px',
            background: 'rgba(16, 21, 32, 0.8)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
          }}
          className="osint-card"
        >
          {/* Terminal header */}
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '11px',
              letterSpacing: '2px',
              color: 'var(--text-muted)',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--border)',
              textTransform: 'uppercase',
            }}
          >
            SYSTEM BOOT — MENA INTEL DESK v1.0
          </div>

          {bootLines.map((line, i) => {
            const done = i < completedLines.length;
            const typing = !done && phase === 'boot' && i === lineIndex;
            const text = done ? completedLines[i] : typing ? currentLine : '';
            return (
              <p
                key={i}
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '11px',
                  lineHeight: '1.8',
                  minHeight: '1.8em',
                  color: done
                    ? isLineGreen(line)
                      ? 'var(--accent-green)'
                      : 'var(--text-secondary)'
                    : 'var(--text-primary)',
                  opacity: done ? 0.75 : 1,
                }}
              >
                {text}
                {typing && <span className="blink-cursor" style={{ color: 'var(--accent-green)' }}>█</span>}
              </p>
            );
          })}
        </div>
      )}

      {/* Live stat bar — space reserved from the start, revealed after boot */}
      {(
        <div
          className={phase === 'done' ? 'fade-up fade-up-1' : undefined}
          aria-hidden={phase !== 'done'}
          style={{
            visibility: phase === 'done' ? 'visible' : 'hidden',
            marginTop: '28px',
            display: 'flex',
            gap: '40px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {[
            { label: t('conflictDay'), value: conflictDay, color: 'var(--accent-red)' },
            { label: t('articlesLabel'), value: articleCount, color: 'var(--accent-gold)' },
            { label: t('countriesLabel'), value: countriesTracked, color: 'var(--accent-blue)' },
            { label: t('scenariosLabel'), value: 4, color: 'var(--accent-green)' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'Bebas Neue, sans-serif',
                  fontSize: '36px',
                  lineHeight: 1,
                  color,
                  textShadow: `0 0 20px ${color}60`,
                }}
              >
                {value}
              </div>
              <div
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '2px',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginTop: '4px',
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Mobile replacement */}
      <div className="ascii-hero-mobile">
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            letterSpacing: '2px',
            color: 'var(--accent-gold)',
            marginBottom: 8,
          }}
        >
          ◆ MENA INTEL DESK
        </div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            letterSpacing: '2px',
            color: 'var(--text-muted)',
          }}
        >
          OSINT INTELLIGENCE PLATFORM — US-IRAN CONFLICT TRACKER
        </div>
      </div>
    </div>
  );
}
