'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
// maplibre-gl v6 is ESM-only (no default export). Under a bundler the worker URL must be set once.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TimelineScrubber } from '@/components/TimelineScrubber';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { PageBriefing } from '@/components/PageBriefing';
import { PageShareButton } from '@/components/PageShareButton';
import { useI18n } from '@/components/I18nProvider';
import { NaiArchiveToggle } from '@/components/nai/NaiArchiveToggle';
import { NaiDialog } from '@/components/nai/NaiDialog';
import { CountryFlag } from '@/components/CountryFlag';
import { TRACKED_COUNTRY_CODES } from '@/lib/countries';
import { formatBand, formatGap } from '@/lib/nai-v2';
import { SITE_URL } from '@/lib/site';
import {
  POSTURE_NODATA_COLOR,
  POSTURE_SILENCE_COLOR,
  POSTURE_WITHHELD_TEXT,
  POSTURE_WITHHELD_TITLE,
  V1_FROZEN_CONFLICT,
  POSTURE_DEFAULT_ACTOR,
  boardConflicts,
  isDualActorCountry,
  isV1Fallback,
  postureGroupCode,
  postureLabelDef,
  postureLineLabel,
  postureRowKey,
  v1FrozenText,
  type PostureBoard,
  type PostureView,
} from '@/lib/posture';
import {
  CitedReporting,
  EvidenceQuote,
  PostureActorTag,
  PostureAge,
  PostureChip,
  PostureScaleLegend,
  V1FrozenTag,
  stanceText,
} from '@/components/posture/PostureParts';

const COUNTRY_COORDS: Record<string, [number, number]> = {
  IR: [53.688, 32.427], IL: [34.851, 31.046], IQ: [43.679, 33.223],
  YE: [47.586, 15.552], SA: [45.079, 23.885], AE: [53.847, 23.424],
  LB: [35.862, 33.854], EG: [30.802, 26.820], TR: [35.243, 38.964],
  RU: [105.318, 61.524], SY: [38.997, 34.802], JO: [36.238, 31.240],
  QA: [51.183, 25.354], KW: [47.481, 29.311], US: [-95.712, 37.090],
  GB: [-3.436, 55.378], FR: [2.349, 46.227], DE: [10.451, 51.166],
  CN: [104.195, 35.861], IN: [78.962, 20.594], PK: [69.345, 30.375],
  ET: [40.490, 9.145], ER: [39.782, 15.179], SD: [30.218, 12.863], SO: [46.200, 5.152], DJ: [42.590, 11.825],
};

/**
 * A dual-actor country's lines get their own marker at the seat of each authority (Yemen: the
 * government in Aden, the Ansar Allah / Houthi authorities in Sanaa), so the two never sit on one dot.
 */
const ACTOR_COORDS: Record<string, [number, number]> = {
  'YE|government': [45.0367, 12.7855],
  'YE|de_facto_authority': [44.2064, 15.3694],
};
function coordsFor(r: Pick<PostureView, 'country_code' | 'actor'>): [number, number] | undefined {
  return ACTOR_COORDS[`${r.country_code}|${r.actor}`] ?? COUNTRY_COORDS[r.country_code];
}

function markerStyle(r: PostureView): { color: string; opacity: number; dash: boolean } {
  if (r.stance === 'withheld') return { color: '#000000', opacity: 0, dash: true };
  if (r.stance === 'deliberate_silence') return { color: POSTURE_SILENCE_COLOR, opacity: 0.85, dash: false };
  if (r.stance === 'position') return { color: postureLabelDef(r.label)?.color ?? POSTURE_NODATA_COLOR, opacity: 0.9, dash: false };
  return { color: POSTURE_NODATA_COLOR, opacity: 0.85, dash: false };
}

/** Sort: positions by E (desc), then silence, then stated-positions-only, then no coded position. */
function rank(r: PostureView): number {
  return r.stance === 'position' ? 0 : r.stance === 'deliberate_silence' ? 1 : r.stance === 'withheld' ? 2 : 3;
}

export function PostureMapClient({
  board,
  defaultDay,
  conflictDayBadge,
}: {
  board: PostureBoard;
  defaultDay: number | null;
  conflictDayBadge?: ReactNode;
}) {
  const { t } = useI18n();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const conflicts = useMemo(() => boardConflicts(board), [board]);
  const [conflict, setConflict] = useState<string>(conflicts[0]?.conflict_code ?? 'blended-v1');
  useEffect(() => {
    if (!conflicts.some((c) => c.conflict_code === conflict)) setConflict(conflicts[0]?.conflict_code ?? 'blended-v1');
  }, [conflicts, conflict]);
  const active = conflicts.find((c) => c.conflict_code === conflict) ?? conflicts[0] ?? null;

  const rows = useMemo(
    () =>
      board.rows
        // v2 board: a tab per conflict, plus V1_FROZEN_CONFLICT for countries not yet re-coded in v2
        .filter((r) => (board.schema === 'v1' ? true : postureGroupCode(board, r) === conflict))
        .sort(
          (a, b) =>
            rank(a) - rank(b) ||
            (b.expressed_score ?? -1) - (a.expressed_score ?? -1) ||
            a.country_code.localeCompare(b.country_code) ||
            Number(a.actor !== POSTURE_DEFAULT_ACTOR) - Number(b.actor !== POSTURE_DEFAULT_ACTOR),
        ),
    [board, conflict],
  );
  // Countries on a v2 board that only have a frozen War Posture v1 row (shown in the v1-frozen tab).
  const v1FallbackCodes = useMemo(
    () => new Set(board.rows.filter((r) => isV1Fallback(board, r)).map((r) => r.country_code)),
    [board],
  );
  // Tracked countries with nothing on record. Only for the panel-wide questions (v1, or v2 us-iran):
  // the other conflicts are not asked of every tracked state. A country with a frozen v1 row is not
  // "nothing on record": it is listed under the v1-frozen tab instead.
  const noData = useMemo(
    () =>
      board.schema === 'v1' || conflict === 'us-iran'
        ? TRACKED_COUNTRY_CODES.filter((c) => !rows.some((r) => r.country_code === c) && !v1FallbackCodes.has(c))
        : [],
    [board.schema, conflict, rows, v1FallbackCodes],
  );
  const showV1Pointer = board.schema === 'v2' && conflict !== V1_FROZEN_CONFLICT.conflict_code && v1FallbackCodes.size > 0;
  // Selection is a row key (country x conflict x actor: Yemen has two lines) or, for "nothing on record", a country code.
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const selected = rows.find((r) => postureRowKey(r) === selectedCode) ?? null;
  const selectedNoData = selectedCode != null && !selected && noData.includes(selectedCode) ? selectedCode : null;
  const dualActorOnTab = rows.some((r) => isDualActorCountry(r.country_code));
  const hasRows = board.rows.length > 0;
  const counts = {
    position: rows.filter((r) => r.stance === 'position').length,
    silence: rows.filter((r) => r.stance === 'deliberate_silence').length,
    withheld: rows.filter((r) => r.stance === 'withheld').length,
  };

  const setDay = (day: number) => {
    const next = new URLSearchParams(window.location.search);
    next.set('day', String(day));
    window.history.pushState(null, '', `/nai?${next.toString()}`);
  };

  useEffect(() => {
    if (!mapContainer.current) return;
    maplibregl.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());
    map.current = new maplibregl.Map({ container: mapContainer.current, style: 'https://demotiles.maplibre.org/style.json', center: [44, 26], zoom: 2 });
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      const key = e.features?.[0]?.properties?.key;
      if (typeof key === 'string') setSelectedCode(key);
    };
    const setPointer = () => (m.getCanvas().style.cursor = 'pointer');
    const clearPointer = () => (m.getCanvas().style.cursor = '');
    const addMarkers = () => {
      if (m.getLayer('posture-circles')) m.removeLayer('posture-circles');
      if (m.getSource('posture-points')) m.removeSource('posture-points');
      const features = [
        ...rows
          .filter((r) => coordsFor(r))
          .map((r) => {
            const st = markerStyle(r);
            return {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: coordsFor(r) as [number, number] },
              properties: { key: postureRowKey(r), country_code: r.country_code, color: st.color, opacity: st.opacity, stroke: st.dash ? 2 : 1, strokeColor: st.dash ? '#E6EDF7' : '#8A9BB5' },
            };
          }),
        ...noData
          .filter((c) => COUNTRY_COORDS[c])
          .map((c) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: COUNTRY_COORDS[c] },
            properties: { key: c, country_code: c, color: POSTURE_NODATA_COLOR, opacity: 0.6, stroke: 1, strokeColor: '#56627A' },
          })),
      ];
      if (features.length === 0) return;
      m.addSource('posture-points', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      m.addLayer({
        id: 'posture-circles',
        type: 'circle',
        source: 'posture-points',
        paint: {
          'circle-radius': 10,
          'circle-color': ['get', 'color'],
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-width': ['get', 'stroke'],
          'circle-stroke-color': ['get', 'strokeColor'],
        },
      });
      m.on('click', 'posture-circles', onClick);
      m.on('mouseenter', 'posture-circles', setPointer);
      m.on('mouseleave', 'posture-circles', clearPointer);
    };
    if (m.loaded()) addMarkers();
    else m.once('load', addMarkers);
    return () => {
      m.off('click', 'posture-circles', onClick);
      m.off('mouseenter', 'posture-circles', setPointer);
      m.off('mouseleave', 'posture-circles', clearPointer);
    };
  }, [rows, noData]);

  const shareText = () => {
    const base = `${SITE_URL}/nai`;
    if (selected && !selected.withheld) {
      const who = postureLineLabel(selected);
      if (isV1Fallback(board, selected)) return `${who} ${v1FrozenText(selected)}: ${stanceText(selected)} — ${base}`;
      return `${who} War Posture (${active?.short_name ?? ''}): ${stanceText(selected)} · Day ${board.day ?? '—'} — ${base}`;
    }
    return `War Posture Map · ${active?.short_name ?? ''} · Day ${board.day ?? '—'} — ${base}`;
  };

  return (
    <div>
      <PageBriefing
        title={t('naiMapHeading')}
        description="War Posture records what each government says it wants on continuing a war — per conflict, on one party-neutral scale (0 = immediate unconditional ceasefire, 100 = continue or escalate, by any party). Each position rests on a statement captured once, word for word, with its date, link and an archived copy; it stays on record until a new statement replaces it, and its confidence fades with age."
        note="Labels describe stated aims, not character: Seeks immediate ceasefire · Conditional de-escalation · Ambivalent · Supports continued pressure · Supports escalation, plus a 'defensive' flag when a government cites attacks on its own territory. Deliberate silence is its own category. Egypt, the UAE and Saudi Arabia get no grade or colour: their statements and acts are shown instead (editorial policy, see Methodology). Days 1–35 used a retired method and sit behind the archive toggle."
      />
      <div className="px-4 max-w-6xl mx-auto w-full">
        <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
          {t('naiMapHeading')}
        </h1>
        {conflictDayBadge}
        {/* Conflict selector */}
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Conflict" data-testid="posture-conflict-tabs">
          {conflicts.map((c) => (
            <button
              key={c.conflict_code}
              type="button"
              role="tab"
              aria-selected={c.conflict_code === conflict}
              onClick={() => {
                setConflict(c.conflict_code);
                setSelectedCode(null);
              }}
              className="font-mono text-[11px] uppercase px-3 py-1.5 min-h-[36px] border rounded-sm"
              style={{
                borderColor: c.conflict_code === conflict ? 'var(--accent-gold)' : 'var(--border)',
                color: c.conflict_code === conflict ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {c.short_name}
            </button>
          ))}
        </div>
        {active && board.schema === 'v2' && (
          <p className="font-mono text-[11px] mt-2 leading-relaxed max-w-3xl" style={{ color: 'var(--text-muted)' }} data-testid="posture-conflict-desc">
            {active.description}
          </p>
        )}
        {dualActorOnTab && (
          <p className="font-mono text-[11px] mt-2 max-w-3xl leading-relaxed" style={{ color: 'var(--text-muted)' }} data-testid="posture-dual-actor-note">
            Yemen has two authorities, shown as two separate lines and never averaged: the internationally recognised
            government (Presidential Leadership Council, Aden) and the Ansar Allah (Houthi) de facto authorities in Sanaa.
            Each line rests only on its own statements.
          </p>
        )}
        {showV1Pointer && (
          <p className="font-mono text-[11px] mt-2 max-w-3xl" style={{ color: 'var(--text-muted)' }} data-testid="posture-v1-pointer">
            {v1FallbackCodes.size} {v1FallbackCodes.size === 1 ? 'government is' : 'governments are'} not yet re-coded under method v2: their last
            method-v1 number (frozen) is under the &lsquo;{V1_FROZEN_CONFLICT.short_name}&rsquo; tab.
          </p>
        )}
        {board.schema === 'v1' && hasRows && (
          <p className="font-mono text-[11px] mt-2 border px-3 py-2 max-w-3xl" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }} data-testid="posture-v1-note">
            Showing method v1: one number per country, even where countries were scored on different wars, re-checked every
            day. Per-conflict positions (method v2) replace it once captured; until then day-to-day changes are not flagged as
            moves.
          </p>
        )}
      </div>
      <div className="flex flex-col sm:flex-row mt-3" style={{ minHeight: 'calc(100vh - 44px)' }}>
        <div className="w-full flex-1 relative" style={{ minHeight: '40vh' }}>
          <div className="absolute inset-0" style={{ position: 'absolute' }} ref={mapContainer} />
          <div className="hidden sm:block absolute left-2 bottom-2 z-10 p-2 rounded-sm" style={{ background: 'rgba(7,10,15,0.85)', color: 'var(--text-secondary)' }} data-testid="nai-legend">
            <PostureScaleLegend />
          </div>
        </div>
        {/* Phone: the legend sits under the map instead of covering it. */}
        <div className="sm:hidden px-4 py-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
          <PostureScaleLegend compact />
        </div>
        <aside
          className="w-full sm:w-96 border-t sm:border-t-0 sm:border-l sm:overflow-y-auto sm:max-h-[80vh] p-4 flex flex-col gap-3"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
              WAR POSTURE · {active?.short_name?.toUpperCase() ?? '—'}
            </h2>
            <PageShareButton label="SHARE" getCopyText={shareText} />
          </div>
          {!hasRows && (
            <p className="font-mono text-xs border px-3 py-2" style={{ color: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' }} data-testid="nai-v2-empty">
              No government position has been captured yet. Nothing is shown in place of a captured statement.
            </p>
          )}
          {hasRows && board.day != null && board.latestDay != null && (
            <TimelineScrubber
              min={board.firstDay ?? board.latestDay}
              max={board.latestDay}
              value={Math.min(Math.max(board.day, board.firstDay ?? board.latestDay), board.latestDay)}
              onChange={setDay}
            />
          )}
          {hasRows && (
            <p className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }} data-testid="posture-coverage" translate="no">
              DAY {board.day ?? defaultDay ?? '—'} · {counts.position} POSITIONS · {counts.silence} SILENT · {counts.withheld} STATED-ONLY
              {noData.length > 0 ? ` · ${noData.length} NOTHING ON RECORD` : ''}
            </p>
          )}
          <ul className="space-y-2" data-testid="posture-list">
            {rows.map((r) => (
              <li key={postureRowKey(r)} className="font-mono text-xs border rounded-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} data-stance={r.stance} data-actor={r.actor}>
                <button
                  type="button"
                  onClick={() => setSelectedCode(postureRowKey(r))}
                  className="w-full text-left py-1.5 px-2 min-h-[44px]"
                  aria-haspopup="dialog"
                  aria-label={`Open War Posture details for ${postureLineLabel(r)}`}
                >
                  <PostureActorTag row={r} className="block mb-0.5" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <CountryFlag code={r.country_code} className="!text-xs" />
                    {r.expressed_score !== null && (
                      <span translate="no" style={{ color: 'var(--text-primary)' }}>
                        {r.expressed_score}
                      </span>
                    )}
                    <PostureChip row={r} />
                  </div>
                  {isV1Fallback(board, r) && <V1FrozenTag row={r} className="block mt-1" />}
                  <PostureAge row={r} className="block mt-1" />
                  {r.stance === 'withheld' && r.evidence && (
                    <span className="block mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                      &ldquo;{r.evidence.quote.length > 120 ? `${r.evidence.quote.slice(0, 117)}…` : r.evidence.quote}&rdquo;
                    </span>
                  )}
                  {r.change_reason === 'new_evidence' && r.previous_score != null && r.expressed_score != null && r.previous_score !== r.expressed_score && (
                    <span className="block mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }} translate="no">
                      NEW EVIDENCE: {r.previous_score} → {r.expressed_score} (since Day {r.previous_day})
                    </span>
                  )}
                </button>
                {r.stance === 'position' && (
                  <div className="px-2 pb-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center" style={{ color: 'var(--text-muted)' }}>
                    {r.latentLocked ? (
                      <span className="inline-flex items-center gap-1">
                        BAND <PaywallOverlay requiredTier="informed" featureName="War Posture latent band" compact />
                      </span>
                    ) : (
                      <span translate="no">BAND {r.latent_low === null ? 'no admissible evidence' : formatBand(r.latent_low, r.latent_high)}</span>
                    )}
                    {!r.gapLocked && <span translate="no">GAP {formatGap(r.gap)}</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {noData.length > 0 && (
            <ul className="space-y-1" data-testid="nai-nodata-list" aria-label="Tracked countries with nothing on record">
              {noData.map((code) => (
                <li key={`nodata-${code}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedCode(code)}
                    aria-haspopup="dialog"
                    className="w-full text-left font-mono text-xs py-1.5 px-2 min-h-[40px] border rounded-sm"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    <CountryFlag code={code} className="!text-xs" /> · nothing on record
                  </button>
                </li>
              ))}
            </ul>
          )}
          <NaiArchiveToggle />
        </aside>
        {selectedNoData && (
          <NaiDialog title={<><CountryFlag code={selectedNoData} /> · {active?.short_name}</>} onClose={() => setSelectedCode(null)}>
            <p className="font-mono text-xs mt-3" style={{ color: 'var(--text-secondary)' }} data-testid="nai-nodata-detail">
              No statement on this conflict has been captured for this government
              {board.schema === 'v1' ? ` on Day ${board.day}` : ''}. Nothing is shown rather than a guessed position.
            </p>
            <p className="font-mono text-xs mt-4">
              <Link prefetch={false} href={`/countries/${selectedNoData.toLowerCase()}`} style={{ color: 'var(--accent-gold)' }}>
                View country page →
              </Link>
            </p>
          </NaiDialog>
        )}
        {selected && (
          <NaiDialog
            title={
              <>
                <CountryFlag code={selected.country_code} />
                {isDualActorCountry(selected.country_code) || selected.actor !== POSTURE_DEFAULT_ACTOR ? <> · <PostureActorTag row={selected} /></> : null} · {active?.short_name}
              </>
            }
            onClose={() => setSelectedCode(null)}
          >
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {selected.expressed_score !== null && (
                <span className="font-display text-3xl" style={{ color: 'var(--text-primary)' }} translate="no">
                  {selected.expressed_score}
                </span>
              )}
              <PostureChip row={selected} />
            </div>
            {isV1Fallback(board, selected) && <V1FrozenTag row={selected} className="block mt-1" />}
            <PostureAge row={selected} className="block mt-1" />
            {selected.withheld && (
              <p className="font-mono text-[11px] mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {POSTURE_WITHHELD_TEXT}
              </p>
            )}
            {selected.evidence ? (
              <div className="mt-3">
                <EvidenceQuote e={selected.evidence} />
              </div>
            ) : selected.withheld && selected.cited.length === 0 ? (
              <p className="font-mono text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
                No verbatim statement captured yet. ({POSTURE_WITHHELD_TITLE})
              </p>
            ) : null}
            {selected.method === 'war-posture-v1' && (
              <div className="mt-3 space-y-2">
                {selected.expressed_basis && (
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-mono text-[11px] uppercase block" style={{ color: 'var(--text-muted)' }}>Basis (desk summary)</span>
                    {selected.expressed_basis}
                  </p>
                )}
                <CitedReporting sources={selected.cited} />
              </div>
            )}
            {selected.stance === 'position' && (
              <dl className="font-mono text-xs mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
                <dt style={{ color: 'var(--text-muted)' }}>SOCIETY (BAND)</dt>
                <dd translate="no">{selected.latentLocked ? 'Informed tier' : selected.latent_low === null ? '— (no admissible evidence)' : formatBand(selected.latent_low, selected.latent_high)}</dd>
                {selected.latent_basis && (
                  <>
                    <dt style={{ color: 'var(--text-muted)' }}>BASIS</dt>
                    <dd>{selected.latent_basis}</dd>
                  </>
                )}
                <dt style={{ color: 'var(--text-muted)' }}>GAP</dt>
                <dd translate="no">{selected.gapLocked ? 'Informed tier' : formatGap(selected.gap)}</dd>
                {selected.category && (
                  <>
                    <dt style={{ color: 'var(--text-muted)' }}>CATEGORY</dt>
                    <dd translate="no">{selected.category}</dd>
                  </>
                )}
              </dl>
            )}
            <p className="font-mono text-xs mt-4">
              <Link prefetch={false} href={`/countries/${selected.country_code.toLowerCase()}`} style={{ color: 'var(--accent-gold)' }}>
                Country page, all conflicts and the evidence ledger →
              </Link>
            </p>
          </NaiDialog>
        )}
      </div>
    </div>
  );
}
