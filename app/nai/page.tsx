'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { OsintCard } from '@/components/OsintCard';
import { TimelineScrubber } from '@/components/TimelineScrubber';
import { NaiScoreBadge } from '@/components/NaiScoreBadge';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { useNaiScores } from '@/hooks/useNaiScores';
import { useConflictDay } from '@/hooks/useConflictDay';
import { createClient } from '@/lib/supabase/client';
import type { CountryReport } from '@/types/supabase';

export default function NaiMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const maxConflictDay = useConflictDay() ?? 10;
  const [conflictDay, setConflictDay] = useState(10);
  const [selectedCountry, setSelectedCountry] = useState<CountryReport | null>(null);
  const { scores, loading, error } = useNaiScores(conflictDay);

  useEffect(() => {
    setConflictDay((prev) => {
      if (prev === 10) return maxConflictDay;
      if (prev > maxConflictDay) return maxConflictDay;
      return prev;
    });
  }, [maxConflictDay]);

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
    <div className="flex flex-col sm:flex-row" style={{ minHeight: 'calc(100vh - 44px)' }}>
      <div className="w-full flex-1 relative" style={{ minHeight: '40vh' }} ref={mapContainer} />
      <aside
        className="w-full sm:w-80 border-t sm:border-t-0 sm:border-l overflow-y-auto p-4 flex flex-col gap-4"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', maxHeight: '50vh' }}
      >
        <h2 className="font-display text-lg inline-flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          NAI RANKING
          <GlossaryTooltip
            term="NAI"
            definition={
              <>
                <strong style={{ color: 'var(--text-primary)' }}>Narrative Alignment Index (NAI)</strong> measures how closely a state&apos;s public diplomatic narrative aligns with US-led coalition objectives. Scores run 0–100.
                <br />• <strong>EXPRESSED (0–100)</strong>: Official government/diplomatic narrative alignment
                <br />• <strong>LATENT (0–100)</strong>: Underlying public sentiment and structural alignment
                <br />• <strong>GAP</strong>: Difference between expressed and latent — large gaps signal instability
                <br />• <strong>ALIGNED (65–100)</strong>: Active coalition partner
                <br />• <strong>STABLE (50–64)</strong>: Aligned but cautious
                <br />• <strong>TENSION (35–49)</strong>: Mixed signals, hedging
                <br />• <strong>FRACTURE (20–34)</strong>: Significant internal or external pressure
                <br />• <strong>INVERSION (&lt;20)</strong>: Expressed and latent diverging sharply
              </>
            }
          >
            <span className="font-mono text-sm cursor-help" style={{ color: 'var(--accent-gold)' }} aria-label="NAI definition">ⓘ</span>
          </GlossaryTooltip>
        </h2>
        <TimelineScrubber min={1} max={maxConflictDay} value={conflictDay} onChange={setConflictDay} />
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
                    const exact = await supabase
                      .from('country_reports')
                      .select('*')
                      .eq('country_code', s.country_code)
                      .eq('conflict_day', conflictDay)
                      .maybeSingle();
                    if (exact.data) {
                      setSelectedCountry(exact.data as CountryReport);
                      return;
                    }

                    const upToDay = await supabase
                      .from('country_reports')
                      .select('*')
                      .eq('country_code', s.country_code)
                      .lte('conflict_day', conflictDay)
                      .order('conflict_day', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    if (upToDay.data) {
                      setSelectedCountry(upToDay.data as CountryReport);
                      return;
                    }

                    const latest = await supabase
                      .from('country_reports')
                      .select('*')
                      .eq('country_code', s.country_code)
                      .order('conflict_day', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    setSelectedCountry((latest.data as CountryReport | null) ?? null);
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
