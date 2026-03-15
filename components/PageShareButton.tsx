'use client';

import { useState } from 'react';

const BASE_URL = 'mena-intel-desk.com';

interface PageShareButtonProps {
  getCopyText: () => string;
  label?: string;
  className?: string;
}

export function PageShareButton({ getCopyText, label = 'SHARE PAGE', className = '' }: PageShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    const text = getCopyText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      style={{
        fontFamily: 'IBM Plex Mono',
        fontSize: 8,
        letterSpacing: '1px',
        padding: '4px 10px',
        border: '1px solid var(--border)',
        color: copied ? 'var(--accent-green)' : 'var(--text-muted)',
        background: 'none',
        cursor: 'pointer',
      }}
    >
      {copied ? '✓ COPIED' : `↗ ${label}`}
    </button>
  );
}

export function buildWarRoomShareText(countryName: string, naiScore: number, category: string, conflictDay: number): string {
  return `${countryName} NAI: ${naiScore} · ${category} · Day ${conflictDay} — ${BASE_URL}/warroom`;
}

export function buildScenariosShareText(
  scenarioA: number,
  scenarioB: number,
  scenarioC: number,
  scenarioD: number,
  conflictDay: number
): string {
  return `Scenarios A: ${scenarioA}% · B: ${scenarioB}% · C: ${scenarioC}% · D: ${scenarioD}% · Day ${conflictDay} — ${BASE_URL}/scenarios`;
}

export function buildNaiMapShareText(conflictDay: number, countryCode?: string, score?: number, category?: string): string {
  if (countryCode && score != null && category) {
    return `${countryCode} NAI: ${score} · ${category} · Day ${conflictDay} — ${BASE_URL}/nai`;
  }
  return `NAI Map · Day ${conflictDay} — ${BASE_URL}/nai`;
}
