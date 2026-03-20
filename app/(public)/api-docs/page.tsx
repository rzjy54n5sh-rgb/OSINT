import { getUser } from '@/utils/supabase/server';
import { ApiDocsClient } from '@/components/api-docs/ApiDocsClient';

export const metadata = {
  title: 'API Reference · MENA Intel Desk',
  description: 'REST API documentation for NAI, scenarios, country reports, disinformation tracker, and disputes.',
};

export default async function ApiDocsPage() {
  const user = await getUser();
  const isPro = user?.tier === 'professional';

  const envBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  const baseUrl = envBase
    ? `${envBase}/functions/v1/`
    : 'https://qmaszkkyukgiludcakjg.supabase.co/functions/v1/';

  return <ApiDocsClient isPro={isPro} baseUrl={baseUrl} />;
}
