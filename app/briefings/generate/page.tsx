'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { useConflictDay } from '@/hooks/useConflictDay';

const COUNTRIES = [
  { code: 'AR', name: 'Argentina' }, { code: 'BR', name: 'Brazil' },
  { code: 'TR', name: 'Turkey' }, { code: 'PK', name: 'Pakistan' },
  { code: 'IN', name: 'India' }, { code: 'CN', name: 'China' },
  { code: 'RU', name: 'Russia' }, { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'ZA', name: 'South Africa' }, { code: 'NG', name: 'Nigeria' },
  { code: 'MA', name: 'Morocco' }, { code: 'TN', name: 'Tunisia' },
  { code: 'DZ', name: 'Algeria' }, { code: 'LY', name: 'Libya' },
  { code: 'SD', name: 'Sudan' }, { code: 'ET', name: 'Ethiopia' },
  { code: 'AZ', name: 'Azerbaijan' }, { code: 'KZ', name: 'Kazakhstan' },
  { code: 'AF', name: 'Afghanistan' }, { code: 'BD', name: 'Bangladesh' },
  { code: 'ID', name: 'Indonesia' }, { code: 'MY', name: 'Malaysia' },
];

export default function GenerateBriefingPage() {
  const router = useRouter();
  const conflictDay = useConflictDay();
  const [apiKey, setApiKey] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [customCountry, setCustomCountry] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const selectedCountry = COUNTRIES.find(c => c.code === countryCode);
  const countryName = countryCode === 'OTHER' ? customCountry.trim() : (selectedCountry?.name ?? '');

  async function handleGenerate() {
    if (!apiKey || !countryCode || !countryName || !conflictDay) return;

    // Store key in localStorage only — never send to analytics
    localStorage.setItem('user_anthropic_key', apiKey);

    setLoading(true);
    setStatus('generating');
    setError('');

    try {
      const resp = await fetch('/api/generate-briefing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          countryCode,
          countryName,
          conflictDay,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setStatus('error');
        setError(data.error ?? 'Generation failed');
        return;
      }

      if (data.existing) {
        setStatus('done');
        setTimeout(() => {
          router.push(`/briefings/${conflictDay}/country-${countryCode.toLowerCase()}`);
        }, 1000);
        return;
      }

      setStatus('done');
      setTimeout(() => {
        router.push(`/briefings/${conflictDay}/country`);
      }, 1500);
    } catch {
      setStatus('error');
      setError('Request failed — check your API key and try again');
    } finally {
      setLoading(false);
    }
  }

  // Restore saved key from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('user_anthropic_key');
    if (saved) setApiKey(saved);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/briefings"
            className="font-mono text-xs mb-6 inline-block"
            style={{ color: 'var(--accent-gold)' }}>
        ← BRIEFINGS
      </Link>

      <h1 className="font-display text-2xl mb-2"
          style={{ color: 'var(--text-primary)' }}>
        GENERATE COUNTRY REPORT
      </h1>
      <p className="font-mono text-xs mb-8"
         style={{ color: 'var(--text-muted)' }}>
        DAY {conflictDay ?? '—'} · POWERED BY YOUR ANTHROPIC API KEY
      </p>

      <OsintCard className="space-y-5">

        {/* API Key */}
        <div>
          <label className="font-mono text-xs block mb-2"
                 style={{ color: 'var(--text-muted)', letterSpacing: '1px' }}>
            YOUR ANTHROPIC API KEY
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full font-mono text-xs px-3 py-2 bg-transparent border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)',
                     outline: 'none' }}
          />
          <p className="font-mono mt-1" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            ◆ Stored in your browser only. Never sent to our servers.
            Used directly to call Anthropic API on your behalf.
          </p>
        </div>

        {/* Country selector */}
        <div>
          <label className="font-mono text-xs block mb-2"
                 style={{ color: 'var(--text-muted)', letterSpacing: '1px' }}>
            SELECT COUNTRY
          </label>
          <select
            value={countryCode}
            onChange={e => setCountryCode(e.target.value)}
            className="w-full font-mono text-xs px-3 py-2 bg-transparent border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)',
                     background: 'var(--bg-card)', outline: 'none' }}
          >
            <option value="">— Select country —</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
            <option value="OTHER">Other (type below)</option>
          </select>
        </div>

        {countryCode === 'OTHER' && (
          <div>
            <label className="font-mono text-xs block mb-2"
                   style={{ color: 'var(--text-muted)', letterSpacing: '1px' }}>
              COUNTRY NAME
            </label>
            <input
              type="text"
              value={customCountry}
              onChange={e => setCustomCountry(e.target.value)}
              placeholder="e.g. Ethiopia"
              className="w-full font-mono text-xs px-3 py-2 bg-transparent border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)',
                       outline: 'none' }}
            />
          </div>
        )}

        {/* Cost estimate */}
        {countryCode && countryName && (
          <div className="px-3 py-2"
               style={{ background: 'rgba(232,197,71,0.04)',
                        border: '1px solid rgba(232,197,71,0.15)' }}>
            <p className="font-mono" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              Generating: {countryName} · Day {conflictDay ?? '—'} ·
              Estimated cost: ~$0.04 from your API key
            </p>
            <p className="font-mono mt-1" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              Report will be saved to the platform for all users.
              Labelled COMMUNITY to distinguish from editorial reports.
            </p>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={!apiKey || !countryCode || !countryName || loading}
          className="w-full font-mono text-xs py-3 transition-opacity disabled:opacity-40"
          style={{
            background: status === 'done' ? 'var(--accent-green)' :
                        status === 'error' ? 'var(--accent-red)' :
                        'var(--accent-gold)',
            color: '#000',
            letterSpacing: '2px',
          }}
        >
          {status === 'idle' && 'GENERATE REPORT'}
          {status === 'generating' && 'GENERATING...'}
          {status === 'done' && '✓ REPORT READY — REDIRECTING'}
          {status === 'error' && 'RETRY'}
        </button>

        {error && (
          <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>
            ERROR: {error}
          </p>
        )}

      </OsintCard>

      <p className="font-mono text-xs mt-6 text-center"
         style={{ color: 'var(--text-muted)' }}>
        Reports use claude-haiku-4-5 (~$0.04). Your key is never logged.
        Generated reports are saved to the platform and visible to all users.
        Future: verified reports unlock premium tier.
      </p>
    </div>
  );
}
