'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getPipelineState, triggerPipeline, updatePipelineSchedule } from '@/lib/api/admin/pipeline';
import type { PipelineRun } from '@/types';
import Link from 'next/link';

const STAGES: { value: string; label: string }[] = [
  { value: 'full', label: 'Full Pipeline' },
  { value: 'fetch', label: 'Fetch Only' },
  { value: 'analysis', label: 'Analysis Only' },
  { value: 'db_write', label: 'DB Write Only' },
  { value: 'reports', label: 'Reports Only' },
  { value: 'scenario_detection', label: 'Scenario Detection Only' },
];

function cronToLabel(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour] = parts;
  if (min === '0' && hour === '6' && parts[2] === '*' && parts[3] === '*' && parts[4] === '*') return 'Daily at 06:00 UTC';
  return cron;
}

function statusColor(status: string): string {
  if (status === 'completed') return 'var(--accent-green)';
  if (status === 'partial' || status === 'running') return 'var(--accent-orange)';
  if (status === 'failed') return 'var(--accent-red)';
  return 'var(--text-muted)';
}

type PipelineClientProps = { initialCron: string };

export function PipelineClient({ initialCron }: PipelineClientProps) {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [failingSources, setFailingSources] = useState<{ id: string; name: string; display_name: string; health_status: string }[]>([]);
  const [conflictDay, setConflictDay] = useState(0);
  const [cron, setCron] = useState(initialCron);
  const [editingCron, setEditingCron] = useState(false);
  const [cronInput, setCronInput] = useState(initialCron);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [savingCron, setSavingCron] = useState(false);
  const [selectedStage, setSelectedStage] = useState('full');
  const [confirmTrigger, setConfirmTrigger] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const supabase = createClient();

  const fetchState = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    try {
      const state = await getPipelineState(session.access_token);
      setRuns(state.pipelineRuns);
      setFailingSources(state.failingSources);
      setConflictDay(state.currentConflictDay);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [supabase.auth]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(fetchState, 10000);
    return () => clearInterval(id);
  }, [polling, fetchState]);

  const handleTrigger = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setTriggering(true);
    try {
      await triggerPipeline(selectedStage, session.access_token, { conflictDay });
      setConfirmTrigger(false);
      setPolling(true);
      await fetchState();
    } finally {
      setTriggering(false);
    }
  };

  const handleSaveCron = async () => {
    const parts = cronInput.trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 5) {
      alert('Cron must have exactly 5 space-separated fields');
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setSavingCron(true);
    try {
      await updatePipelineSchedule(cronInput.trim(), session.access_token);
      setCron(cronInput.trim());
      setEditingCron(false);
    } finally {
      setSavingCron(false);
    }
  };

  const avgDuration = runs
    .filter((r) => r.duration_seconds != null && r.completed_at)
    .slice(0, 7)
    .reduce((a, r) => a + (r.duration_seconds ?? 0), 0) / Math.min(7, runs.filter((r) => r.duration_seconds != null).length) || 0;

  const lastRun = runs[0];

  if (loading) {
    return (
      <div className="p-6 font-mono text-sm" style={{ color: 'var(--text-muted)' }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase" style={{ color: 'var(--text-muted)' }}>
        Pipeline Control
      </h1>

      <div className="p-4 rounded border space-y-2" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="font-mono text-xs uppercase" style={{ color: 'var(--text-muted)' }}>Current status</h2>
        {lastRun ? (
          <>
            <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
              Last run: {new Date(lastRun.started_at).toLocaleString()} · {lastRun.duration_seconds != null ? `${lastRun.duration_seconds}s` : '—'} ·{' '}
              <span style={{ color: statusColor(lastRun.status) }}>{lastRun.status}</span>
            </p>
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Next scheduled: {cronToLabel(cron)}
            </p>
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Average runtime (last 7): {Math.round(avgDuration)}s
            </p>
          </>
        ) : (
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>No runs yet</p>
        )}
      </div>

      <div className="p-4 rounded border space-y-4" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="font-mono text-xs uppercase" style={{ color: 'var(--text-muted)' }}>Manual trigger</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="font-mono text-xs px-3 py-2 rounded border bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setConfirmTrigger(true)}
            disabled={triggering}
            className="font-mono text-xs px-4 py-2 border rounded-sm"
            style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
          >
            ▶ Run Now
          </button>
        </div>
        {confirmTrigger && (
          <div className="p-3 rounded border" style={{ borderColor: 'var(--accent-gold)' }}>
            <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              Trigger {STAGES.find((s) => s.value === selectedStage)?.label} for Day {conflictDay}? This will write to production database.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTrigger}
                disabled={triggering}
                className="font-mono text-xs px-3 py-1 border rounded-sm"
                style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmTrigger(false)}
                className="font-mono text-xs px-3 py-1 border rounded-sm"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <h2 className="font-mono text-xs uppercase p-3 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          Run history
        </h2>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Conflict Day</th>
              <th className="text-left p-2">Stage</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Duration</th>
              <th className="text-left p-2">Countries</th>
              <th className="text-left p-2">Articles</th>
              <th className="text-left p-2">Triggered By</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {runs.map((r) => (
              <React.Fragment key={r.id}>
                <tr
                  className="cursor-pointer"
                  style={{
                    background: expandedId === r.id ? 'rgba(232,197,71,0.06)' : undefined,
                    borderLeft: `3px solid ${statusColor(r.status)}`,
                  }}
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <td className="p-2">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="p-2">{r.conflict_day}</td>
                  <td className="p-2">{r.stage}</td>
                  <td className="p-2" style={{ color: statusColor(r.status) }}>{r.status}</td>
                  <td className="p-2">{r.duration_seconds != null ? `${r.duration_seconds}s` : '—'}</td>
                  <td className="p-2">{r.countries_processed ?? '—'}</td>
                  <td className="p-2">{r.articles_ingested ?? '—'}</td>
                  <td className="p-2">{r.triggered_by}</td>
                </tr>
                {expandedId === r.id && (
                  <tr>
                    <td colSpan={8} className="p-3 border-t" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.15)' }}>
                      {Array.isArray(r.stages_completed) && r.stages_completed.length > 0 && (
                        <p className="font-mono text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>
                          Stages: {JSON.stringify(r.stages_completed)}
                        </p>
                      )}
                      {r.error_message && (
                        <p className="font-mono text-[10px]" style={{ color: 'var(--accent-red)' }}>
                          Error: {r.error_message}
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 rounded border space-y-2" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="font-mono text-xs uppercase" style={{ color: 'var(--text-muted)' }}>Schedule</h2>
        {editingCron ? (
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={cronInput}
              onChange={(e) => setCronInput(e.target.value)}
              className="font-mono text-xs px-3 py-2 rounded border flex-1 bg-transparent"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="0 6 * * *"
            />
            <button
              type="button"
              onClick={handleSaveCron}
              disabled={savingCron || cronInput.trim().split(/\s+/).filter(Boolean).length !== 5}
              className="font-mono text-xs px-3 py-2 border rounded-sm"
              style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => { setEditingCron(false); setCronInput(cron); }}
              className="font-mono text-xs px-3 py-2 border rounded-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{cron}</p>
            <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{cronToLabel(cron)}</p>
            <button
              type="button"
              onClick={() => { setEditingCron(true); setCronInput(cron); }}
              className="font-mono text-xs px-3 py-1 border rounded-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {failingSources.length > 0 && (
        <div className="p-4 rounded border" style={{ borderColor: 'var(--accent-orange)' }}>
          <p className="font-mono text-xs mb-2" style={{ color: 'var(--accent-orange)' }}>
            {failingSources.length} failing source(s): {failingSources.map((s) => s.display_name || s.name).join(', ')}
          </p>
          <Link href="/admin/sources" className="font-mono text-xs underline" style={{ color: 'var(--accent-gold)' }}>
            → Sources
          </Link>
        </div>
      )}
    </div>
  );
}
