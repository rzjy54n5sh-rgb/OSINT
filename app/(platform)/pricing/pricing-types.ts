/**
 * Types for the consumer price cards (PricingClient). Kept separate from page.tsx because the
 * public /pricing page no longer renders PricingClient (shop-window pass, 2026-10-08: consumer
 * prices are deferred). The Stripe checkout path stays in PricingClient.tsx, unrendered, so it can
 * be re-enabled by an operator decision without rebuilding it.
 */
export type Currency = 'usd' | 'aed' | 'egp';

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
