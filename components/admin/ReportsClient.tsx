'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { triggerPipeline } from '@/lib/api/admin/pipeline';
import { getReportsForDayAction } from '@/app/(admin)/admin/reports/actions';
import type { ReportRow } from '@/app/(admin)/admin/reports/actions';

export function ReportsClient({
  initialDay,
  initialReports,
  role,
}: {
  initialDay: number;
  initialReports: ReportRow[];
  role: string;
}) {
  const [day, setDay] = useState(initialDay);
  const [reports, setReports] = useState(initialReports);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const canRegenerate = role === 'SUPER_ADMIN' || role === 'INTEL_ANALYST';

  useEffect(() => {
    setReports(initialReports);
  }, [initialReports]);

  const loadDay = async (d: number) => {
    const data = await getReportsForDayAction(d);
    setReports(data);
  };

  useEffect(() => {
    if (day !== initialDay) loadDay(day);
    else setReports(initialReports);
  }, [day, initialDay]);

  const handleRegenerate = async (countryCode: string) => {
    const { data: { session } } = await createClient().auth.getSession();
    if (!session?.access_token) return;
    setRegenerating(countryCode);
    try {
      await triggerPipeline('reports', session.access_token, { conflictDay: day, country: countryCode });
    } finally {
      setRegenerating(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Country Reports</h1>
      <div className="flex gap-2 items-center mb-6">
        <label className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Day</label>
        <input type="number" min={1} value={day} onChange={(e) => setDay(Math.max(1, parseInt(e.target.value, 10) || 1))} className="font-mono text-xs w-20 px-2 py-2 border rounded-sm bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
      </div>
      <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">Country</th>
              <th className="text-left p-2">NAI Score</th>
              <th className="text-left p-2">Category</th>
              <th className="text-left p-2">Updated</th>
              <th className="text-left p-2">Content Status</th>
              {canRegenerate && <th className="text-left p-2">Actions</th>}
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {reports.map((r) => (
              <tr key={r.country_code}>
                <td className="p-2">{r.country_name || r.country_code}</td>
                <td className="p-2">{r.nai_score ?? '—'}</td>
                <td className="p-2">{r.nai_category ?? '—'}</td>
                <td className="p-2">{new Date(r.updated_at).toLocaleString()}</td>
                <td className="p-2">
                  {r.content_json != null && (typeof r.content_json === 'object' ? Object.keys(r.content_json).length > 0 : true) ? (
                    <span style={{ color: 'var(--accent-green)' }}>✓</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>✗ No sourced data for Day {day}</span>
                  )}
                </td>
                {canRegenerate && (
                  <td className="p-2">
                    <button type="button" onClick={() => handleRegenerate(r.country_code)} disabled={!!regenerating} className="font-mono text-[10px] px-2 py-1 border rounded-sm" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
                      {regenerating === r.country_code ? '…' : 'Regenerate'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
