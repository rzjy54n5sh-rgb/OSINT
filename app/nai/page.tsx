'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { OsintCard } from '@/components/OsintCard';
import { TimelineScrubber } from '@/components/TimelineScrubber';
import { NaiScoreBadge } from '@/components/NaiScoreBadge';
import { useNaiScores } from '@/hooks/useNaiScores';
import { createClient } from '@/lib/supabase/client';
import type { CountryReport } from '@/types/supabase';

export default function NaiMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [conflictDay, setConflictDay] = useState(10);
  const [selectedCountry, setSelectedCountry] = useState<CountryReport | null>(null);
  const { scores, loading, error } = useNaiScores(conflictDay);

  useEffect(() => {
    if (!mapContainer.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [44, 26],
      zoom: 2,
    });
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  return (
    <div className="flex h-[calc(100vh-44px)]">
      <div className="w-full flex-1 relative" ref={mapContainer} />
      <aside
        className="w-80 border-l overflow-y-auto p-4 flex flex-col gap-4"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        <h2 className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
          NAI RANKING
        </h2>
        <TimelineScrubber min={1} max={10} value={conflictDay} onChange={setConflictDay} />
        {loading && (
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
          </p>
        )}
        {error && (
          <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>
            [DATA UNAVAILABLE]
          </p>
        )}
        {!loading && !error && (
          <ul className="space-y-2">
            {scores.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = createClient();
                    const { data } = await supabase
                      .from('country_reports')
                      .select('*')
                      .eq('country_code', s.country_code)
                      .eq('conflict_day', conflictDay)
                      .single();
                    setSelectedCountry(data as CountryReport | null);
                  }}
                  className="w-full text-left font-mono text-xs py-1.5 px-2 border rounded-sm hover:border-border-bright transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <NaiScoreBadge category={s.category} score={s.expressed_score} /> {s.country_code}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {selectedCountry && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedCountry(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-lg w-full max-h-[80vh] overflow-y-auto">
          <OsintCard className="w-full">
            <h3 className="font-display text-xl" style={{ color: 'var(--text-primary)' }}>
              {selectedCountry.country_name ?? selectedCountry.country_code}
            </h3>
            <NaiScoreBadge
              category={selectedCountry.nai_category ?? '—'}
              score={selectedCountry.nai_score ?? undefined}
            />
            {selectedCountry.content_json && (
              <pre
                className="font-mono text-xs mt-4 whitespace-pre-wrap"
                style={{ color: 'var(--text-secondary)' }}
              >
                {JSON.stringify(selectedCountry.content_json, null, 2)}
              </pre>
            )}
          </OsintCard>
          </div>
        </div>
      )}
    </div>
  );
}
