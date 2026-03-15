'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { useConflictDay } from '@/hooks/useConflictDay';

const COUNTRY_LIST = [
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BR', name: 'Brazil' },
  { code: 'DE', name: 'Germany' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GR', name: 'Greece' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'LY', name: 'Libya' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'SD', name: 'Sudan' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'OTHER', name: 'Other (type below)' },
];

type Status = 'idle' | 'generating' | 'done' | 'already_exists' | 'error';

export default function GenerateBriefingPage() {
  const router = useRouter();
  const conflictDay = useConflictDay();

  const [apiKey, setApiKey] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Restore saved key from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('user_anthropic_key');
      if (saved?.startsWith('sk-ant-')) setApiKey(saved);
    } catch {}
  }, []);

  const selectedCountry = COUNTRY_LIST.find(c => c.code === countryCode);
  const countryName =
    countryCode === 'OTHER' ? customName : (selectedCountry?.name ?? '');

  const canGenerate =
    apiKey.startsWith('sk-ant-') &&
    countryCode !== '' &&
    countryName !== '' &&
    conflictDay != null &&
    !loading;

  async function handleGenerate() {
    if (!canGenerate) return;

    // Save key in localStorage (browser only — never sent to our servers for storage)
    try { localStorage.setItem('user_anthropic_key', apiKey); } catch {}

    setLoading(true);
    setStatus('generating');
    setErrorMsg('');

    try {
      const resp = await fetch('/api/generate-briefing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          countryCode: countryCode === 'OTHER' ? customName.slice(0, 2).toUpperCase() : countryCode,
          countryName,
          conflictDay,
        }),
      });

      const data = await resp.json() as {
        error?: string;
        existing?: boolean;
        reportId?: string;
        success?: boolean;
        countryCode?: string;
      };

      if (!resp.ok) {
        setStatus('error');
        setErrorMsg(data.error ?? `Error ${resp.status}`);
        return;
      }

      if (data.existing) {
        setStatus('already_exists');
        setTimeout(() => {
          router.push(`/briefings/${conflictDay}/country`);
        }, 1200);
        return;
      }

      setStatus('done');
      setTimeout(() => {
        router.push(`/briefings/${conflictDay}/country`);
      }, 1500);
    } catch (e) {
      setStatus('error');
      setErrorMsg('Network error — check your connection and try again');
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel: Record<Status, string> = {
    idle: 'GENERATE REPORT',
    generating: 'GENERATING — PLEASE WAIT...',
    done: '✓ REPORT SAVED — REDIRECTING',
    already_exists: '✓ REPORT EXISTS — REDIRECTING',
    error: 'RETRY',
  };

  const buttonColor: Record<Status, string> = {
    idle: 'var(--accent-gold)',
    generating: 'var(--border)',
    done: 'var(--accent-green)',
    already_exists: 'var(--accent-blue)',
    error: 'var(--accent-red)',
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Link
        href="/briefings"
        className="font-mono text-xs mb-6 inline-block"
        style={{ color: 'var(--accent-gold)' }}
      >
        ← BRIEFINGS
      </Link>

      <PageBriefing
        title="GENERATE COUNTRY REPORT"
        description="Generate an intelligence brief for any country not covered by the platform's five standard reports. Uses your Anthropic API key directly — your key is never stored on our servers. Generated reports are saved to the platform and visible to all users, labelled COMMUNITY."
        note="Cost: ~$0.04 per report using claude-haiku-4-5. Reports cover official position, public sentiment, economic impact, and strategic assessment through a structurally neutral lens."
      />

      <OsintCard className="space-y-5">

        {/* API Key Input */}
        <div>
          <label
            htmlFor="api-key"
            className="font-mono text-xs block mb-2"
            style={{ color: 'var(--text-muted)', letterSpacing: '1.5px' }}
          >
            YOUR ANTHROPIC API KEY
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            autoComplete="off"
            className="w-full font-mono text-xs px-3 py-2.5 bg-transparent border focus:outline-none"
            style={{
              borderColor: apiKey && !apiKey.startsWith('sk-ant-')
                ? 'var(--accent-red)'
                : 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          {apiKey && !apiKey.startsWith('sk-ant-') && (
            <p className="font-mono mt-1"
               style={{ fontSize: '9px', color: 'var(--accent-red)' }}>
              Key must start with sk-ant-
            </p>
          )}
          <p className="font-mono mt-1.5"
             style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            ◆ Stored in your browser only. Sent directly to Anthropic — never to our servers.
          </p>
        </div>

        {/* Country Selector */}
        <div>
          <label
            htmlFor="country-select"
            className="font-mono text-xs block mb-2"
            style={{ color: 'var(--text-muted)', letterSpacing: '1.5px' }}
          >
            COUNTRY
          </label>
          <select
            id="country-select"
            value={countryCode}
            onChange={e => setCountryCode(e.target.value)}
            className="w-full font-mono text-xs px-3 py-2.5 border focus:outline-none"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">— Select country —</option>
            {COUNTRY_LIST.map(c => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Custom country name */}
        {countryCode === 'OTHER' && (
          <div>
            <label
              htmlFor="custom-name"
              className="font-mono text-xs block mb-2"
              style={{ color: 'var(--text-muted)', letterSpacing: '1.5px' }}
            >
              COUNTRY NAME
            </label>
            <input
              id="custom-name"
              type="text"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="e.g. Ethiopia"
              className="w-full font-mono text-xs px-3 py-2.5 bg-transparent border focus:outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        )}

        {/* Preview */}
        {countryCode && countryName && conflictDay && (
          <div
            className="px-3 py-2.5"
            style={{
              background: 'rgba(232,197,71,0.04)',
              border: '1px solid rgba(232,197,71,0.2)',
            }}
          >
            <p className="font-mono" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              GENERATING: {countryName} · Conflict Day {conflictDay} · ~$0.04
            </p>
            <p className="font-mono mt-1" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              Report saved as COMMUNITY — visible to all users after generation.
              Platform editorial reports take precedence on the same day.
            </p>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="w-full font-mono text-xs py-3 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: buttonColor[status],
            color: '#000',
            letterSpacing: '2px',
            fontWeight: 500,
          }}
        >
          {buttonLabel[status]}
        </button>

        {/* Error message */}
        {status === 'error' && errorMsg && (
          <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>
            ⚠ {errorMsg}
          </p>
        )}

      </OsintCard>

      {/* Footer note */}
      <p
        className="font-mono text-xs mt-6 text-center leading-relaxed"
        style={{ color: 'var(--text-muted)' }}
      >
        Future: premium tier will offer verified, source-linked country
        reports at higher quality. Community reports are free for all.
      </p>
    </div>
  );
}
