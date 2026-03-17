'use client';

import React, { useState } from 'react';
import { resolveDisputeAction } from '@/app/(admin)/admin/disputes/actions';

const TRUNCATE_LEN = 80;

export function DisputesClient({
  disputes,
  adminUserId,
}: {
  disputes: { id: string; article_id: string; article_url: string | null; claim_text: string; source_url: string; submitted_at: string; admin_action: string | null }[];
  adminUserId: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const handleResolve = async (id: string, action: 'accepted' | 'rejected') => {
    setResolving(id);
    await resolveDisputeAction(id, action);
    setResolving(null);
    setExpandedId(null);
    window.location.reload();
  };

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Disputes</h1>
      <div className="rounded border p-4 mb-6 font-mono text-xs" style={{ borderColor: 'var(--border)', background: 'rgba(107,33,168,0.06)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Note:</strong>{' '}
        Resolving a dispute marks the article. It does NOT change the Disinformation Tracker. The Disinformation Tracker is maintained independently for structural neutrality.
      </div>
      <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">Article ID</th>
              <th className="text-left p-2">Claim (excerpt)</th>
              <th className="text-left p-2">Source URL</th>
              <th className="text-left p-2">Submitted</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {disputes.map((d) => (
              <React.Fragment key={d.id}>
                <tr className="cursor-pointer hover:bg-white/5" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                  <td className="p-2">{d.article_id}</td>
                  <td className="p-2">{d.claim_text.length > TRUNCATE_LEN ? `${d.claim_text.slice(0, TRUNCATE_LEN)}…` : d.claim_text}</td>
                  <td className="p-2">{d.source_url.length > 40 ? `${d.source_url.slice(0, 40)}…` : d.source_url}</td>
                  <td className="p-2">{new Date(d.submitted_at).toLocaleString()}</td>
                  <td className="p-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleResolve(d.id, 'accepted'); }} disabled={!!resolving} className="font-mono text-[10px] px-2 py-1 rounded border mr-1" style={{ borderColor: 'var(--accent-green)', color: 'var(--accent-green)' }}>
                      Accept
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleResolve(d.id, 'rejected'); }} disabled={!!resolving} className="font-mono text-[10px] px-2 py-1 rounded border" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>
                      Reject
                    </button>
                  </td>
                </tr>
                {expandedId === d.id && (
                  <tr>
                    <td colSpan={5} className="p-4 border-t" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                      <div className="space-y-2 font-mono text-xs">
                        <p><strong>Full claim:</strong> {d.claim_text}</p>
                        <p><strong>Source URL:</strong> <a href={d.source_url} target="_blank" rel="noopener noreferrer" className="break-all" style={{ color: 'var(--accent-gold)' }}>{d.source_url}</a></p>
                        {d.article_url && <p><strong>Article URL:</strong> <a href={d.article_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)' }}>{d.article_url}</a></p>}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
