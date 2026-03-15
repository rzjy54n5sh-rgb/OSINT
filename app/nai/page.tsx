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
import { PageBriefing } from '@/components/PageBriefing';
import { PageShareButton, buildNaiMapShareText } from '@/components/PageShareButton';
import { PageShareCard } from '@/components/PageShareCard';
import type { CountryReport } from '@/types/supabase';

const COUNTRY_COORDS: Record<string, [number, number]> = {
  IR: [53.688, 32.427], IL: [34.851, 31.046], IQ: [43.679, 33.223],
  YE: [47.586, 15.552], SA: [45.079, 23.885], AE: [53.847, 23.424],
  LB: [35.862, 33.854], EG: [30.802, 26.820], TR: [35.243, 38.964],
  RU: [105.318, 61.524], SY: [38.997, 34.802], JO: [36.238, 31.240],
  QA: [51.183, 25.354], KW: [47.481, 29.311], US: [-95.712, 37.090],
  GB: [-3.436, 55.378], FR: [2.349, 46.227], DE: [10.451, 51.166],
  CN: [104.195, 35.861], IN: [78.962, 20.594], PK: [69.345, 30.375],
};

const NAI_COLOR: Record<string, string> = {
  ALIGNED: '#4EC98A', STABLE: '#4A8FE8', TENSION: '#E8C547',
  FRACTURE: '#E8874A', INVERSION: '#E05252',
};

export default function NaiMapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const latestDay = useConflictDay();
  const [conflictDay, setConflictDay] = useState<number>(10);
  const [selectedCountry, setSelectedCountry] = useState<CountryReport | null>(null);
  const { scores, loading, error } = useNaiScores(conflictDay);

  useEffect(() => {
    if (latestDay != null) setConflictDay(latestDay);
  }, [latestDay]);

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

  useEffect(() => {
    if (!map.current || scores.length === 0) return;
    const addMarkers = () => {
      if (map.current!.getLayer('nai-circles')) map.current!.removeLayer('nai-circles');
      if (map.current!.getSource('nai-points')) map.current!.removeSource('nai-points');
      const features = scores
        .filter((s) => COUNTRY_COORDS[s.country_code])
        .map((s) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: COUNTRY_COORDS[s.country_code] },
          properties: {
            country_code: s.country_code,
            score: s.expressed_score,
            category: s.category,
            color: NAI_COLOR[s.category?.toUpperCase() ?? ''] ?? '#8A9BB5',
          },
        }));
      map.current!.addSource('nai-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });
      map.current!.addLayer({
        id: 'nai-circles',
        type: 'circle',
        source: 'nai-points',
        paint: {
          'circle-radius': 10,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#070A0F',
        },
      });
    };
    if (map.current.loaded()) {
      addMarkers();
    } else {
      map.current.once('load', addMarkers);
    }
  }, [scores]);

  return (
    <div>
      <PageBriefing
        title="NARRATIVE ALIGNMENT INDEX MAP"
        description="Each country is scored 0–100 on how closely its observable public behavior aligns with US-led coalition objectives. The score is calculated daily from official statements, media framing, social signals, and elite communications. It is an estimate based on public data — not a classified intelligence assessment."
        note="Click any country in the sidebar to view its full report. Use the day scrubber to compare alignment across conflict days. High scores mean public alignment — not necessarily private intent."
      />
      <div className="flex flex-col sm:flex-row" style={{ minHeight: 'calc(100vh - 44px)' }}>
      <div className="w-full flex-1 relative" style={{ minHeight: '40vh' }} ref={mapContainer} />
      <aside
        className="w-full sm:w-80 border-t sm:border-t-0 sm:border-l overflow-y-auto p-4 flex flex-col gap-4"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', maxHeight: '50vh' }}
      >
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h2 className="font-display text-lg inline-flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            NAI RANKING
          </h2>
          <PageShareCard
            label={`NAI MAP · DAY ${conflictDay ?? '—'}`}
            summary="Track how 29 countries are aligning with or diverging from US-led coalition objectives in real time."
          />
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
          <PageShareButton
            label="SHARE"
            getCopyText={() =>
              buildNaiMapShareText(
                conflictDay,
                selectedCountry?.country_code ?? undefined,
                selectedCountry?.nai_score ?? undefined,
                selectedCountry?.nai_category ?? undefined
              )
            }
          />
        </div>
        <TimelineScrubber min={1} max={latestDay ?? 10} value={conflictDay} onChange={setConflictDay} />
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
                  <NaiScoreBadge category={s.category} score={s.expressed_score} /> <span translate="no">{s.country_code}</span>
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
    </div>
  );
}
