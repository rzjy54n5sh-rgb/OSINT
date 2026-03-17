'use client';

import { useState } from 'react';
import { toggleAlertAction, editAlertAction } from '@/app/(admin)/admin/alerts/actions';

type AlertRow = { key: string; title: string | null; message: string | null; alert_type: string; is_active: boolean; priority: number; updated_at: string; activated_at: string | null };

export function AlertsClient({ alerts }: { alerts: AlertRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const handleToggle = async (key: string, current: boolean) => {
    await toggleAlertAction(key, !current);
    window.location.reload();
  };

  const startEdit = (row: AlertRow) => {
    setEditing(row.key);
    setTitle(row.title ?? '');
    setMessage(row.message ?? '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    await editAlertAction(editing, title, message);
    setEditing(null);
    window.location.reload();
  };

  const activeAlerts = alerts.filter((a) => a.is_active);

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Alerts & Banners</h1>
      <div className="rounded border overflow-x-auto mb-6" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">Key</th>
              <th className="text-left p-2">Title</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Active</th>
              <th className="text-left p-2">Priority</th>
              <th className="text-left p-2">Last activated</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {alerts.map((row) => (
              <tr key={row.key}>
                <td className="p-2">{row.key}</td>
                <td className="p-2">
                  {editing === row.key ? (
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className="font-mono text-xs w-full px-2 py-1 border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  ) : (
                    row.title ?? '—'
                  )}
                </td>
                <td className="p-2">{row.alert_type}</td>
                <td className="p-2">{row.is_active ? 'Yes' : 'No'}</td>
                <td className="p-2">{row.priority}</td>
                <td className="p-2">{row.activated_at ? new Date(row.activated_at).toLocaleString() : '—'}</td>
                <td className="p-2 flex gap-2">
                  <button type="button" onClick={() => handleToggle(row.key, row.is_active)} className="font-mono text-[10px] px-2 py-1 border rounded-sm" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
                    {row.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  {editing === row.key ? (
                    <button type="button" onClick={saveEdit} className="font-mono text-[10px] px-2 py-1 border rounded-sm" style={{ borderColor: 'var(--border)' }}>Save</button>
                  ) : (
                    <button type="button" onClick={() => startEdit(row)} className="font-mono text-[10px] px-2 py-1 border rounded-sm" style={{ borderColor: 'var(--border)' }}>Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="mb-6 p-4 rounded border" style={{ borderColor: 'var(--border)' }}>
          <label className="block font-mono text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="font-mono text-xs w-full px-2 py-2 border bg-transparent resize-none" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} rows={3} />
        </div>
      )}
      <div className="p-4 rounded border" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
        <h2 className="font-mono text-xs uppercase mb-3" style={{ color: 'var(--text-muted)' }}>Preview (active alerts on homepage)</h2>
        {activeAlerts.length === 0 ? (
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>No active alerts.</p>
        ) : (
          <div className="space-y-2">
            {activeAlerts.map((a) => (
              <div key={a.key} className="p-3 rounded border" style={{ borderColor: 'var(--accent-gold)', background: 'rgba(232,197,71,0.08)' }}>
                <p className="font-mono text-xs" style={{ color: 'var(--accent-gold)' }}>◆ {a.title || a.key}</p>
                <p className="font-mono text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>{a.message ?? '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
