'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NAI_ARCHIVE_LABEL } from '@/lib/nai-v2';

type ArchivedRow = {
  country_code: string;
  conflict_day: number;
  expressed_score: number | null;
  latent_score: number | null;
  category: string | null;
};

/**
 * Legacy nai_scores (Days 1-35) behind an explicit toggle, hidden by default.
 * Rendered as plain text with NO category colours so it cannot be visually mistaken for
 * War Posture categories (same names, different meaning). Read-only; never relabelled.
 */
export function NaiArchiveToggle() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ArchivedRow[] | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || rows !== null) return;
    try {
      const { data, error: e } = await createClient()
        .from('nai_scores')
        .select('country_code, conflict_day, expressed_score, latent_score, category')
        .lte('conflict_day', 35)
        .order('conflict_day', { ascending: false })
        .order('country_code', { ascending: true });
      if (e) throw new Error(e.message);
      const list = (data as ArchivedRow[] | null) ?? [];
      setRows(list);
      setDay(list[0]?.conflict_day ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load archive');
      setRows([]);
    }
  };

  const days = rows ? Array.from(new Set(rows.map((r) => r.conflict_day))) : [];
  const shown = rows && day != null ? rows.filter((r) => r.conflict_day === day) : [];

  return (
    <section className="mt-6 border-t pt-3" style={{ borderColor: 'var(--border)' }} data-testid="nai-archive">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="font-mono text-[11px] uppercase underline"
        style={{ color: 'var(--text-muted)' }}
      >
        {open ? 'Hide' : 'Show'} {NAI_ARCHIVE_LABEL}
      </button>
      {open && (
        <div className="mt-2 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <p className="border px-2 py-1 mb-2" style={{ borderColor: 'var(--accent-orange)', color: 'var(--accent-orange)' }}>
            {NAI_ARCHIVE_LABEL.toUpperCase()}. Days 1–35 were scored on a retired, US-referenced axis. These numbers and
            labels are NOT comparable with War Posture scores; the same label names meant something different.
          </p>
          {error && <p>Archive unavailable: {error}</p>}
          {rows === null && !error && <p>LOADING…</p>}
          {rows !== null && rows.length === 0 && !error && <p>No archived rows.</p>}
          {days.length > 0 && (
            <label className="block mb-2">
              ARCHIVED DAY{' '}
              <select
                value={day ?? ''}
                onChange={(e) => setDay(Number(e.target.value))}
                className="bg-transparent border px-1"
                style={{ borderColor: 'var(--border)' }}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          {shown.length > 0 && (
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>CC</th>
                  <th>OLD EXP</th>
                  <th>OLD LAT</th>
                  <th>OLD LABEL</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.country_code}-${r.conflict_day}`} translate="no">
                    <td>{r.country_code}</td>
                    <td>{r.expressed_score ?? '—'}</td>
                    <td>{r.latent_score ?? '—'}</td>
                    <td>{r.category ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
