'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { articleUrlForDispute, normalizeDisputeUrl, DISPUTE_CLAIM_MAX } from '@/lib/dispute-url';

// Session-scoped cooldown: track which articleIds have had a dispute submitted this session
const SESSION_DISPUTES = new Set<string>();

interface ReactionBarProps {
  articleId: string;
  articleUrl: string | null;
}

export function ReactionBar({ articleId, articleUrl }: ReactionBarProps) {
  const [reactions, setReactions] = useState<Record<string, boolean>>({});
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeText, setDisputeText] = useState('');
  const [disputeSource, setDisputeSource] = useState('');
  const [disputeSubmitted, setDisputeSubmitted] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeSaving, setDisputeSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [alreadyDisputed] = useState(() => SESSION_DISPUTES.has(articleId));

  const toggle = (key: string) => setReactions((prev) => ({ ...prev, [key]: !prev[key] }));

  const copyLink = () => {
    if (articleUrl) {
      navigator.clipboard.writeText(articleUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const submitDispute = async () => {
    const claim = disputeText.trim();
    if (!claim || !disputeSource.trim() || disputeSaving) return;
    if (SESSION_DISPUTES.has(articleId)) return;
    setDisputeError(null);
    if (claim.length > DISPUTE_CLAIM_MAX) {
      setDisputeError(`Please keep the description under ${DISPUTE_CLAIM_MAX} characters.`);
      return;
    }
    // Same rule as the database CHECK: an http(s) URL; "https://" is added when no scheme was typed.
    const source = normalizeDisputeUrl(disputeSource);
    if (!source) {
      setDisputeError('Enter a valid source link starting with http:// or https://');
      return;
    }
    setDisputeSource(source);
    setDisputeSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('disputes').insert({
      article_id: articleId,
      article_url: articleUrlForDispute(articleUrl),
      claim_text: claim,
      source_url: source,
    });
    setDisputeSaving(false);
    if (error) {
      // Never report success for a rejected insert. Raw DB text stays in the console.
      console.error('[dispute] insert failed:', error.code, error.message);
      setDisputeError(
        error.code === '23514'
          ? 'The dispute was not accepted: check the source link and the description, then try again.'
          : 'The dispute could not be saved. Please try again later.',
      );
      return;
    }
    SESSION_DISPUTES.add(articleId);
    setDisputeSubmitted(true);
    setDisputeOpen(false);
  };

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {/* Verify source */}
        {articleUrl && (
          <a
            href={articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1px',
              padding: '3px 8px', border: '1px solid var(--border)',
              color: 'var(--accent-green)', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            ✓ VERIFY SOURCE ↗
          </a>
        )}

        {/* Bookmark */}
        <button
          type="button"
          onClick={() => toggle('bookmarked')}
          style={{
            fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1px',
            padding: '3px 8px', border: '1px solid',
            borderColor: reactions.bookmarked ? 'var(--accent-gold)' : 'var(--border)',
            color: reactions.bookmarked ? 'var(--accent-gold)' : 'var(--text-muted)',
            background: 'none', cursor: 'pointer',
          }}
        >
          {reactions.bookmarked ? '📌 SAVED' : '📌 SAVE'}
        </button>

        {/* Share */}
        <button
          type="button"
          onClick={copyLink}
          style={{
            fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1px',
            padding: '3px 8px', border: '1px solid var(--border)',
            color: copied ? 'var(--accent-green)' : 'var(--text-muted)',
            background: 'none', cursor: 'pointer',
          }}
        >
          {copied ? '✓ COPIED' : '↗ SHARE'}
        </button>

        {/* Dispute */}
        <button
          type="button"
          onClick={() => !alreadyDisputed && setDisputeOpen((v) => !v)}
          disabled={alreadyDisputed}
          style={{
            fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1px',
            padding: '3px 8px', border: '1px solid',
            borderColor: disputeOpen ? 'var(--accent-orange)' : 'var(--border)',
            color: disputeOpen ? 'var(--accent-orange)' : 'var(--text-muted)',
            background: 'none', cursor: alreadyDisputed ? 'not-allowed' : 'pointer',
            opacity: alreadyDisputed ? 0.4 : 1,
          }}
        >
          {alreadyDisputed ? '⚠ DISPUTED' : '⚠ DISPUTE'}
        </button>

        {disputeSubmitted && (
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-green)' }}>
            ✓ Dispute logged — thank you
          </span>
        )}
      </div>

      {disputeOpen && (
        <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--accent-orange)', background: 'rgba(232,135,74,0.05)' }}>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-orange)', letterSpacing: '1px', marginBottom: 8 }}>
            SUBMIT A FACTUAL DISPUTE — requires a source URL
          </div>
          <textarea
            value={disputeText}
            onChange={(e) => setDisputeText(e.target.value)}
            placeholder="Describe the specific factual inaccuracy..."
            style={{
              width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: 12,
              padding: 8, resize: 'vertical', minHeight: 60, boxSizing: 'border-box',
            }}
          />
          <input
            value={disputeSource}
            onChange={(e) => setDisputeSource(e.target.value)}
            placeholder="Source URL (required), e.g. https://…"
            inputMode="url"
            aria-invalid={disputeError ? true : undefined}
            style={{
              width: '100%', marginTop: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: 12,
              padding: 8, boxSizing: 'border-box',
            }}
          />
          {disputeError && (
            <p role="alert" style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-red)', marginTop: 6 }} data-testid="dispute-error">
              {disputeError}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={submitDispute}
              disabled={!disputeText.trim() || !disputeSource.trim() || disputeSaving}
              style={{
                fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1px',
                padding: '5px 14px', border: '1px solid var(--accent-orange)',
                color: 'var(--accent-orange)', background: 'none', cursor: 'pointer',
                opacity: (!disputeText.trim() || !disputeSource.trim()) ? 0.4 : 1,
              }}
            >
              {disputeSaving ? 'SUBMITTING…' : 'SUBMIT'}
            </button>
            <button
              type="button"
              onClick={() => setDisputeOpen(false)}
              style={{
                fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1px',
                padding: '5px 14px', border: '1px solid var(--border)',
                color: 'var(--text-muted)', background: 'none', cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
