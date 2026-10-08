'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { UserTier } from '@/types';

export type ViewerProfile = { profileTier: UserTier | null; isAdmin: boolean };

/**
 * One users + admin_users lookup per signed-in user, shared by every consumer on the page
 * (CommandHeader, useViewerTier callers). Before, each consumer fetched both rows twice at mount
 * (eager load + INITIAL_SESSION). Reused for 30 s, keyed by user id.
 */
let shared: { uid: string; at: number; promise: Promise<ViewerProfile> } | null = null;
const SHARE_MS = 30_000;

export function resolveViewerProfile(supabase: SupabaseClient, uid: string): Promise<ViewerProfile> {
  if (shared && shared.uid === uid && Date.now() - shared.at < SHARE_MS) return shared.promise;
  const promise = Promise.all([
    supabase.from('users').select('tier').eq('id', uid).maybeSingle(),
    supabase.from('admin_users').select('id').eq('user_id', uid).eq('is_active', true).maybeSingle(),
  ]).then(([profileRes, adminRes]) => ({
    profileTier: ((profileRes.data as { tier?: UserTier } | null)?.tier ?? null) as UserTier | null,
    isAdmin: !!adminRes.data,
  }));
  shared = { uid, at: Date.now(), promise };
  promise.catch(() => {
    if (shared?.promise === promise) shared = null;
  });
  return promise;
}

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
 * `/api/viewer/*` routes and the viewer_* RPCs re-check the session before returning anything locked.
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
        const { profileTier, isAdmin } = await resolveViewerProfile(supabase, uid);
        if (cancelled) return;
        if (!profileTier) setTier(null);
        else setTier(isAdmin ? 'professional' : profileTier);
      } catch {
        if (!cancelled) setTier(null);
      }
    };
    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // INITIAL_SESSION duplicates the eager load() above. For later events, defer: auth-js invokes
      // this callback while holding its auth lock, and load() calls getSession(), which waits for
      // that lock (deadlock with a stored session).
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') shared = null;
      setTimeout(() => void load(), 0);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return tier;
}
