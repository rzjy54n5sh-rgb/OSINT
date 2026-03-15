'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

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
    if (!disputeText.trim() || !disputeSource.trim()) return;
    if (SESSION_DISPUTES.has(articleId)) return;
    SESSION_DISPUTES.add(articleId);
    const supabase = createClient();
    await supabase.from('disputes').insert({
      article_id: articleId,
      article_url: articleUrl,
      claim_text: disputeText.trim(),
      source_url: disputeSource.trim(),
    });
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
              fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1px',
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
            fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1px',
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
            fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1px',
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
            fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1px',
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
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-green)' }}>
            ✓ Dispute logged — thank you
          </span>
        )}
      </div>

      {disputeOpen && (
        <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--accent-orange)', background: 'rgba(232,135,74,0.05)' }}>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-orange)', letterSpacing: '1px', marginBottom: 8 }}>
            SUBMIT A FACTUAL DISPUTE — requires a source URL
          </div>
          <textarea
            value={disputeText}
            onChange={(e) => setDisputeText(e.target.value)}
            placeholder="Describe the specific factual inaccuracy..."
            style={{
              width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: 10,
              padding: 8, resize: 'vertical', minHeight: 60, boxSizing: 'border-box',
            }}
          />
          <input
            value={disputeSource}
            onChange={(e) => setDisputeSource(e.target.value)}
            placeholder="Source URL (required)"
            style={{
              width: '100%', marginTop: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: 10,
              padding: 8, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={submitDispute}
              disabled={!disputeText.trim() || !disputeSource.trim()}
              style={{
                fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1px',
                padding: '5px 14px', border: '1px solid var(--accent-orange)',
                color: 'var(--accent-orange)', background: 'none', cursor: 'pointer',
                opacity: (!disputeText.trim() || !disputeSource.trim()) ? 0.4 : 1,
              }}
            >
              SUBMIT
            </button>
            <button
              type="button"
              onClick={() => setDisputeOpen(false)}
              style={{
                fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1px',
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
