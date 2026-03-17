'use client';

import { useState } from 'react';
import { addAdminAction, deactivateAdminAction, changeAdminRoleAction } from '@/app/(admin)/admin/admins/actions';
import type { AdminRole } from '@/types';

const ROLES_NO_SA: AdminRole[] = ['INTEL_ANALYST', 'USER_MANAGER', 'FINANCE_MANAGER', 'CONTENT_REVIEWER'];

export function AdminsClient({
  admins,
  createdByLookup,
  currentAdminId,
}: {
  admins: { id: string; email: string; display_name: string; role: string; is_active: boolean; created_by?: string; created_at: string }[];
  createdByLookup: Record<string, string>;
  currentAdminId: string;
}) {
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState<AdminRole>('INTEL_ANALYST');
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!addEmail.trim()) return;
    const res = await addAdminAction(addEmail.trim(), addRole);
    if (res.ok) {
      setAddEmail('');
      window.location.reload();
    } else alert(res.error);
  };

  const handleDeactivate = async (id: string) => {
    if (id === currentAdminId) return;
    if (!confirm('Deactivate this admin? They will lose access immediately.')) return;
    setDeactivating(id);
    await deactivateAdminAction(id);
    setDeactivating(null);
    window.location.reload();
  };

  const handleRoleChange = async (id: string, newRole: AdminRole) => {
    if (id === currentAdminId) return;
    setRoleChanging(id);
    await changeAdminRoleAction(id, newRole);
    setRoleChanging(null);
    window.location.reload();
  };

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Admin Users</h1>
      <div className="flex gap-2 mb-6">
        <input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email" className="font-mono text-xs px-2 py-2 w-48 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
        <select value={addRole} onChange={(e) => setAddRole(e.target.value as AdminRole)} className="font-mono text-xs px-2 py-2 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          {ROLES_NO_SA.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button type="button" onClick={handleAdd} className="font-mono text-xs px-4 py-2 border rounded-sm" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
          Add admin
        </button>
      </div>
      <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Role</th>
              <th className="text-left p-2">Active</th>
              <th className="text-left p-2">Created by</th>
              <th className="text-left p-2">Created</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="p-2">{a.display_name}</td>
                <td className="p-2">{a.email}</td>
                <td className="p-2">
                  {a.id === currentAdminId || a.role === 'SUPER_ADMIN' ? (
                    a.role
                  ) : (
                    <select value={a.role} onChange={(e) => handleRoleChange(a.id, e.target.value as AdminRole)} disabled={roleChanging === a.id} className="font-mono text-[10px] px-1 py-0.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)' }}>
                      {ROLES_NO_SA.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="p-2">{a.is_active ? 'Yes' : 'No'}</td>
                <td className="p-2">{a.created_by ? createdByLookup[a.created_by] ?? a.created_by : '—'}</td>
                <td className="p-2">{new Date(a.created_at).toLocaleDateString()}</td>
                <td className="p-2">
                  {a.id !== currentAdminId && a.is_active && (
                    <button type="button" onClick={() => handleDeactivate(a.id)} disabled={!!deactivating} className="font-mono text-[10px] px-2 py-1 border rounded-sm" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>
                      Deactivate
                    </button>
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
