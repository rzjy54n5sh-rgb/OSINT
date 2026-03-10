'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';

// Full-width ASCII logo — scales via font-size
const ASCII_LOGO = `
███╗   ███╗███████╗███╗   ██╗ █████╗     ██╗███╗   ██╗████████╗███████╗██╗         ██████╗ ███████╗███████╗██╗  ██╗
████╗ ████║██╔════╝████╗  ██║██╔══██╗    ██║████╗  ██║╚══██╔══╝██╔════╝██║         ██╔══██╗██╔════╝██╔════╝██║ ██╔╝
██╔████╔██║█████╗  ██╔██╗ ██║███████║    ██║██╔██╗ ██║   ██║   █████╗  ██║         ██║  ██║█████╗  ███████╗█████╔╝ 
██║╚██╔╝██║██╔══╝  ██║╚██╗██║██╔══██║    ██║██║╚██╗██║   ██║   ██╔══╝  ██║         ██║  ██║██╔══╝  ╚════██║██╔═██╗ 
██║ ╚═╝ ██║███████╗██║ ╚████║██║  ██║    ██║██║ ╚████║   ██║   ███████╗███████╗    ██████╔╝███████╗███████║██║  ██╗
╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚══════╝   ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝`.trim();

const getBootLines = (conflictDay: number, articleCount: number, countriesTracked: number) => [
  '> INITIALIZING OSINT COLLECTION SYSTEMS........... OK',
  '> ESTABLISHING SECURE CHANNEL TO DATABASE......... OK',
  '> LOADING NARRATIVE ALIGNMENT INDEX MATRICES...... OK',
  '> CONFLICT INTELLIGENCE FEED: ACTIVE',
  '> NAI SCORING ENGINE: OPERATIONAL',
  `> ARTICLES INDEXED: ${articleCount} | COUNTRIES TRACKED: ${countriesTracked}`,
  `> CONFLICT DAY ${conflictDay} — ALL SYSTEMS NOMINAL ████████ 100%`,
];

type Phase = 'logo' | 'boot' | 'done';

interface AsciiHeroProps {
  articleCount?: number;
  conflictDay?: number;
  countriesTracked?: number;
}

export function AsciiHero({
  articleCount = 10,
  conflictDay  = 10,
  countriesTracked = 20,
}: AsciiHeroProps) {
  const bootLines = useMemo(
    () => getBootLines(conflictDay, articleCount, countriesTracked),
    [conflictDay, articleCount, countriesTracked]
  );
  const [displayedLogo, setDisplayedLogo] = useState('');
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine]     = useState('');
  const [lineIndex, setLineIndex]         = useState(0);
  const [phase, setPhase]                 = useState<Phase>('logo');

  // Phase 1 — reveal ASCII logo fast
  useEffect(() => {
    if (phase !== 'logo') return;
    let i = 0;
    const id = setInterval(() => {
      i += 3; // reveal 3 chars per tick for speed
      setDisplayedLogo(ASCII_LOGO.slice(0, i));
      if (i >= ASCII_LOGO.length) {
        clearInterval(id);
        setDisplayedLogo(ASCII_LOGO);
        setTimeout(() => setPhase('boot'), 500);
      }
    }, 6);
    return () => clearInterval(id);
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

      {/* ASCII Logo */}
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
          {phase === 'logo' && (
            <span className="blink-cursor" style={{ color: '#E8C547' }}>█</span>
          )}
        </pre>
      </div>

      {/* Boot sequence terminal */}
      {phase !== 'logo' && (
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
              fontSize: '9px',
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

          {/* Completed lines */}
          {completedLines.map((line, i) => (
            <p
              key={i}
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '10px',
                lineHeight: '1.8',
                color: isLineGreen(line)
                  ? 'var(--accent-green)'
                  : 'var(--text-secondary)',
                opacity: 0.75,
              }}
            >
              {line}
            </p>
          ))}

          {/* Currently typing line */}
          {phase === 'boot' && (
            <p
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '10px',
                lineHeight: '1.8',
                color: 'var(--text-primary)',
              }}
            >
              {currentLine}
              <span className="blink-cursor" style={{ color: 'var(--accent-green)' }}>█</span>
            </p>
          )}
        </div>
      )}

      {/* Live stat bar — appears after boot */}
      {phase === 'done' && (
        <div
          className="fade-up fade-up-1"
          style={{
            marginTop: '28px',
            display: 'flex',
            gap: '40px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {[
            { label: 'CONFLICT DAY', value: conflictDay, color: 'var(--accent-red)' },
            { label: 'ARTICLES', value: articleCount, color: 'var(--accent-gold)' },
            { label: 'COUNTRIES', value: countriesTracked, color: 'var(--accent-blue)' },
            { label: 'SCENARIOS', value: 4, color: 'var(--accent-green)' },
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
                  fontSize: '9px',
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
  );
}
