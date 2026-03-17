'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { updateConfig } from '@/lib/api/admin/config';

type ConfigRow = { key: string; value: unknown; description?: string; is_sensitive: boolean };

export function ConfigClient({ initialConfig }: { initialConfig: ConfigRow[] }) {
  const [config, setConfig] = useState<ConfigRow[]>(initialConfig);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [hideSensitive, setHideSensitive] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => setToken(session?.access_token ?? null));
  }, []);

  const displayValue = (row: ConfigRow) => {
    if (row.is_sensitive && !revealed[row.key]) return '••••••••';
    const v = row.value;
    return v == null ? '' : String(v);
  };

  const filtered = hideSensitive ? config.filter((r) => !r.is_sensitive) : config;

  const handleSave = async () => {
    if (!editingKey || !token) return;
    const row = config.find((r) => r.key === editingKey);
    if (row?.is_sensitive && editValue === '••••••••') {
      alert('Reveal the value first to edit.');
      return;
    }
    setSaving(true);
    try {
      await updateConfig(editingKey, editValue, token);
      setEditingKey(null);
      window.location.reload();
    } catch (e) {
      alert((e as Error)?.message ?? 'Failed');
    }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Platform Config</h1>
      <label className="flex items-center gap-2 mb-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={hideSensitive} onChange={(e) => setHideSensitive(e.target.checked)} />
        Hide sensitive keys
      </label>
      <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">Key</th>
              <th className="text-left p-2">Value</th>
              <th className="text-left p-2">Description</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {filtered.map((row) => (
              <tr key={row.key}>
                <td className="p-2">{row.key}</td>
                <td className="p-2">
                  {editingKey === row.key ? (
                    <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="px-2 py-1 rounded border w-full max-w-md bg-transparent" style={{ borderColor: 'var(--border)' }} autoFocus />
                  ) : (
                    <>
                      {displayValue(row)}
                      {row.is_sensitive && !revealed[row.key] && (
                        <button type="button" onClick={() => setRevealed((r) => ({ ...r, [row.key]: true }))} className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
                          Reveal
                        </button>
                      )}
                    </>
                  )}
                </td>
                <td className="p-2">{row.description ?? '—'}</td>
                <td className="p-2">
                  {editingKey === row.key ? (
                    <>
                      <button type="button" onClick={handleSave} disabled={saving} className="font-mono text-[10px] px-2 py-1 rounded border mr-1" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>Save</button>
                      <button type="button" onClick={() => { setEditingKey(null); setEditValue(''); }} className="font-mono text-[10px] px-2 py-1 rounded border" style={{ borderColor: 'var(--border)' }}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setEditingKey(row.key); setEditValue(displayValue(row)); }} className="font-mono text-[10px] px-2 py-1 rounded border" style={{ borderColor: 'var(--border)' }}>Edit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
