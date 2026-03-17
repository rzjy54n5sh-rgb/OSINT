import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { PricingClient } from '@/app/(platform)/pricing/PricingClient';

type Currency = 'usd' | 'aed' | 'egp';

export type PricesByCurrency = Record<Currency, number>;

export type PricingData = {
  prices: {
    informed: PricesByCurrency;
    professional: PricesByCurrency;
    report: PricesByCurrency;
  };
  features: { feature_key: string; description: string | null; free_access: boolean; informed_access: boolean; pro_access: boolean }[];
  preferredCurrency: Currency;
  isLoggedIn: boolean;
};

function parsePrice(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') return Number.parseFloat(val) || 0;
  return 0;
}

export default async function PricingPage() {
  const supabase = await createClient();
  const user = await getUser();

  const [configResult, featuresResult] = await Promise.all([
    supabase.from('platform_config').select('key, value').like('key', 'price_%'),
    supabase.from('tier_features').select('feature_key, description, free_access, informed_access, pro_access').order('feature_key'),
  ]);

  const rows = (configResult.data ?? []) as { key: string; value: unknown }[];
  const priceMap: Record<string, number> = {};
  for (const r of rows) {
    priceMap[r.key] = parsePrice(r.value);
  }

  const prices: PricingData['prices'] = {
    informed: {
      usd: priceMap['price_informed_usd'] ?? 0,
      aed: priceMap['price_informed_aed'] ?? 0,
      egp: priceMap['price_informed_egp'] ?? 0,
    },
    professional: {
      usd: priceMap['price_pro_usd'] ?? 0,
      aed: priceMap['price_pro_aed'] ?? 0,
      egp: priceMap['price_pro_egp'] ?? 0,
    },
    report: {
      usd: priceMap['price_report_usd'] ?? 0,
      aed: priceMap['price_report_aed'] ?? 0,
      egp: priceMap['price_report_egp'] ?? 0,
    },
  };

  const features = (featuresResult.data ?? []) as PricingData['features'];
  const preferredCurrency: Currency = (user?.preferred_currency ?? 'usd');
  const isLoggedIn = !!user;

  return (
    <PricingClient
      prices={prices}
      features={features}
      preferredCurrency={preferredCurrency}
      isLoggedIn={isLoggedIn}
    />
  );
}
