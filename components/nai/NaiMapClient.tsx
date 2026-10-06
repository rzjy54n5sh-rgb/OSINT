'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { OsintCard } from '@/components/OsintCard';
import { TimelineScrubber } from '@/components/TimelineScrubber';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { PageBriefing } from '@/components/PageBriefing';
import { PageShareButton, buildNaiMapShareText } from '@/components/PageShareButton';
import { PageShareCard } from '@/components/PageShareCard';
import { useI18n } from '@/components/I18nProvider';
import { NaiV2CategoryBadge } from '@/components/nai/NaiV2CategoryBadge';
import { NaiV2Evidence } from '@/components/nai/NaiV2Evidence';
import { NaiArchiveToggle } from '@/components/nai/NaiArchiveToggle';
import {
  NAI_V2_ARCHIVE_NOTE,
  NAI_V2_CATEGORY_DEFS,
  NAI_V2_COLOR,
  NAI_V2_DEFINITION,
  NAI_V2_EMPTY_TEXT,
  NAI_V2_LOCKED_COLOR,
  NAI_V2_SCALE_TEXT,
  formatBand,
  formatGap,
  type NaiV2View,
} from '@/lib/nai-v2';

const COUNTRY_COORDS: Record<string, [number, number]> = {
  IR: [53.688, 32.427], IL: [34.851, 31.046], IQ: [43.679, 33.223],
  YE: [47.586, 15.552], SA: [45.079, 23.885], AE: [53.847, 23.424],
  LB: [35.862, 33.854], EG: [30.802, 26.820], TR: [35.243, 38.964],
  RU: [105.318, 61.524], SY: [38.997, 34.802], JO: [36.238, 31.240],
  QA: [51.183, 25.354], KW: [47.481, 29.311], US: [-95.712, 37.090],
  GB: [-3.436, 55.378], FR: [2.349, 46.227], DE: [10.451, 51.166],
  CN: [104.195, 35.861], IN: [78.962, 20.594], PK: [69.345, 30.375],
};

type NaiMapClientProps = {
  /** nai_scores_v2 rows for `conflictDay`, tier-redacted on the server. */
  rows: NaiV2View[];
  conflictDay: number;
  /** Latest conflict_day present in nai_scores_v2 (null = no War Posture rows yet). */
  latestDay: number | null;
  /** First conflict_day present in nai_scores_v2. */
  firstDay: number | null;
  hasLatentAccess: boolean;
  hasGapAccess: boolean;
  conflictDayBadge?: ReactNode;
};

function markerColor(r: NaiV2View): string {
  if (r.categoryLocked || r.category === null) return NAI_V2_LOCKED_COLOR;
  return NAI_V2_COLOR[r.category];
}

function NaiV2Legend() {
  return (
    <>
      <strong style={{ color: 'var(--text-primary)' }}>Narrative Alignment Index (NAI) — War Posture</strong>:{' '}
      whether a state&apos;s official war posture and its society&apos;s posture point the same way. Both are scored
      on one party-neutral scale: {NAI_V2_SCALE_TEXT}.
      <br />• <strong>EXPRESSED (0–100)</strong>: the official narrative&apos;s position on continuing hostilities
      <br />• <strong>LATENT (band)</strong>: the same scale for the population and non-government elites, stored as
      a low–high band; empty when there is no evidence
      <br />• <strong>GAP</strong>: expressed minus the band midpoint (signed)
      {NAI_V2_CATEGORY_DEFS.map((d) => (
        <span key={d.category}>
          <br />• <strong style={{ color: NAI_V2_COLOR[d.category] }}>{d.category}</strong>: {d.text}
        </span>
      ))}
      <br />
      Thresholds 10/20/30 and the midpoint 50 are conventions, not empirical findings. {NAI_V2_ARCHIVE_NOTE}
    </>
  );
}

export function NaiMapClient({
  rows,
  conflictDay,
  latestDay,
  firstDay,
  hasLatentAccess,
  hasGapAccess,
  conflictDayBadge,
}: NaiMapClientProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const selected = useMemo(() => rows.find((r) => r.country_code === selectedCode) ?? null, [rows, selectedCode]);
  const hasData = latestDay != null;

  const setConflictDay = (day: number) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('day', String(day));
    router.push(`/nai?${next.toString()}`);
  };

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
    const m = map.current;
    if (!m) return;
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const code = e.features?.[0]?.properties?.country_code;
      if (typeof code === 'string') setSelectedCode(code);
    };
    const setPointer = () => {
      m.getCanvas().style.cursor = 'pointer';
    };
    const clearPointer = () => {
      m.getCanvas().style.cursor = '';
    };
    const addMarkers = () => {
      if (m.getLayer('nai-circles')) m.removeLayer('nai-circles');
      if (m.getSource('nai-points')) m.removeSource('nai-points');
      if (rows.length === 0) return;
      const features = rows
        .filter((r) => COUNTRY_COORDS[r.country_code])
        .map((r) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: COUNTRY_COORDS[r.country_code] },
          properties: {
            country_code: r.country_code,
            category: r.categoryLocked ? 'LOCKED' : (r.category ?? 'LOCKED'),
            color: markerColor(r),
          },
        }));
      m.addSource('nai-points', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      m.addLayer({
        id: 'nai-circles',
        type: 'circle',
        source: 'nai-points',
        paint: {
          'circle-radius': 10,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#8A9BB5',
        },
      });
      m.on('click', 'nai-circles', onClick);
      m.on('mouseenter', 'nai-circles', setPointer);
      m.on('mouseleave', 'nai-circles', clearPointer);
    };
    if (m.loaded()) addMarkers();
    else m.once('load', addMarkers);
    return () => {
      m.off('click', 'nai-circles', onClick);
      m.off('mouseenter', 'nai-circles', setPointer);
      m.off('mouseleave', 'nai-circles', clearPointer);
    };
  }, [rows]);

  const shareSummary = `Track whether the official war posture of 20 tracked countries matches their societies' posture — one party-neutral scale (0 = immediate ceasefire, 100 = continue or escalate), sources cited per country.`;

  return (
    <div>
      <PageBriefing
        title={t('naiMapHeading')}
        description="War Posture NAI: each country's official narrative is scored 0–100 on one party-neutral question — the position on continuing hostilities (0 = demands immediate unconditional ceasefire, 50 = conditional or ambivalent, 100 = backs continuing or escalating military action, by any party). Society (population and non-government elites) is scored on the same scale as a band, or left empty when there is no evidence. The category shows whether government and society point the same way."
        note="Every score cites its sources. Grey means insufficient evidence for the latent position — no category is guessed. Days 1–35 used a retired, non-comparable method and are only available under the archived toggle."
      />
      <div className="px-4 max-w-6xl mx-auto w-full">
        <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
          {t('naiMapHeading')}
        </h1>
        {conflictDayBadge}
      </div>
      <div className="flex flex-col sm:flex-row" style={{ minHeight: 'calc(100vh - 44px)' }}>
        <div className="w-full flex-1 relative" style={{ minHeight: '40vh' }}>
          <div className="absolute inset-0" ref={mapContainer} />
          <div
            className="absolute left-2 bottom-2 z-10 font-mono text-[10px] p-2 rounded-sm flex flex-col gap-0.5"
            style={{ background: 'rgba(7,10,15,0.85)', color: 'var(--text-secondary)' }}
            data-testid="nai-legend"
          >
            {NAI_V2_CATEGORY_DEFS.map((d) => (
              <span key={d.category} className="inline-flex items-center gap-1" translate="no">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: NAI_V2_COLOR[d.category] }} />
                {d.category}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border"
                style={{ background: NAI_V2_LOCKED_COLOR, borderColor: '#8A9BB5' }}
              />
              LOCKED (tier)
            </span>
          </div>
        </div>
        <aside
          className="w-full sm:w-80 border-t sm:border-t-0 sm:border-l overflow-y-auto p-4 flex flex-col gap-4"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', maxHeight: '50vh' }}
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h2 className="font-display text-lg inline-flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              NAI · WAR POSTURE
            </h2>
            <PageShareCard label={`NAI WAR POSTURE · DAY ${conflictDay ?? '—'}`} summary={shareSummary} />
            <GlossaryTooltip term="NAI" definition={<NaiV2Legend />}>
              <span className="font-mono text-sm cursor-help" style={{ color: 'var(--accent-gold)' }} aria-label="NAI definition">
                ⓘ
              </span>
            </GlossaryTooltip>
            <PageShareButton
              label="SHARE"
              getCopyText={() =>
                buildNaiMapShareText(
                  conflictDay,
                  selected?.country_code ?? undefined,
                  selected?.expressed_score ?? undefined,
                  selected?.category ?? undefined,
                )
              }
            />
          </div>
          <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {NAI_V2_DEFINITION} {NAI_V2_SCALE_TEXT}.
          </p>

          {!hasData && (
            <p className="font-mono text-xs border px-3 py-2" style={{ color: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' }} data-testid="nai-v2-empty">
              {NAI_V2_EMPTY_TEXT}
            </p>
          )}

          {hasData && (
            <TimelineScrubber
              min={firstDay ?? latestDay}
              max={latestDay}
              value={Math.min(Math.max(conflictDay, firstDay ?? latestDay), latestDay)}
              onChange={setConflictDay}
            />
          )}
          {hasData && rows.length === 0 && (
            <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }} data-testid="nai-v2-no-day">
              No War Posture rows for Day {conflictDay}. The series covers Day {firstDay ?? '—'} to Day {latestDay}.
              {conflictDay <= 35 ? ' Days 1–35 exist only in the archived, non-comparable method below.' : ''}
            </p>
          )}

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={`${r.country_code}-${r.conflict_day}`}>
                <button
                  type="button"
                  onClick={() => setSelectedCode(r.country_code)}
                  className="w-full text-left font-mono text-xs py-1.5 px-2 border rounded-sm hover:border-border-bright transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span translate="no" style={{ color: 'var(--text-primary)' }}>{r.country_code}</span>
                    <NaiV2CategoryBadge category={r.category} locked={r.categoryLocked} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 items-center" style={{ color: 'var(--text-muted)' }}>
                    <span translate="no">EXP {r.expressed_score ?? '—'}</span>
                    <span className="hidden sm:inline-flex items-center gap-1">
                      <span className="text-[11px] uppercase tracking-wide">ΔEXP</span>
                      {/* neutral colour: a move toward escalation or ceasefire is not "good" or "bad" */}
                      <span translate="no">{r.delta === null ? '—' : formatGap(r.delta)}</span>
                    </span>
                    {hasLatentAccess ? (
                      <span translate="no">LAT {formatBand(r.latent_low, r.latent_high)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="blur-sm select-none">—</span>
                        <PaywallOverlay requiredTier="informed" featureName="NAI Latent Band" compact />
                      </span>
                    )}
                    {hasGapAccess ? (
                      <span translate="no">GAP {formatGap(r.gap)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <span className="blur-sm select-none">—</span>
                        <PaywallOverlay requiredTier="informed" featureName="NAI Gap Analysis" compact />
                      </span>
                    )}
                    <span translate="no">CONF {r.confidence.toUpperCase()}</span>
                    <span translate="no">{r.sources.length} SRC</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {rows.length > 0 && (
            <p className="mt-3 font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              ΔEXP = change in expressed score vs the previous War Posture day present
              {rows[0]?.prevDay != null ? ` (Day ${rows[0].prevDay})` : ' (none yet)'}. Click a country for sources.
            </p>
          )}
          <NaiArchiveToggle />
        </aside>
        {selected && (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCode(null)}
          >
            <div onClick={(e) => e.stopPropagation()} className="max-w-lg w-full max-h-[80vh] overflow-y-auto">
              <OsintCard className="w-full">
                <h3 className="font-display text-xl" style={{ color: 'var(--text-primary)' }} translate="no">
                  {selected.country_code} · DAY {selected.conflict_day}
                </h3>
                <div className="mt-2">
                  <NaiV2CategoryBadge category={selected.category} locked={selected.categoryLocked} />
                </div>
                <dl className="font-mono text-xs mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <dt style={{ color: 'var(--text-muted)' }}>EXPRESSED</dt>
                  <dd translate="no">{selected.expressed_score ?? '— (no evidence)'}</dd>
                  {selected.expressed_basis && (
                    <>
                      <dt style={{ color: 'var(--text-muted)' }}>BASIS</dt>
                      <dd>{selected.expressed_basis}</dd>
                    </>
                  )}
                  <dt style={{ color: 'var(--text-muted)' }}>LATENT</dt>
                  <dd translate="no">
                    {selected.latentLocked
                      ? 'Informed tier'
                      : selected.latent_low === null
                        ? '— (no evidence)'
                        : formatBand(selected.latent_low, selected.latent_high)}
                  </dd>
                  {selected.latent_basis && (
                    <>
                      <dt style={{ color: 'var(--text-muted)' }}>BASIS</dt>
                      <dd>{selected.latent_basis}</dd>
                    </>
                  )}
                  <dt style={{ color: 'var(--text-muted)' }}>GAP</dt>
                  <dd translate="no">{hasGapAccess ? formatGap(selected.gap) : 'Informed tier'}</dd>
                </dl>
                <div className="mt-3">
                  <NaiV2Evidence row={selected} />
                </div>
                <p className="font-mono text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
                  <Link href={`/countries/${selected.country_code.toLowerCase()}`} style={{ color: 'var(--accent-gold)' }}>
                    View full report →
                  </Link>
                </p>
              </OsintCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
