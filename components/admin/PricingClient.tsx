'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { updatePricing } from '@/lib/api/admin/config';

type ConfigMap = Record<string, { value: unknown; description?: string; is_sensitive?: boolean }>;

const SECTIONS = [
  { title: 'Informed Plan', keys: ['price_informed_usd', 'price_informed_aed', 'price_informed_egp', 'stripe_price_id_informed_usd', 'stripe_price_id_informed_aed', 'stripe_price_id_informed_egp'] },
  { title: 'Professional Plan', keys: ['price_pro_usd', 'price_pro_aed', 'price_pro_egp', 'stripe_price_id_pro_usd', 'stripe_price_id_pro_aed', 'stripe_price_id_pro_egp'] },
  { title: 'Single Report', keys: ['price_report_usd', 'price_report_aed', 'price_report_egp', 'stripe_price_id_report_usd', 'stripe_price_id_report_aed', 'stripe_price_id_report_egp'] },
];

export function PricingClient({ initialConfig }: { initialConfig: ConfigMap }) {
  const [config, setConfig] = useState<ConfigMap>(initialConfig);
  const [saving, setSaving] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => setToken(session?.access_token ?? null));
  }, []);

  const getVal = (key: string) => {
    const v = config[key]?.value;
    return v == null ? '' : String(v);
  };

  const handleSave = async (keys: string[]) => {
    if (!token) return;
    setSaving(keys[0] ?? '');
    for (const key of keys) {
      const val = config[key]?.value;
      const str = val == null ? '' : String(val);
      try {
        await updatePricing(key, str, token);
      } catch (e) {
        console.error(e);
        alert((e as Error)?.message ?? 'Failed to update');
      }
    }
    setSaving(null);
    window.location.reload();
  };

  const updateLocal = (key: string, value: string) => {
    setConfig((c) => ({ ...c, [key]: { ...c[key], value } }));
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Trial days</h2>
        <input type="number" min={0} value={getVal('trial_days')} onChange={(e) => updateLocal('trial_days', e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border w-24 bg-transparent" style={{ borderColor: 'var(--border)' }} />
        <button type="button" onClick={() => handleSave(['trial_days'])} disabled={!token || !!saving} className="ml-2 font-mono text-xs px-3 py-1.5 rounded border" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
          Save
        </button>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.title} className="rounded border p-4" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-mono text-xs uppercase mb-4" style={{ color: 'var(--text-primary)' }}>{section.title}</h2>
          <div className="grid gap-4 font-mono text-xs">
            {section.keys.filter((k) => k.startsWith('price_')).map((key) => (
              <div key={key} className="flex items-center gap-4">
                <label className="w-32" style={{ color: 'var(--text-muted)' }}>{key.replace('price_', '').toUpperCase()}</label>
                <input type="text" value={getVal(key)} onChange={(e) => updateLocal(key, e.target.value)} className="px-2 py-1.5 rounded border w-24 bg-transparent" style={{ borderColor: 'var(--border)' }} />
              </div>
            ))}
            {section.keys.filter((k) => k.startsWith('stripe_price_id_')).map((key) => (
              <div key={key} className="flex items-center gap-4">
                <label className="w-40" style={{ color: 'var(--text-muted)' }}>Stripe Price ID ({key.replace('stripe_price_id_', '')})</label>
                <input type="text" value={getVal(key)} onChange={(e) => updateLocal(key, e.target.value)} placeholder="price_xxx" className="px-2 py-1.5 rounded border flex-1 max-w-xs bg-transparent" style={{ borderColor: 'var(--border)' }} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => handleSave(section.keys)} disabled={!token || !!saving} className="mt-4 font-mono text-xs px-3 py-1.5 rounded border" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
            Save {section.title}
          </button>
        </div>
      ))}
    </div>
  );
}
