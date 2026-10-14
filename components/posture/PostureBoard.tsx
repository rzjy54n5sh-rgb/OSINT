'use client';

/**
 * War Posture board v2 (/nai, artboard Posture.dc.html). Client shell for the tabs, sort and day stepper;
 * all placement rules live in lib/posture-board.ts (pure, unit-tested). Tabs are a real tablist
 * (arrow keys, Home/End); the tile map is aria-hidden decoration and the list carries every fact.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { PostureBoard as Board } from '@/lib/posture';
import {
  ARCHIVED_LAST_DAY,
  SORTS,
  boardTabs,
  conflictView,
  countryName,
  dayLabel,
  isHistorical,
  isShownPosition,
  noPositionOnRecord,
  rowName,
  sortPositions,
  stepperState,
  type SortKey,
  type SourceLabels,
} from '@/lib/posture-board';
import { stanceText } from '@/components/posture/PostureParts';
import { PostureLegend, PostureTiles } from '@/components/posture/PostureTiles';
import { OtherCodedCard, PositionCard } from '@/components/posture/PostureRows';
import s from './posture.module.css';

const Chevron = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export function PostureBoard({
  board,
  labels,
  onDay,
  latestDay = board.latestDay,
  status = 'idle',
  pendingDay = null,
  onRetry,
  initialTab,
}: {
  board: Board;
  labels: SourceLabels;
  /** Step to a day (null = the latest). */
  onDay: (day: number | null) => void;
  /** The server's latest board day (the page's own day): "earlier day" is measured against it. */
  latestDay?: number | null;
  /** Client fetch of another day / tier view: loading, or failed (the board shown is unchanged). */
  status?: 'idle' | 'loading' | 'error';
  pendingDay?: number | null;
  onRetry?: () => void;
  initialTab?: string;
}) {
  // Conflict fronts only; the old-method (v1) group is not drawn on this page yet (never filed under a front).
  const tabs = useMemo(() => boardTabs(board).filter((t) => !t.v1), [board]);
  const [tabCode, setTabCode] = useState<string>(initialTab ?? tabs[0]?.code ?? '');
  const [sort, setSort] = useState<SortKey>('score');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const lastStep = useRef<'prev' | 'next' | 'back' | null>(null);
  const tab = tabs.find((x) => x.code === tabCode) ?? tabs[0];
  const stepper = stepperState(board, latestDay);
  const historical = isHistorical(board, latestDay);
  const nothing = useMemo(() => (board.schema === 'v2' ? noPositionOnRecord(board) : []), [board]);
  const archived = board.schema === 'v1' && board.day != null && board.day <= ARCHIVED_LAST_DAY;
  const noRecord = board.schema === 'v1' && (archived || board.rows.length === 0);

  // Keep focus on a control after a step: a button that becomes disabled (earliest / latest day) drops focus.
  useEffect(() => {
    const step = lastStep.current;
    if (!step) return;
    lastStep.current = null;
    const active = document.activeElement as HTMLButtonElement | null;
    if (active && active !== document.body && !active.disabled) return;
    const target =
      step === 'back' ? labelRef.current : step === 'prev' ? (stepper.prev != null ? prevRef.current : nextRef.current) : stepper.next != null ? nextRef.current : prevRef.current;
    (target ?? labelRef.current)?.focus();
  }, [board.day, stepper.prev, stepper.next]);

  const step = (kind: 'prev' | 'next' | 'back', day: number | null) => {
    lastStep.current = kind;
    onDay(day);
  };

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((x) => x.code === tab?.code);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTabCode(tabs[next].code);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={s.root}>
      <div className={s.page}>
        <section aria-labelledby="posture-h1" className={s.intro}>
          <div className={s.introText}>
            <h1 id="posture-h1" className={s.h1}>
              War Posture
            </h1>
            <p className={s.dek}>
              What each government says it intends on each front, from 0 (de-escalate) to 100 (escalate). Every score rests on a dated
              quote you can open.
            </p>
            <details className={s.howTo}>
              <summary>How to read this board</summary>
              <p>
                Scores code stated aims, not character. Confidence falls as evidence ages. Egypt, Saudi Arabia and the UAE are never
                scored: we show their officials&rsquo; words only. Yemen has two authorities and two lines, never averaged. Each quote
                links to its source, and to an archived copy where one exists.
              </p>
            </details>
          </div>
          <div className={s.day} data-testid="posture-day">
            <div className={s.dayRow} role="group" aria-label="Day">
              {stepper.show ? (
                <button
                  ref={prevRef}
                  type="button"
                  className={s.stepBtn}
                  aria-label="Previous day"
                  disabled={stepper.prev == null}
                  onClick={() => step('prev', stepper.prev)}
                  data-testid="posture-prev"
                >
                  <Chevron d="M9 2.5 4.5 7 9 11.5" />
                </button>
              ) : null}
              <span ref={labelRef} tabIndex={-1} className={`${s.dayLabel} ${s.num}`} data-testid="posture-day-label">
                {dayLabel(board.day)}
              </span>
              {stepper.show ? (
                <button
                  ref={nextRef}
                  type="button"
                  className={s.stepBtn}
                  aria-label="Next day"
                  disabled={stepper.next == null}
                  onClick={() => step('next', stepper.next === latestDay ? null : stepper.next)}
                  data-testid="posture-next"
                >
                  <Chevron d="M5 2.5 9.5 7 5 11.5" />
                </button>
              ) : null}
            </div>
            {!stepper.show && board.schema === 'v2' ? <p className={s.dayNote}>Previous days use the old method (v1)</p> : null}
            {historical ? (
              <p className={s.dayNote} data-testid="posture-historical">
                {archived
                  ? `Days 1–${ARCHIVED_LAST_DAY} are archived and not shown on the War Posture page.`
                  : noRecord
                    ? `No War Posture record exists for Day ${board.day}.`
                    : board.schema === 'v1'
                      ? 'This earlier day uses the old method (v1): one blended number per country.'
                      : 'Viewing an earlier day.'}{' '}
                <button type="button" className={s.linkBtn} onClick={() => step('back', null)}>
                  Back to Day {latestDay}
                </button>
              </p>
            ) : null}
            <p className={s.dayNote} role="status" aria-live="polite" data-testid="posture-status">
              {status === 'loading' ? `Loading Day ${pendingDay ?? ''}…` : ''}
            </p>
            {status === 'error' ? (
              <p className={s.dayError} role="alert" data-testid="posture-error">
                {pendingDay != null ? `Day ${pendingDay} could not be loaded.` : 'This view could not be loaded.'} Still showing{' '}
                {dayLabel(board.day)}.{' '}
                <button
                  type="button"
                  className={s.linkBtn}
                  onClick={() => {
                    labelRef.current?.focus(); // the alert (and this button) goes away
                    onRetry?.();
                  }}
                >
                  Retry
                </button>
              </p>
            ) : null}
          </div>
        </section>

        {noRecord ? (
          <p className={s.empty} data-testid="posture-no-record">
            {archived
              ? `Days 1–${ARCHIVED_LAST_DAY} are archived and not shown on the War Posture page.`
              : `No War Posture record exists for Day ${board.day ?? '—'}.`}
          </p>
        ) : null}
        {noRecord ? null : (
          <>
        <div className={s.tabs} role="tablist" aria-label="Front" onKeyDown={onTabKey} data-testid="posture-tabs">
          {tabs.map((x, i) => (
            <button
              key={x.code}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`posture-tab-${x.code}`}
              aria-selected={x.code === tab?.code}
              aria-controls="posture-panel"
              tabIndex={x.code === tab?.code ? 0 : -1}
              className={s.tab}
              onClick={() => setTabCode(x.code)}
            >
              {x.label}
            </button>
          ))}
        </div>

        {tab ? (
          <div id="posture-panel" role="tabpanel" aria-labelledby={`posture-tab-${tab.code}`} aria-busy={status === 'loading'} className={s.panelBody}>
            <p className={s.tabDesc}>{tab.description}</p>
            <ConflictPanel board={board} code={tab.code} labels={labels} sort={sort} setSort={setSort} />
            {nothing.length > 0 ? (
              <p className={s.foot} data-testid="posture-nothing">
                No position on record (all fronts): {nothing.map(countryName).join(', ')}.
              </p>
            ) : null}
          </div>
        ) : board.schema === 'v1' ? (
          <p className={s.empty} data-testid="posture-v1-day">
            This day uses the old method (v1): one blended number per country. Its scores are not shown on this page.
          </p>
        ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ConflictPanel({
  board,
  code,
  labels,
  sort,
  setSort,
}: {
  board: Board;
  code: string;
  labels: SourceLabels;
  sort: SortKey;
  setSort: (k: SortKey) => void;
}) {
  const view = useMemo(() => conflictView(board, code), [board, code]);
  // Yemen's two lines are listed as two separate cards (posture_actors display names), never merged.
  const yemen = (view.yemen ?? []).flatMap((l) => (l.row && isShownPosition(l.row) ? [l.row] : []));
  const rows = sortPositions([...view.positions, ...yemen], sort);
  const heading =
    view.count === 0 ? 'No method-v2 positions on this front' : view.count === 1 ? '1 position on record (method v2)' : `${view.count} positions on record (method v2)`;
  const silence = Object.values(view.tiles).some((x) => x.kind === 'silence');
  return (
    <div className={s.split}>
      <figure className={s.figure}>
        <PostureTiles tiles={view.tiles} />
        <figcaption>
          <PostureLegend silence={silence} />
        </figcaption>
        <p className={s.note}>
          {view.outside.length > 0
            ? `Outside the map: ${view.outside.map((r) => `${rowName(r)}, ${r.expressed_score} (${stanceText(r)})`).join('; ')}. `
            : ''}
          Schematic: one tile per government, placed roughly by geography. The list is the full record.
        </p>
      </figure>
      <section className={s.list} aria-labelledby="list-h">
        <div className={s.listHead}>
          <h2 id="list-h" className={s.h2}>
            {heading}
          </h2>
          {rows.length > 1 ? (
            <div className={s.sort} role="group" aria-label="Sort by">
              <span className={s.muted}>Sort</span>
              {SORTS.map((o) => (
                <button key={o.key} type="button" className={s.sortBtn} aria-pressed={sort === o.key} onClick={() => setSort(o.key)}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {rows.length > 0 ? (
          <ul className={s.cards} data-testid="posture-list">
            {rows.map((r) => (
              <PositionCard key={`${r.country_code}|${r.actor}`} row={r} labels={labels} />
            ))}
          </ul>
        ) : view.count === 0 ? (
          <p className={s.empty} data-testid="posture-empty">
            No government has a method-v2 position on this front for Day {board.day ?? '—'}.
          </p>
        ) : null}
        {view.awaiting.length > 0 ? (
          <p className={s.note} data-testid="posture-awaiting">
            Awaiting coding on this front: {view.awaiting.map(countryName).join(', ')}. A statement was captured and has not been coded yet,
            so no position is shown.
          </p>
        ) : null}
        {view.others.length > 0 ? (
          <ul className={s.cards}>
            {view.others.map((r) => (
              <OtherCodedCard key={`${r.country_code}|${r.actor}`} row={r} labels={labels} />
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
