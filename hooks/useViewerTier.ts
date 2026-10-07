'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UserTier } from '@/types';

/**
 * The signed-in visitor's tier, resolved in the browser.
 *
 * Public pages are cached at the edge and rendered for an anonymous visitor (see
 * utils/supabase/server.ts → createPublicClient), so anything that depends on the visitor is
 * resolved after hydration. Returns `undefined` while loading, `null` for anonymous visitors.
 * Mirrors the server's getUser(): no profile row → anonymous; an active admin counts as
 * 'professional'.
 *
 * This value only decides what to ASK for. Paid data is never trusted to it: the gated
 * `/api/viewer/*` routes re-check the session on the server before returning anything locked.
 * For anonymous visitors getSession() reads local cookies only (no network request).
 */
export function useViewerTier(): UserTier | null | undefined {
  const [tier, setTier] = useState<UserTier | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const load = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) {
          if (!cancelled) setTier(null);
          return;
        }
        const [profileRes, adminRes] = await Promise.all([
          supabase.from('users').select('tier').eq('id', uid).maybeSingle(),
          supabase.from('admin_users').select('id').eq('user_id', uid).eq('is_active', true).maybeSingle(),
        ]);
        if (cancelled) return;
        const profileTier = (profileRes.data as { tier?: UserTier } | null)?.tier ?? null;
        if (!profileTier) setTier(null);
        else setTier(adminRes.data ? 'professional' : profileTier);
      } catch {
        if (!cancelled) setTier(null);
      }
    };
    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      // Deferred: auth-js invokes this callback while holding its auth lock, and load() calls
      // getSession(), which waits for that lock (deadlock with a stored session).
      setTimeout(() => void load(), 0);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return tier;
}
