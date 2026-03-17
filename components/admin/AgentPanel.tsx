'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAgentStore } from '@/stores/agent.store';
import { createClient } from '@/lib/supabase/client';
import type { AdminRole } from '@/types';

type AgentPanelProps = { role: AdminRole };

export default function AgentPanel({ role }: AgentPanelProps) {
  const pathname = usePathname();
  const {
    isOpen,
    togglePanel,
    setCurrentPage,
    conversationHistory,
    isLoading,
    pendingAction,
    sendMessage,
    confirmPendingAction,
    cancelPendingAction,
    clearConversation,
  } = useAgentStore();

  const [input, setInput] = useState('');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => setToken(session?.access_token ?? null));
  }, []);

  useEffect(() => {
    const base = pathname?.replace(/^\/admin\/?/, '') || 'dashboard';
    setCurrentPage(base || 'dashboard');
  }, [pathname, setCurrentPage]);

  const handleSend = async () => {
    const t = token ?? (await createClient().auth.getSession()).data.session?.access_token ?? null;
    if (!t || !input.trim()) return;
    await sendMessage(input.trim(), t);
    setInput('');
  };

  const handleConfirm = async () => {
    const t = token ?? (await createClient().auth.getSession()).data.session?.access_token ?? null;
    if (t) await confirmPendingAction(t);
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: isOpen ? 320 : 44,
          zIndex: 50,
          transition: 'width 0.25s ease',
          display: 'flex',
          flexDirection: 'row',
          background: isOpen ? '#0D1117' : 'transparent',
          boxShadow: isOpen ? '-4px 0 24px rgba(0,0,0,0.3)' : 'none',
          borderLeft: isOpen ? '1px solid rgba(107,33,168,0.35)' : 'none',
          backgroundColor: isOpen ? 'rgba(107,33,168,0.08)' : 'transparent',
        }}
      >
        {!isOpen ? (
          <button
            type="button"
            onClick={togglePanel}
            aria-label="Open AI Agent"
            style={{
              width: 44,
              minWidth: 44,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: 'rgba(107,33,168,0.2)',
              border: 'none',
              cursor: 'pointer',
              color: '#C084FC',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 10,
              letterSpacing: 1,
            }}
          >
            <span style={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap' }}>◈ AI</span>
          </button>
        ) : (
          <>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                background: '#0D1117',
                backgroundColor: 'rgba(107,33,168,0.08)',
              }}
            >
              <header
                style={{
                  padding: '12px 12px 12px 16px',
                  borderBottom: '1px solid rgba(107,33,168,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#C084FC', letterSpacing: 1 }}>
                  ◈ AI AGENT
                </span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: 'var(--text-muted)' }}>{role}</span>
                <button
                  type="button"
                  onClick={togglePanel}
                  aria-label="Close"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
                >
                  ×
                </button>
              </header>
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {conversationHistory.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '90%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: 11,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      ...(m.role === 'user'
                        ? { background: 'rgba(232,197,71,0.12)', color: 'var(--text-primary)' }
                        : { background: 'rgba(0,0,0,0.3)', color: 'var(--text-secondary)' }),
                    }}
                  >
                    {m.content}
                  </div>
                ))}
                {isLoading && (
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#C084FC' }}>
                    ◈ <span className="animate-pulse">...</span>
                  </div>
                )}
                {pendingAction && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      style={{
                        fontFamily: 'IBM Plex Mono',
                        fontSize: 11,
                        padding: '8px 12px',
                        background: 'var(--accent-gold)',
                        color: '#070A0F',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      ◆ Confirm action
                    </button>
                    <button
                      type="button"
                      onClick={cancelPendingAction}
                      style={{
                        fontFamily: 'IBM Plex Mono',
                        fontSize: 11,
                        padding: '8px 12px',
                        background: 'var(--text-muted)',
                        color: 'var(--bg)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <div
                style={{
                  padding: 12,
                  borderTop: '1px solid rgba(107,33,168,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Ask or instruct..."
                    style={{
                      flex: 1,
                      fontFamily: 'IBM Plex Mono',
                      fontSize: 11,
                      padding: '8px 10px',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    style={{
                      width: 36,
                      height: 36,
                      background: 'var(--accent-gold)',
                      color: '#070A0F',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    ▶
                  </button>
                </div>
                <button
                  type="button"
                  onClick={clearConversation}
                  style={{
                    fontFamily: 'IBM Plex Mono',
                    fontSize: 10,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  Clear conversation
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
