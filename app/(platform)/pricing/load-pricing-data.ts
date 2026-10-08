import { createClient, getUser } from '@/utils/supabase/server';
import type { Currency, PricingData } from '@/app/(platform)/pricing/pricing-types';

/**
 * Loader for the (currently unrendered) consumer price cards — moved out of page.tsx on
 * 2026-10-08 when /pricing became the founding-access page. Reads cookies (per-visitor currency
 * and login state), so a page that calls it is dynamic and must not be shared by the edge cache.
 * To re-enable price cards: render <PricingClient {...await loadPricingData()} /> from a dynamic route.
 */
function parsePrice(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') return Number.parseFloat(val) || 0;
  return 0;
}

export async function loadPricingData(): Promise<PricingData> {
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
  return { prices, features, preferredCurrency, isLoggedIn: !!user };
}
