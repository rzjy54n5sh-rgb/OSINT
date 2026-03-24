'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface Notification {
  id: string;
  type: 'status_change' | 'past_due' | 'dispute';
  message: string;
  link?: string;
  timestamp: string;
}

export function AdminNotificationBanner() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const addNotification = useCallback((n: Notification) => {
    setNotifications((prev) => [n, ...prev].slice(0, 20));
    setToast(n.message);
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    // Subscribe to user status changes
    const statusChannel = supabase
      .channel('admin-user-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: 'status=neq.active' },
        (payload) => {
          const email = (payload.new as { email?: string }).email ?? 'Unknown';
          const status = (payload.new as { status?: string }).status ?? 'changed';
          addNotification({
            id: crypto.randomUUID(),
            type: 'status_change',
            message: `Account ${status}: ${email}`,
            link: `/admin/users?search=${encodeURIComponent(email)}`,
            timestamp: new Date().toISOString(),
          });
        }
      )
      .subscribe();

    // Subscribe to past due subscriptions
    const subChannel = supabase
      .channel('admin-sub-pastdue')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'subscriptions' },
        (payload) => {
          const newStatus = (payload.new as { status?: string }).status;
          if (newStatus === 'past_due') {
            const userId = (payload.new as { user_id?: string }).user_id ?? '';
            addNotification({
              id: crypto.randomUUID(),
              type: 'past_due',
              message: `Subscription past due: user ${userId.slice(0, 8)}...`,
              link: '/admin/subscriptions',
              timestamp: new Date().toISOString(),
            });
          }
        }
      )
      .subscribe();

    // Subscribe to new disputes
    const disputeChannel = supabase
      .channel('admin-disputes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'disputes' },
        (payload) => {
          const reason = (payload.new as { reason?: string }).reason ?? 'New dispute';
          addNotification({
            id: crypto.randomUUID(),
            type: 'dispute',
            message: `New dispute: ${reason.slice(0, 50)}`,
            link: '/admin/disputes',
            timestamp: new Date().toISOString(),
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(statusChannel);
      supabase.removeChannel(subChannel);
      supabase.removeChannel(disputeChannel);
    };
  }, [addNotification]);

  const unreadCount = notifications.length;
  const iconColor = unreadCount > 0 ? 'var(--accent-gold)' : 'var(--text-muted)';

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 9999,
            background: '#141A28',
            border: '1px solid var(--accent-gold)',
            padding: '12px 20px',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 12,
            color: 'var(--text-primary)',
            maxWidth: 360,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {toast}
        </div>
      )}

      {/* Bell icon */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setShowDropdown((prev) => !prev)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 14,
            color: iconColor,
          }}
          aria-label={`Notifications: ${unreadCount} unread`}
        >
          ◆ {unreadCount > 0 && (
            <span
              style={{
                background: 'var(--accent-red)',
                color: '#fff',
                borderRadius: '50%',
                padding: '1px 5px',
                fontSize: 11,
                fontWeight: 600,
                marginLeft: 2,
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {showDropdown && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              width: 340,
              maxHeight: 400,
              overflowY: 'auto',
              background: '#0C1018',
              border: '1px solid var(--border)',
              zIndex: 9998,
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                color: 'var(--accent-gold)',
                letterSpacing: '1.5px',
              }}
            >
              NOTIFICATIONS
            </div>
            {notifications.length === 0 && (
              <div
                style={{
                  padding: '20px 12px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                }}
              >
                No notifications
              </div>
            )}
            {notifications.map((n) => (
              <a
                key={n.id}
                href={n.link ?? '#'}
                style={{
                  display: 'block',
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--border)',
                  textDecoration: 'none',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
                onClick={() => setShowDropdown(false)}
              >
                <span
                  style={{
                    color:
                      n.type === 'dispute'
                        ? 'var(--accent-red)'
                        : n.type === 'past_due'
                        ? 'var(--accent-orange)'
                        : 'var(--accent-blue)',
                    marginRight: 6,
                  }}
                >
                  {n.type === 'dispute' ? '●' : n.type === 'past_due' ? '●' : '●'}
                </span>
                {n.message}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(n.timestamp).toLocaleTimeString()}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
