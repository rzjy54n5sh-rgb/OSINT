import { redirect } from 'next/navigation';
import { getUser } from '@/utils/supabase/server';
import { createClient } from '@/utils/supabase/server';
import { AccountClient } from '@/app/(platform)/account/AccountClient';

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirect=/account');

  const supabase = await createClient();

  const [subResult, keysResult, configResult] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    user.tier === 'professional'
      ? supabase.from('api_keys').select('id, key_prefix, name, last_used_at, request_count, is_revoked, revoked_at, created_at').eq('user_id', user.id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; key_prefix: string; name: string; last_used_at?: string; request_count: number; is_revoked: boolean; revoked_at?: string; created_at: string }[] }),
    supabase.from('platform_config').select('value').eq('key', 'max_api_keys_per_user').maybeSingle(),
  ]);

  const subscription = subResult.data;
  const apiKeys = (keysResult.data ?? []) as { id: string; key_prefix: string; name: string; last_used_at?: string; request_count: number; is_revoked: boolean; revoked_at?: string; created_at: string }[];
  const maxApiKeys = configResult.data?.value != null ? Number(configResult.data.value) : 5;

  return (
    <AccountClient
      user={user}
      subscription={subscription as import('@/types').Subscription | null}
      apiKeys={apiKeys as import('@/types').ApiKey[]}
      maxApiKeys={maxApiKeys}
    />
  );
}
