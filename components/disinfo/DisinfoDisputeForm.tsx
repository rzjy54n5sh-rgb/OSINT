'use client';

import { useState } from 'react';
import { OsintCard } from '@/components/OsintCard';
import { submitDispute } from '@/lib/api/dispute';

/** Sentinel article id for tracker-level challenges (disputes.article_id is text). */
const DISINFO_TRACKER_ARTICLE_ID = 'disinfo-tracker';

export function DisinfoDisputeForm() {
  const [claimText, setClaimText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!claimText.trim() || !sourceUrl.trim()) return;
    setLoading(true);
    try {
      const res = await submitDispute({
        article_id: DISINFO_TRACKER_ARTICLE_ID,
        article_url: typeof window !== 'undefined' ? `${window.location.origin}/disinfo` : undefined,
        claim_text: claimText.trim(),
        source_url: sourceUrl.trim(),
      });
      if (res?.success) {
        setMessage('Submitted. Our team will review primary sources cited.');
        setClaimText('');
        setSourceUrl('');
      } else {
        setError('Could not submit. Try again later.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OsintCard className="mt-10 border border-white/10">
      <h2 className="font-display text-lg mb-2" style={{ color: 'var(--accent-gold)' }}>
        CHALLENGE A VERDICT
      </h2>
      <p className="font-mono text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        If you have primary-source evidence that contradicts our assessment, submit it here. Include a direct URL to
        the source. No account required.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-mono text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            Your claim / reasoning
          </label>
          <textarea
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
            required
            rows={4}
            className="w-full font-mono text-sm px-3 py-2 rounded-sm border bg-transparent resize-y"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div>
          <label className="block font-mono text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            Primary source URL
          </label>
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            required
            placeholder="https://..."
            className="w-full font-mono text-sm px-3 py-2 rounded-sm border bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        {error && (
          <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>
            {error}
          </p>
        )}
        {message && (
          <p className="font-mono text-xs" style={{ color: 'var(--accent-green)' }}>
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="font-mono text-sm px-4 py-2 border rounded-sm hover:opacity-90 disabled:opacity-50"
          style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
        >
          {loading ? 'Submitting…' : 'Submit challenge'}
        </button>
      </form>
    </OsintCard>
  );
}
