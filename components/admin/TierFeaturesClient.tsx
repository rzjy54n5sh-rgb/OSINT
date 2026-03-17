'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { updateFeatureFlag } from '@/lib/api/admin/config';
import type { TierFeature } from '@/types';

export function TierFeaturesClient({ initialFeatures }: { initialFeatures: TierFeature[] }) {
  const [features, setFeatures] = useState<TierFeature[]>(initialFeatures);
  const [token, setToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => setToken(session?.access_token ?? null));
  }, []);

  const toggle = (featureKey: string, tier: 'free' | 'informed' | 'professional', enabled: boolean) => {
    setFeatures((prev) =>
      prev.map((f) => {
        if (f.feature_key !== featureKey) return f;
        if (tier === 'free') return { ...f, free_access: enabled };
        if (tier === 'informed') return { ...f, informed_access: enabled };
        return { ...f, pro_access: enabled };
      })
    );
  };

  const getChanged = (): { featureKey: string; tier: string; enabled: boolean }[] => {
    const out: { featureKey: string; tier: string; enabled: boolean }[] = [];
    for (const f of features) {
      const orig = initialFeatures.find((o) => o.feature_key === f.feature_key);
      if (!orig) continue;
      if (f.free_access !== orig.free_access) out.push({ featureKey: f.feature_key, tier: 'free', enabled: f.free_access });
      if (f.informed_access !== orig.informed_access) out.push({ featureKey: f.feature_key, tier: 'informed', enabled: f.informed_access });
      if (f.pro_access !== orig.pro_access) out.push({ featureKey: f.feature_key, tier: 'professional', enabled: f.pro_access });
    }
    return out;
  };

  const changed = getChanged();
  const hasChanges = changed.length > 0;

  const handleSave = async () => {
    if (!token || !hasChanges) return;
    setSaving(true);
    for (const c of changed) {
      await updateFeatureFlag(c.featureKey, c.tier, c.enabled, token);
    }
    setSaving(false);
    window.location.reload();
  };

  return (
    <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
      <table className="w-full font-mono text-xs">
        <thead>
          <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
            <th className="text-left p-2">Feature</th>
            <th className="text-left p-2">Description</th>
            <th className="text-left p-2">Free</th>
            <th className="text-left p-2">Informed</th>
            <th className="text-left p-2">Professional</th>
          </tr>
        </thead>
        <tbody style={{ color: 'var(--text-secondary)' }}>
          {features.map((f) => (
            <tr key={f.feature_key}>
              <td className="p-2">{f.feature_key}</td>
              <td className="p-2">{f.description ?? '—'}</td>
              <td className="p-2">
                <button type="button" onClick={() => toggle(f.feature_key, 'free', !f.free_access)} className={`w-8 h-4 rounded-full border transition-colors ${f.free_access ? 'bg-green-600 border-green-600' : 'bg-gray-600 border-gray-500'}`} title={f.free_access ? 'On' : 'Off'} />
              </td>
              <td className="p-2">
                <button type="button" onClick={() => toggle(f.feature_key, 'informed', !f.informed_access)} className={`w-8 h-4 rounded-full border transition-colors ${f.informed_access ? 'bg-green-600 border-green-600' : 'bg-gray-600 border-gray-500'}`} title={f.informed_access ? 'On' : 'Off'} />
              </td>
              <td className="p-2">
                <button type="button" onClick={() => toggle(f.feature_key, 'professional', !f.pro_access)} className={`w-8 h-4 rounded-full border transition-colors ${f.pro_access ? 'bg-green-600 border-green-600' : 'bg-gray-600 border-gray-500'}`} title={f.pro_access ? 'On' : 'Off'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <button type="button" onClick={handleSave} disabled={!hasChanges || !!saving || !token} className="font-mono text-xs px-4 py-2 rounded border disabled:opacity-50" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
          Save changes
        </button>
      </div>
    </div>
  );
}
