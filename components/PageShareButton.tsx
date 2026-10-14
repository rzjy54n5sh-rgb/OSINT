'use client';

import { useState } from 'react';
import { SITE_HOST } from '@/lib/site';

const BASE_URL = SITE_HOST;

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
        fontFamily: 'var(--font-mono), monospace',
        fontSize: 11,
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
  return `${countryName} War Posture: ${naiScore} · ${category} · Day ${conflictDay} — ${BASE_URL}/warroom`;
}

/**
 * Scenario share text. B is passed as a range string (e.g. "60\u201378%") because A, C and D can
 * co-occur: "none of them" is bounded, not a point (lib/scenario-range.ts).
 */
export function buildScenariosShareText(
  scenarioA: number,
  scenarioBRange: string,
  scenarioC: number,
  scenarioD: number,
  conflictDay: number
): string {
  return `Scenarios A: ${scenarioA}% · B (none of A/C/D): ${scenarioBRange} · C: ${scenarioC}% · D: ${scenarioD}% · Day ${conflictDay} — ${BASE_URL}/scenarios`;
}

export function buildNaiMapShareText(conflictDay: number, countryCode?: string, score?: number, category?: string): string {
  if (countryCode && score != null && category) {
    return `${countryCode} War Posture: ${score} · ${category} · Day ${conflictDay} — ${BASE_URL}/nai`;
  }
  return `War Posture · Day ${conflictDay} — ${BASE_URL}/nai`;
}
