'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { updateNaiScoreAction, getNaiHistoryAction, getNaiScoresForDayAction } from '@/app/(admin)/admin/nai/actions';

type NaiRow = {
  country_code: string;
  expressed_score: number;
  latent_score?: number;
  gap_size?: number;
  category?: string;
  velocity: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  ALIGNED: 'var(--accent-green)',
  FRACTURED: 'var(--accent-orange)',
  INVERTED: 'var(--accent-red)',
  TENSE: 'var(--accent-yellow)',
};

type NaiClientProps = {
  initialConflictDay: number;
  initialScores: NaiRow[];
};

export function NaiClient({ initialConflictDay, initialScores }: NaiClientProps) {
  const [day, setDay] = useState(initialConflictDay);
  const [scores, setScores] = useState<NaiRow[]>(initialScores);
  const [editing, setEditing] = useState<{ country: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [chartCountry, setChartCountry] = useState(initialScores[0]?.country_code ?? '');
  const [chartData, setChartData] = useState<{ conflict_day: number; expressed_score: number; latent_score?: number }[]>([]);

  useEffect(() => {
    setScores(initialScores);
  }, [initialScores]);

  useEffect(() => {
    if (day === initialConflictDay) setScores(initialScores);
    else getNaiScoresForDayAction(day).then(setScores);
  }, [day, initialConflictDay, initialScores]);

  useEffect(() => {
    if (!chartCountry) return;
    getNaiHistoryAction(chartCountry).then(setChartData);
  }, [chartCountry]);

  const handleSave = async (countryCode: string, field: string, value: string) => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num) || num < 0 || num > 100) {
      setToast('Score must be 0–100');
      return;
    }
    setSaving(true);
    setEditing(null);
    const payload: { countryCode: string; conflictDay: number; expressedScore?: number; latentScore?: number; gapSize?: number; category?: string } = {
      countryCode,
      conflictDay: day,
    };
    if (field === 'expressed_score') payload.expressedScore = num;
    if (field === 'latent_score') payload.latentScore = num;
    if (field === 'gap_size') payload.gapSize = num;
    const res = await updateNaiScoreAction(payload);
    setSaving(false);
    if (res.ok) {
      setScores((prev) =>
        prev.map((r) =>
          r.country_code === countryCode ? { ...r, [field]: num } : r
        )
      );
      setToast(`NAI score updated for ${countryCode} Day ${day}`);
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast(res.error ?? 'Save failed');
    }
  };

  const startEdit = (country: string, field: string, current: number | undefined) => {
    setEditing({ country, field });
    setEditValue(String(current ?? ''));
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <h1 className="font-mono text-sm uppercase" style={{ color: 'var(--text-muted)' }}>
        NAI Scores
      </h1>

      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => setDay((d) => Math.max(1, d - 1))}
          className="font-mono text-xs px-3 py-2 border rounded-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Previous
        </button>
        <input
          type="number"
          min={1}
          value={day}
          onChange={(e) => setDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="font-mono text-xs w-20 px-2 py-2 border rounded-sm bg-transparent"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <button
          type="button"
          onClick={() => setDay((d) => d + 1)}
          className="font-mono text-xs px-3 py-2 border rounded-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Next
        </button>
      </div>

      <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
        Showing Day {day}.
      </p>

      <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">Country</th>
              <th className="text-left p-2">Expressed</th>
              <th className="text-left p-2">Latent</th>
              <th className="text-left p-2">Gap</th>
              <th className="text-left p-2">Category</th>
              <th className="text-left p-2">Velocity</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {scores.map((r) => (
              <tr key={r.country_code}>
                <td className="p-2">{r.country_code}</td>
                <td className="p-2">
                  {editing?.country === r.country_code && editing?.field === 'expressed_score' ? (
                    <input
                      autoFocus
                      type="number"
                      min={0}
                      max={100}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null);
                        if (e.key === 'Enter') handleSave(r.country_code, 'expressed_score', editValue);
                      }}
                      className="w-14 font-mono text-xs px-1 py-0.5 border bg-transparent"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-left underline"
                      onClick={() => startEdit(r.country_code, 'expressed_score', r.expressed_score)}
                    >
                      {r.expressed_score ?? '—'}
                    </button>
                  )}
                </td>
                <td className="p-2">{r.latent_score ?? '—'}</td>
                <td className="p-2">{r.gap_size ?? '—'}</td>
                <td
                  className="p-2"
                  style={{ color: r.category ? (CATEGORY_COLORS[r.category] ?? 'inherit') : 'var(--text-muted)' }}
                >
                  {r.category ?? '—'}
                </td>
                <td
                  className="p-2"
                  style={{
                    color:
                      r.velocity === 'up' ? 'var(--accent-green)' : r.velocity === 'down' ? 'var(--accent-red)' : 'var(--text-muted)',
                  }}
                >
                  {r.velocity === 'up' ? '↑' : r.velocity === 'down' ? '↓' : '='}
                </td>
                <td className="p-2">
                  {editing?.country === r.country_code && (
                    <button
                      type="button"
                      onClick={() => handleSave(r.country_code, editing.field, editValue)}
                      disabled={saving}
                      className="font-mono text-[10px] px-2 py-1 border rounded-sm"
                      style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
                    >
                      Save
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div
          className="fixed bottom-4 right-4 font-mono text-xs px-4 py-2 rounded border z-50"
          style={{ borderColor: 'var(--accent-gold)', background: 'var(--bg)', color: 'var(--accent-gold)' }}
        >
          {toast}
        </div>
      )}

      <div className="p-4 rounded border" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
          Historical (last 14 days)
        </h2>
        <select
          value={chartCountry}
          onChange={(e) => setChartCountry(e.target.value)}
          className="font-mono text-xs px-3 py-2 rounded border mb-4 bg-transparent"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          {scores.map((r) => (
            <option key={r.country_code} value={r.country_code}>
              {r.country_code}
            </option>
          ))}
        </select>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData.map((d) => ({ ...d, name: `Day ${d.conflict_day}` }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="conflict_day" stroke="var(--text-muted)" fontSize={10} />
              <YAxis stroke="var(--text-muted)" fontSize={10} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'IBM Plex Mono' }}
                labelStyle={{ color: 'var(--text-muted)' }}
              />
              <Legend />
              <Line type="monotone" dataKey="expressed_score" stroke="var(--accent-gold)" name="Expressed" dot={{ r: 2 }} />
              <Line type="monotone" dataKey="latent_score" stroke="#1E90FF" name="Latent" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
