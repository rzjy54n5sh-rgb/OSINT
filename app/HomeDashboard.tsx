import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeroScene } from '@/components/home/HeroScene';
import { ReliefLabels } from '@/components/home/relief/ReliefLabels';
import type { ReliefLaneId, ReliefLaneStyle } from '@/components/home/relief/model';
import { EmailCapture } from '@/components/EmailCapture';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { Icon } from '@/components/ui/icons';
import { TrustChip } from '@/components/ui/TrustChip';
import { StaleNote } from '@/components/corridors/parts';
import { BRIEF_TYPES } from '@/lib/brief-types';
import { formatConflictDayDateGb } from '@/lib/conflict-calendar';
import { formatDayTime, type CorridorsView } from '@/lib/corridors';
import { postureScaleVar } from '@/lib/design-tokens';
import {
  corridorDek,
  corridorH1,
  correctionMeta,
  correctionNotice,
  splitLead,
  trackRecordMeta,
  type HomePostureView,
  type HomeTrust,
  type OvernightItem,
} from '@/lib/home-v2';
import type { HomeMarketMetric } from '@/lib/market-latest';
import { POSTURE_WITHHELD_TITLE, conflictName, stanceText, type ConflictDef, type PostureView } from '@/lib/posture';
import { longDate, rowName, sourceLabel, type SourceLabels } from '@/lib/posture-board';
import s from '@/components/home/home.module.css';

export interface HomeBrief {
  day: number;
  lead: string | null;
}
export interface HomeOvernight {
  day: number;
  generatedAt: string | null;
  items: OvernightItem[];
  /** Anchor of the brief's "changes" section on the reader (briefSectionAnchor), for "Read the full item". */
  anchor: string | null;
}
export interface HomeServerData {
  conflictDay: number;
  /** The page's ONE corridors view (the same object the strip and the relief get). */
  corridorsView: CorridorsView;
  /** Latest general brief by daily_briefings' own max day; null = none readable. */
  brief: HomeBrief | null;
  /** report_types published on brief.day (the "Also today" links name only these). */
  briefTypes: string[];
  /** Latest overnight brief by its own max day; null = none readable. */
  overnight: HomeOvernight | null;
  posture: HomePostureView;
  postureConflicts: ConflictDef[];
  postureLabels: SourceLabels;
  marketMetrics: HomeMarketMetric[];
  marketDay: number | null;
  trust: HomeTrust;
}

/**
 * Home page body, design system v2 (artboards Main.dc.html at 1440 and Home-Mobile.dc.html at 390).
 * Order: corridors (H1 + relief figure + lane cards) → since yesterday | odds → top finding → War Posture |
 * stated positions only → markets → trust strip. Every figure is live data passed in by app/page.tsx; a
 * missing source renders an honest empty state, never artboard sample values. Server component: no hooks,
 * no client fetch (HeroScene and EmailCapture are the only client islands).
 */
export default function HomeDashboard({
  serverData: d,
  corridors,
  reliefLanes,
  scenarioRow,
}: {
  serverData: HomeServerData;
  /** Server-rendered CorridorStrip (headless) of the shared view: the lane cards and the source line. */
  corridors?: ReactNode;
  /** Hero relief lane styles from the SAME corridors view as `corridors` (app/page.tsx). */
  reliefLanes?: Record<ReliefLaneId, ReliefLaneStyle>;
  /** Server-rendered ScenarioRow (registry numbers, same as /scenarios). */
  scenarioRow?: ReactNode;
}) {
  const v = d.corridorsView;
  const h1 = corridorH1(v);
  const current = v.state === 'current';
  return (
    <div className={s.page}>
      <section aria-labelledby="home-corridor-strip-h" className={s.corr}>
        <div className={s.hero}>
          <div className={s.heroText}>
            <p className={s.eyebrow}>
              <span className={s.deskOnly}>{current ? 'Corridors this week' : 'Corridors · last published week'}</span>
              <span className={s.phoneOnly}>Corridors{v.weekLabel ? ` · week ${v.weekLabel}` : ''}</span>
            </p>
            <h1 id="home-corridor-strip-h" className={s.h1} data-testid="home-h1">
              {keepHyphenated(h1.lead)}
              {h1.rest ? <span className={s.deskOnly}> {keepHyphenated(h1.rest)}</span> : null}
            </h1>
            <p className={`${s.dek} ${s.deskOnly}`}>{corridorDek(v)}</p>
            {v.staleMessage ? (
              <StaleNote>
                {v.staleMessage}.{' '}
                {v.state === 'stale'
                  ? 'Status words are shown as UNKNOWN until the next PortWatch week is published; the last known figures stay visible below.'
                  : 'No status or figure is shown until a file passes the checks.'}
              </StaleNote>
            ) : null}
            <p className={`${s.meta} ${s.deskOnly}`}>
              <Link prefetch={false} href="/corridors">
                How status is set
              </Link>
            </p>
          </div>
          <figure className={s.figure}>
            <div className={s.figureBox}>
              {/* The one 3D touch (System artboard): poster first, raw WebGL on capable desktops, lazy. */}
              <HeroScene lanes={reliefLanes} />
              {reliefLanes ? <ReliefLabels lanes={reliefLanes} className={s.reliefLabels} /> : null}
            </div>
            <figcaption className={s.meta}>
              {current
                ? 'Corridor relief · lit by this week’s status · the lane cards below carry the same data'
                : 'Corridor relief · lanes shown as UNKNOWN until a current week passes its checks · the lane cards below carry the same data'}
            </figcaption>
          </figure>
        </div>
        {corridors}
      </section>

      <div className={s.row}>
        <SinceYesterday overnight={d.overnight} conflictDay={d.conflictDay} />
        {scenarioRow}
      </div>

      <TopFinding brief={d.brief} briefTypes={d.briefTypes} conflictDay={d.conflictDay} />

      <PostureSection p={d.posture} conflicts={d.postureConflicts} labels={d.postureLabels} />

      <Markets metrics={d.marketMetrics} day={d.marketDay} conflictDay={d.conflictDay} />

      <TrustStrip trust={d.trust} />

      <div className={s.newsletter}>
        <EmailCapture
          source="home"
          heading="Get notified of major updates"
          buttonLabel="Subscribe"
          successText="Subscribed. You will be notified of major platform updates."
        />
      </div>
    </div>
  );
}

/** "Bab al-Mandeb" never breaks at its hyphen (the words are unchanged; only the line break is controlled). */
function keepHyphenated(t: string): ReactNode {
  return t.split(/(\S+-\S+)/).map((part, i) =>
    /\S-\S/.test(part) ? (
      <span key={i} className={s.nowrap}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** Outlet name (registry, else bare host) and the STATE/PARTY badge, exactly as the /nai board shows them. */
function StatedSource({ url, labels, partySource }: { url: string; labels: SourceLabels; partySource: boolean | null }) {
  const src = sourceLabel(url, labels, partySource);
  return (
    <>
      <a href={url} target="_blank" rel="noopener noreferrer nofollow">
        {src.name}
      </a>
      {src.party ? (
        <>
          {' '}
          <span className="chip-party">STATE/PARTY</span>
        </>
      ) : null}
    </>
  );
}

/** "Rayed Krimly, Deputy Minister, Saudi Arabia": the country only when the office does not already name it. */
function attribution(speaker: string | null, office: string | null, country: string): string {
  const who = [speaker, office].filter(Boolean).join(', ');
  if (!who) return country;
  return who.includes(country) ? who : `${who}, ${country}`;
}

function SinceYesterday({ overnight, conflictDay }: { overnight: HomeOvernight | null; conflictDay: number }) {
  const published = overnight?.generatedAt ? formatDayTime(overnight.generatedAt) : null;
  return (
    <section aria-labelledby="home-since-h" className={`${s.card} ${s.since}`} data-testid="home-since">
      <div className={s.cardHead}>
        <h2 id="home-since-h" className={s.h2}>
          Since yesterday
        </h2>
        {overnight ? (
          <span className={`${s.meta} ${s.num}`}>
            Day {overnight.day} overnight brief{published ? ` · published ${published}` : ''}
          </span>
        ) : null}
      </div>
      {overnight ? <DataAsOf section="OVERNIGHT BRIEF" latestDay={overnight.day} currentDay={conflictDay} /> : null}
      {overnight && overnight.items.length > 0 ? (
        <ol className={s.sinceList}>
          {overnight.items.map((it, i) => (
            <li key={i}>
              <span className={`${s.num} ${s.sinceN}`}>{i + 1}</span>
              <div className={s.sinceBody}>
                <p className={s.sinceText}>{it.head}</p>
                {it.cut ? (
                  <Link
                    prefetch={false}
                    href={`/briefings/${overnight.day}/overnight${overnight.anchor ? `#${overnight.anchor}` : ''}`}
                    className={s.sinceMore}
                  >
                    Read the full item<span className="chip-sr-only"> {i + 1} in the overnight brief</span> →
                  </Link>
                ) : null}
                {it.sources.length > 0 ? (
                  <p className={s.sinceSrc}>
                    {it.sources.map((src, j) => (
                      <span key={j}>
                        {j > 0 ? ' · ' : ''}
                        {src.url ? (
                          <a href={src.url} target="_blank" rel="noopener noreferrer nofollow">
                            {src.name}
                          </a>
                        ) : (
                          src.name
                        )}
                        {src.label ? (
                          <>
                            {' '}
                            <span className="chip-party">{src.label}</span>
                          </>
                        ) : null}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={s.empty}>
          {overnight ? 'This overnight brief has no ranked list of changes.' : 'No overnight brief has been published yet.'}
        </p>
      )}
      <Link prefetch={false} href={overnight ? `/briefings/${overnight.day}/overnight` : '/briefings'} className={s.cta}>
        {overnight ? 'Read the overnight brief →' : 'All briefings →'}
      </Link>
    </section>
  );
}

function TopFinding({ brief, briefTypes, conflictDay }: { brief: HomeBrief | null; briefTypes: string[]; conflictDay: number }) {
  // A corrected brief's lead opens with the correction notice: shown as a small note, never as the finding.
  const { notice, lead } = correctionNotice(brief?.lead);
  const { head, rest } = splitLead(lead);
  const also = BRIEF_TYPES.filter((t) => t.code !== 'general' && briefTypes.includes(t.code));
  return (
    <section aria-labelledby="home-tf-h" className={s.tf} data-testid="home-top-finding">
      <div className={s.tfSide}>
        <p className={s.eyebrow}>Day {brief?.day ?? '—'} top finding</p>
        {brief ? <span className={`${s.meta} ${s.num}`}>General brief · {formatConflictDayDateGb(brief.day)}</span> : null}
      </div>
      <div className={s.tfMain}>
        {brief ? <DataAsOf section="GENERAL BRIEFING" latestDay={brief.day} currentDay={conflictDay} /> : null}
        {notice ? (
          <p className={s.corrected} data-testid="home-tf-correction">
            <TrustChip kind="correction" label="Corrected" meta={notice.when} href="/corrections" /> {notice.text}
          </p>
        ) : null}
        {head ? (
          <>
            <h2 id="home-tf-h" className={s.tfHead}>
              {head}
            </h2>
            {rest ? <p className={s.tfRest}>{rest}</p> : null}
          </>
        ) : (
          <>
            <h2 id="home-tf-h" className={s.h2}>
              Top finding
            </h2>
            <p className={s.empty}>No general briefing is available yet. Open the briefings index for the latest published synthesis.</p>
          </>
        )}
        <div className={s.tfLinks}>
          <Link prefetch={false} href={brief ? `/briefings/${brief.day}/general` : '/briefings'} className={s.cta}>
            {brief ? 'Read the general brief →' : 'All briefings →'}
          </Link>
          {brief && also.length > 0 ? (
            <>
              <span className={s.muted}>Also on Day {brief.day}:</span>
              {also.map((t) => (
                <Link key={t.code} prefetch={false} href={`/briefings/${brief.day}/${t.code}`} className={s.text2Link}>
                  {t.title}
                </Link>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function confText(r: PostureView): string | null {
  return r.confidence_now ? `${r.confidence_now} confidence` : null;
}

function PostureSection({ p, conflicts, labels }: { p: HomePostureView; conflicts: ConflictDef[]; labels: SourceLabels }) {
  return (
    <section aria-labelledby="home-wp-h" className={s.wp} data-testid="home-posture">
      <div className={s.wpMain}>
        <div className={s.cardHead}>
          <h2 id="home-wp-h" className={s.h2}>
            War Posture
          </h2>
          {p.schema === 'v2' && p.day != null ? (
            <span className={`${s.meta} ${s.num}`}>
              Day {p.day} · {p.total} position{p.total === 1 ? '' : 's'} on record (method v2)
            </span>
          ) : null}
        </div>
        <p className={s.text2}>
          What each government says it intends, 0 = de-escalate, 100 = escalate. Scored from a dated quote; not a judgement of
          character.
        </p>
        {p.positions.length > 0 ? (
          <ul className={s.wpList}>
            {p.positions.map((r) => {
              const score = Math.round(r.expressed_score as number);
              return (
                <li key={`${r.country_code}|${r.actor}|${r.conflict_code}`} className={s.wpRow} data-country={r.country_code}>
                  <div className={s.wpWho}>
                    <span className={s.wpName}>{rowName(r)}</span>
                    <span className={s.meta}>{conflictName(conflicts, r.conflict_code)}</span>
                  </div>
                  <div className={s.wpStance}>
                    <span>{stanceText(r)}</span>
                    <div className={s.wpTrack} aria-hidden="true">
                      <div style={{ width: `${score}%`, background: postureScaleVar(score, { countryCode: r.country_code }) ?? 'var(--muted)' }} />
                    </div>
                  </div>
                  <div className={s.wpScore}>
                    <span className={s.num}>
                      <span className="chip-sr-only">Score </span>
                      {score}
                      <span className="chip-sr-only"> of 100</span>
                    </span>
                    {confText(r) ? <span className={s.meta}>{confText(r)}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={s.empty}>
            {p.schema === null
              ? 'War Posture data is not available just now.'
              : 'No government position has been coded under method v2 yet.'}
          </p>
        )}
        {p.total > p.positions.length ? (
          <p className={s.meta}>
            {p.total - p.positions.length} more position{p.total - p.positions.length === 1 ? '' : 's'} on the full board.
          </p>
        ) : null}
        <Link prefetch={false} href="/nai" className={s.cta}>
          Full War Posture board, map and evidence →
        </Link>
      </div>
      <aside aria-labelledby="home-stated-h" className={s.stated} data-testid="home-stated">
        <h3 id="home-stated-h" className={s.h3}>
          {POSTURE_WITHHELD_TITLE}
        </h3>
        <p className={s.text2}>
          Egypt, Saudi Arabia and the United Arab Emirates get no score, band or rank under the desk&apos;s editorial policy. We
          publish what their officials said, dated and linked.
        </p>
        {p.stated.length === 0 ? <p className={s.statedNone}>Statements are not available just now.</p> : null}
        {p.stated.map((b) =>
          b.evidence ? (
            <blockquote key={b.code} className={s.quote} data-country={b.code}>
              <p>“{b.evidence.quote}”</p>
              <footer className={s.meta}>
                {attribution(b.evidence.speaker, b.evidence.speaker_office, b.name)}
                {longDate(b.evidence.stated_at ?? b.evidence.captured_at) ? (
                  <>
                    {' · '}
                    <time dateTime={b.evidence.stated_at ?? b.evidence.captured_at ?? undefined}>{longDate(b.evidence.stated_at ?? b.evidence.captured_at)}</time>
                  </>
                ) : null}
                {' · via '}
                <StatedSource url={b.evidence.source_url} labels={labels} partySource={b.evidence.party_source} />
              </footer>
            </blockquote>
          ) : (
            <p key={b.code} className={s.statedNone} data-country={b.code}>
              {b.name}: no statement on record.
            </p>
          ),
        )}
      </aside>
    </section>
  );
}

function Markets({ metrics, day, conflictDay }: { metrics: HomeMarketMetric[]; day: number | null; conflictDay: number }) {
  return (
    <section aria-labelledby="home-mk-h" className={s.mk} data-testid="home-markets">
      <div className={s.cardHead}>
        <h2 id="home-mk-h" className={s.h2}>
          Markets
        </h2>
        <Link prefetch={false} href="/markets" className={s.text2Link}>
          All indicators →
        </Link>
      </div>
      {metrics.length > 0 ? <DataAsOf section="MARKETS" latestDay={day} currentDay={conflictDay} /> : null}
      {metrics.length > 0 ? (
        <ul className={s.mkGrid}>
          {metrics.map(({ label, value, change, asOf }) => (
            <li key={label} className={s.mkTile}>
              <span className={s.meta}>{label}</span>
              {/* Price levels are never red/green (design system v2): text colour, direction as ▲ / ▼. */}
              <span className={`${s.num} ${s.mkVal}`}>{value}</span>
              <span className={`${s.num} ${s.text2}`} translate="no">
                {change.startsWith('+') ? <span aria-hidden="true">▲ </span> : change.startsWith('−') ? <span aria-hidden="true">▼ </span> : null}
                {change}
              </span>
              <span className={`${s.num} ${s.meta}`} translate="no">
                <span className="chip-sr-only">Collected </span>
                {asOf}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.empty}>Market data is not available just now.</p>
      )}
    </section>
  );
}

function TrustStrip({ trust }: { trust: HomeTrust }) {
  const items = [
    { href: '/corrections', icon: <Icon name="correction" />, label: 'Corrections', meta: correctionMeta(trust), num: true },
    { href: '/track-record', icon: <Icon name="track-record" />, label: 'Track record', meta: trackRecordMeta(trust), num: false },
    { href: '/methodology', icon: <Icon name="method" />, label: 'Method', meta: 'Every number links to its source and rule', num: false },
    {
      href: '/ai-disclosure',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="4" y="5" width="12" height="10" rx="1" />
          <path d="M7.5 9.5h.1M12.5 9.5h.1M8 12.5h4" />
        </svg>
      ),
      label: 'How we use AI',
      meta: 'Drafted by an AI agent from linked public sources',
      num: false,
    },
  ];
  return (
    <section aria-label="How to trust this page" className={s.trust} data-testid="home-trust">
      {items.map((it) => (
        <Link key={it.href} prefetch={false} href={it.href} className={s.trustItem}>
          <span className={s.trustIcon}>{it.icon}</span>
          <span className={s.trustText}>
            <span className={s.trustLabel}>{it.label}</span>
            <span className={`${s.meta} ${it.num ? s.num : ''}`}>{it.meta}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
