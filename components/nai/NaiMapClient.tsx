'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TimelineScrubber } from '@/components/TimelineScrubber';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { PageBriefing } from '@/components/PageBriefing';
import { PageShareButton, buildNaiMapShareText } from '@/components/PageShareButton';
import { PageShareCard } from '@/components/PageShareCard';
import { useI18n } from '@/components/I18nProvider';
import { NaiV2CategoryBadge } from '@/components/nai/NaiV2CategoryBadge';
import { NaiV2Evidence } from '@/components/nai/NaiV2Evidence';
import { NaiPostureLabel } from '@/components/nai/NaiPostureLabel';
import { NaiArchiveToggle } from '@/components/nai/NaiArchiveToggle';
import { NaiDialog } from '@/components/nai/NaiDialog';
import { CountryFlag } from '@/components/CountryFlag';
import { NO_SOURCED_DATA_TEXT, TRACKED_COUNTRY_CODES } from '@/lib/countries';
import {
  NAI_POSTURE_COLOR,
  NAI_POSTURE_HEADING,
  NAI_POSTURE_LABELS,
  NAI_POSTURE_LEGEND_TEXT,
  NAI_POSTURE_NOTE,
  NAI_V2_ARCHIVE_NOTE,
  NAI_V2_CATEGORY_DEFS,
  NAI_V2_COLOR,
  NAI_V2_DEFINITION,
  NAI_V2_EMPTY_TEXT,
  NAI_V2_LOCKED_COLOR,
  NAI_V2_NODATA_COLOR,
  NAI_V2_SCALE_TEXT,
  formatBand,
  formatGap,
  postureColor,
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
  // Horn of Africa & Red Sea theatre (ruling 2026-10-07)
  ET: [40.490, 9.145], ER: [39.782, 15.179], SD: [30.218, 12.863], SO: [46.200, 5.152], DJ: [42.590, 11.825],
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
  // UNSCORABLE (latent evidence insufficient): colour by the official posture (derived from E)
  // instead of flat grey. Any other category keeps its category colour. No E => stays grey.
  if (r.category === 'UNSCORABLE') return postureColor(r.expressed_score) ?? NAI_V2_COLOR.UNSCORABLE;
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
      <br />• <strong>{NAI_POSTURE_HEADING}</strong>: {NAI_POSTURE_NOTE}
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
  // Tracked countries (25) with no War Posture row for this day: shown as "No sourced data", never scored.
  const noData = useMemo(
    () => (rows.length === 0 ? [] : TRACKED_COUNTRY_CODES.filter((c) => !rows.some((r) => r.country_code === c))),
    [rows],
  );
  const selectedNoData = selectedCode != null && noData.includes(selectedCode) ? selectedCode : null;
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
      const scored = rows
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
      const unscored = noData
        .filter((c) => COUNTRY_COORDS[c])
        .map((c) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: COUNTRY_COORDS[c] },
          properties: { country_code: c, category: 'NODATA', color: NAI_V2_NODATA_COLOR },
        }));
      const features = [...scored, ...unscored];
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
  }, [rows, noData]);

  const shareSummary = `Track whether the official war posture of ${TRACKED_COUNTRY_CODES.length} tracked countries matches their societies' posture — one party-neutral scale (0 = immediate ceasefire, 100 = continue or escalate), sources cited per country.`;

  return (
    <div>
      <PageBriefing
        title={t('naiMapHeading')}
        description="War Posture NAI: each country's official narrative is scored 0–100 on one party-neutral question — the position on continuing hostilities (0 = demands immediate unconditional ceasefire, 50 = conditional or ambivalent, 100 = backs continuing or escalating military action, by any party). Society (population and non-government elites) is scored on the same scale as a band, or left empty when there is no evidence. The category shows whether government and society point the same way."
        note="Every score cites its sources. UNSCORABLE (grey category) means no single category can be assigned: either there is no admissible evidence for society's position, or the latent band spans more than one category. No category is guessed; the map then colours the country by its official posture. Days 1–35 used a retired, non-comparable method and are only available under the archived toggle."
      />
      <div className="px-4 max-w-6xl mx-auto w-full">
        <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
          {t('naiMapHeading')}
        </h1>
        {conflictDayBadge}
      </div>
      <div className="flex flex-col sm:flex-row" style={{ minHeight: 'calc(100vh - 44px)' }}>
        <div className="w-full flex-1 relative" style={{ minHeight: '40vh' }}>
          {/* Inline position: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which overrides the
              Tailwind `absolute` class and collapses the map to 0px height (map rendered but invisible). */}
          <div className="absolute inset-0" style={{ position: 'absolute' }} ref={mapContainer} />
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
            {noData.length > 0 && (
              <span className="inline-flex items-center gap-1" data-testid="nai-nodata-legend">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full border"
                  style={{ background: NAI_V2_NODATA_COLOR, borderColor: '#8A9BB5' }}
                />
                {NO_SOURCED_DATA_TEXT.toUpperCase()}
              </span>
            )}
            <span className="mt-1" style={{ color: 'var(--text-muted)' }} data-testid="nai-posture-legend">
              {NAI_POSTURE_LEGEND_TEXT}
            </span>
            {NAI_POSTURE_LABELS.map((l) => (
              <span key={l} className="inline-flex items-center gap-1" translate="no">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full border"
                  style={{ background: NAI_POSTURE_COLOR[l], borderColor: '#8A9BB5' }}
                />
                {l}
              </span>
            ))}
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
              <li
                key={`${r.country_code}-${r.conflict_day}`}
                className="font-mono text-xs border rounded-sm hover:border-border-bright transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                {/* Only the summary is the button; paywall links sit OUTSIDE it (no nested interactive). */}
                <button
                  type="button"
                  onClick={() => setSelectedCode(r.country_code)}
                  className="w-full text-left py-1.5 px-2 min-h-[44px]"
                  aria-haspopup="dialog"
                  aria-label={`Open War Posture details for ${r.country_code}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span translate="no" style={{ color: 'var(--text-primary)' }}>{r.country_code}</span>
                    <NaiV2CategoryBadge category={r.category} locked={r.categoryLocked} latentEvidence={r.latentEvidence} expressed={r.expressed_score} showUnscorableText={false} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 items-center" style={{ color: 'var(--text-muted)' }}>
                    <span translate="no">EXP {r.expressed_score ?? '—'}</span>
                    <NaiPostureLabel expressed={r.expressed_score} />
                    <span className="hidden sm:inline-flex items-center gap-1">
                      <span className="text-[11px] uppercase tracking-wide">ΔEXP</span>
                      {/* neutral colour: a move toward escalation or ceasefire is not "good" or "bad" */}
                      <span translate="no">{r.delta === null ? '—' : formatGap(r.delta)}</span>
                    </span>
                  </div>
                </button>
                <div className="px-2 pb-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center" style={{ color: 'var(--text-muted)' }}>
                  {hasLatentAccess ? (
                    <span translate="no">LAT {r.latent_low === null ? 'no admissible evidence' : formatBand(r.latent_low, r.latent_high)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <span className="blur-sm select-none" aria-hidden="true">—</span>
                      <PaywallOverlay requiredTier="informed" featureName="NAI Latent Band" compact />
                    </span>
                  )}
                  {hasGapAccess ? (
                    <span translate="no">GAP {formatGap(r.gap)}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <span className="blur-sm select-none" aria-hidden="true">—</span>
                      <PaywallOverlay requiredTier="informed" featureName="NAI Gap Analysis" compact />
                    </span>
                  )}
                  <span translate="no">CONF {r.confidence.toUpperCase()}</span>
                  <span
                    translate="no"
                    title={
                      r.hiddenLatentSourceCount > 0
                        ? `${r.sources.length} expressed-score source(s) shown; ${r.hiddenLatentSourceCount} latent source(s) on Informed tier`
                        : undefined
                    }
                  >
                    {r.sources.length} SRC{r.hiddenLatentSourceCount > 0 ? ` (+${r.hiddenLatentSourceCount} latent, locked)` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {noData.length > 0 && (
            <ul className="space-y-2" data-testid="nai-nodata-list" aria-label="Tracked countries with no sourced data">
              {noData.map((code) => (
                <li key={`nodata-${code}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedCode(code)}
                    aria-haspopup="dialog"
                    className="w-full text-left font-mono text-xs py-1.5 px-2 min-h-[44px] border rounded-sm hover:border-border-bright transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <CountryFlag code={code} />
                      <span>{NO_SOURCED_DATA_TEXT}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {rows.length > 0 && (
            <p className="mt-3 font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              ΔEXP = change in expressed score vs the previous War Posture day present
              {rows[0]?.prevDay != null ? ` (Day ${rows[0].prevDay})` : ' (none yet)'}. Click a country for sources.
            </p>
          )}
          <NaiArchiveToggle />
        </aside>
        {selectedNoData && (
          <NaiDialog
            title={
              <>
                <CountryFlag code={selectedNoData} /> · DAY {conflictDay}
              </>
            }
            onClose={() => setSelectedCode(null)}
          >
            <p className="font-mono text-xs mt-3" style={{ color: 'var(--text-secondary)' }} data-testid="nai-nodata-detail">
              No sourced data available for Day {conflictDay}. No score or category is shown rather than a guessed one.
            </p>
            <p className="font-mono text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
              <Link href={`/countries/${selectedNoData.toLowerCase()}`} style={{ color: 'var(--accent-gold)' }}>
                View country page →
              </Link>
            </p>
          </NaiDialog>
        )}
        {selected && (
          <NaiDialog
            title={
              <>
                {selected.country_code} · DAY {selected.conflict_day}
              </>
            }
            onClose={() => setSelectedCode(null)}
          >
                <div className="mt-2">
                  <NaiV2CategoryBadge category={selected.category} locked={selected.categoryLocked} latentEvidence={selected.latentEvidence} expressed={selected.expressed_score} />
                </div>
                <dl className="font-mono text-xs mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <dt style={{ color: 'var(--text-muted)' }}>EXPRESSED</dt>
                  <dd translate="no">{selected.expressed_score ?? '— (no evidence)'}</dd>
                  {selected.expressed_score !== null && (
                    <>
                      <dt style={{ color: 'var(--text-muted)' }}>{NAI_POSTURE_HEADING.toUpperCase()}</dt>
                      <dd>
                        <NaiPostureLabel expressed={selected.expressed_score} hideHeading />
                      </dd>
                    </>
                  )}
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
                        ? '— (no admissible evidence)'
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
          </NaiDialog>
        )}
      </div>
    </div>
  );
}
