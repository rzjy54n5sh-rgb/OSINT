import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { EmailCapture } from '@/components/EmailCapture';
import { createPublicClient } from '@/utils/supabase/server';
import { NAI_POSTURE_NOTE } from '@/lib/nai-v2';
import { TRACKED_COUNTRY_CODES, HORN_COUNTRY_CODES } from '@/lib/countries';
import { TRACKED_COUNTRY_NAMES } from '@/lib/country-names';

/** ISR: the registry changes at most daily; no per-visitor content. */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Methodology — War Posture, Scenarios & Sources — MENA Intel Desk',
  description:
    'How War Posture is scored, how scenario probabilities are computed from prediction markets (market-anchored-v1), where the data comes from and how sources are labelled.',
};

/**
 * Methodology — the current truth only (rulings 2026-10-06 / 2026-10-07).
 * Scenario names, definitions and status are READ FROM THE REGISTRY at request time, so this page
 * cannot drift from /scenarios. Every other statement here describes a mechanism that exists in the
 * repo or the database (method tables, migrations, collector workflows); nothing describes a
 * retired pipeline or a planned feature.
 */

interface QAItem {
  q: string;
  a: ReactNode;
}
interface Section {
  id: string;
  title: string;
  subtitle: string;
  items: QAItem[];
}

const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px 0' }}>{children}</p>;
const Li = ({ children }: { children: ReactNode }) => (
  <li style={{ marginBottom: 6, paddingLeft: 12, borderLeft: '2px solid var(--border)', listStyle: 'none' }}>{children}</li>
);
const Tag = ({ children, color = 'var(--accent-gold)' }: { children: ReactNode; color?: string }) => (
  <span
    style={{
      fontFamily: 'IBM Plex Mono',
      fontSize: 11,
      color,
      border: '1px solid currentColor',
      padding: '1px 6px',
      marginRight: 6,
      display: 'inline-block',
    }}
    translate="no"
  >
    {children}
  </span>
);


type RegistryRow = { code: string; name_en: string; definition_en: string; status: string; group_code: string };

function buildSections(scenarios: RegistryRow[]): Section[] {
  const horn = HORN_COUNTRY_CODES.map((c) => TRACKED_COUNTRY_NAMES[c] ?? c).join(', ');
  const original = TRACKED_COUNTRY_CODES.filter((c) => !(HORN_COUNTRY_CODES as readonly string[]).includes(c))
    .map((c) => TRACKED_COUNTRY_NAMES[c] ?? c)
    .join(', ');

  return [
    {
      id: 'platform',
      title: 'WHAT THIS PLATFORM IS',
      subtitle: 'Scope, neutrality and what we do not do',
      items: [
        {
          q: 'What is MENA Intel Desk?',
          a: (
            <>
              <P>
                An open-source intelligence platform tracking the US–Iran war that began on 28 February 2026 (Day 1) and, since
                7 October 2026, a second theatre: the Horn of Africa &amp; Red Sea. It collects public information — news
                feeds, official statements, prediction-market prices, market and shipping indicators, fact-checks — and
                presents scores, scenario probabilities and daily briefs with their sources.
              </P>
              <P>
                {TRACKED_COUNTRY_CODES.length} countries are tracked: {original}; and the Horn theatre: {horn}.
              </P>
              <P>
                The conflict day is the calendar day counted from 28 February 2026 (UTC). Every section shows the day its own
                data belongs to, so an older value is never presented as today&apos;s.
              </P>
            </>
          ),
        },
        {
          q: 'Are you neutral?',
          a: (
            <ul style={{ margin: 0, padding: 0 }}>
              <Li>
                The same question is asked of every state. No belligerent is the reference point for any score (DECISION-001).
              </Li>
              <Li>
                All parties&apos; official framings are presented, with every party&apos;s operation name: Epic Fury (United
                States), Roaring Lion (Israel), True Promise IV (Iran / IRGC / Hezbollah).
              </Li>
              <Li>
                Party and state sources are labelled as such and are never used as evidence of public opinion or as
                independent confirmation of a fact.
              </Li>
              <Li>We show our working: each score lists its sources with links, and each scenario day lists the markets used.</Li>
            </ul>
          ),
        },
        {
          q: 'What is this platform NOT?',
          a: (
            <ul style={{ margin: 0, padding: 0 }}>
              <Li>Not a news outlet: it does not produce original reporting.</Li>
              <Li>Not affiliated with any government, military, intelligence service or political organisation.</Li>
              <Li>
                Not a prediction service: scenario numbers are market-implied probabilities with stated inputs, not this
                desk&apos;s forecast.
              </Li>
              <Li>Not legal, financial or security advice.</Li>
            </ul>
          ),
        },
        {
          q: 'The no-invented-claim rule',
          a: (
            <>
              <P>
                Every number, date, quote and attribution must trace to a page that was actually opened and states it. Before
                publishing, every cited URL is opened and the claim is checked against the page; quotes are checked verbatim.
                Anything that cannot be confirmed is removed or replaced with &quot;No sourced data available for Day N.&quot;
                A score left with no supporting source becomes empty; confidence is never raised after evidence is removed.
              </P>
              <P>
                The database enforces part of this: a War Posture score cannot be stored unless at least one cited source (with
                claim, outlet, link, date and party flag) feeds it.
              </P>
            </>
          ),
        },
      ],
    },
    {
      id: 'war-posture',
      title: 'WAR POSTURE (NAI)',
      subtitle: 'Narrative Alignment Index, method war-posture-v1 — series starts Day 221',
      items: [
        {
          q: 'What does War Posture measure?',
          a: (
            <>
              <P>
                The Narrative Alignment Index (NAI) asks whether a state&apos;s official war posture and its society&apos;s
                posture point the same way. Both are placed on one party-neutral scale — the position on continuing
                hostilities, by any party:
              </P>
              <ul style={{ margin: '0 0 10px 0', padding: 0 }}>
                <Li><Tag>0</Tag>immediate, unconditional ceasefire</Li>
                <Li><Tag>25</Tag>conditional de-escalation</Li>
                <Li><Tag>50</Tag>ambivalent or conditional</Li>
                <Li><Tag>75</Tag>continued pressure</Li>
                <Li><Tag>100</Tag>continue or escalate military action</Li>
              </ul>
              <P>
                The same scale is used for every state, whichever side it is on. A Horn of Africa state is scored on the war
                that concerns it most directly, and its row says so.
              </P>
            </>
          ),
        },
        {
          q: 'Expressed score and latent band',
          a: (
            <>
              <P>
                <strong style={{ color: 'var(--text-primary)' }}>Expressed (E, 0–100):</strong> the government&apos;s official
                position, from official statements and state communications. Party and state sources are valid here, because
                they show what a government says.
              </P>
              <P>
                <strong style={{ color: 'var(--text-primary)' }}>Latent (band):</strong> the population and non-government
                elites on the same scale, stored as a low–high band, from admissible evidence only: published polls with
                pollster, field dates and sample size; credible protest reporting; opposition parliamentary votes; independent
                elite commentary. State media, official agencies, government-organised rallies and state-owned pollsters are
                never evidence of public opinion. With no admissible evidence the band is empty — it is never a guessed point.
              </P>
              <P>
                <strong style={{ color: 'var(--text-primary)' }}>Gap:</strong> E minus the band midpoint (signed).
              </P>
            </>
          ),
        },
        {
          q: 'Categories and UNSCORABLE',
          a: (
            <>
              <P>For one latent value L, the category is set by the distance |E − L|:</P>
              <ul style={{ margin: '0 0 10px 0', padding: 0 }}>
                <Li><Tag color="#4EC98A">ALIGNED</Tag>under 10</Li>
                <Li><Tag color="#4A8FE8">STABLE</Tag>10 to 19</Li>
                <Li><Tag color="#E8C547">TENSION</Tag>20 to 29</Li>
                <Li><Tag color="#E8874A">FRACTURE</Tag>30 or more, government and society on the same side of 50</Li>
                <Li><Tag color="#E05252">INVERSION</Tag>30 or more, on opposite sides of 50</Li>
              </ul>
              <P>
                Because the latent position is a band, a category is assigned only if every value in the band gives the same
                category. <Tag color="#A3ACB9">UNSCORABLE</Tag> means no single category can be assigned: either there is no
                admissible latent evidence, or the band spans more than one category. No category is guessed. The category is
                computed by the database (function nai_c2_category), never by the page.
              </P>
              <P>
                The thresholds 10 / 20 / 30 and the midpoint 50 are conventions, not empirical findings. Changing them requires
                a new method version and a rescore.
              </P>
            </>
          ),
        },
        {
          q: 'Posture (official) label',
          a: <P>{NAI_POSTURE_NOTE}</P>,
        },
        {
          q: 'Sources, confidence and the archive',
          a: (
            <>
              <P>
                Each row lists its sources: the claim, outlet, link, publication date, whether it is a party/state source, and
                whether it feeds the expressed score or the latent band. Each row carries a confidence of high, medium or low.
              </P>
              <P>
                Days 1–35 used a retired, US-referenced definition (&quot;alignment&quot; with one side). Those rows are
                archived, read-only and not comparable; they are shown only behind an explicit &quot;archived&quot; toggle on
                the War Posture page. The War Posture series starts on Day 221.
              </P>
            </>
          ),
        },
      ],
    },
    {
      id: 'scenarios',
      title: 'SCENARIOS',
      subtitle: 'The registry, the market-anchored method, and retirement',
      items: [
        {
          q: 'Which scenarios are tracked?',
          a: (
            <>
              <P>
                Scenarios live in a registry and can be born, fade and retire. A new scenario is added only on operator
                approval. The current registry:
              </P>
              {scenarios.length === 0 ? (
                <P>The registry could not be read just now — see the Scenarios page.</P>
              ) : (
                <ul style={{ margin: 0, padding: 0 }} data-testid="methodology-scenarios">
                  {scenarios.map((s) => (
                    <Li key={s.code}>
                      <Tag>{s.code}</Tag>
                      <strong style={{ color: 'var(--text-primary)' }}>{s.name_en}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {' '}
                        · {s.group_code === 'core' ? 'core set' : 'independent'} · {s.status}
                      </span>
                      <span style={{ display: 'block', marginTop: 4 }}>{s.definition_en}</span>
                    </Li>
                  ))}
                </ul>
              )}
              <P>
                The core set is mutually exclusive over the method horizon and sums to exactly 100 each day. Independent
                scenarios are measured separately, can overlap with the core set and are not part of the 100. A
                ceasefire-breaking strike counts toward Escalation (D) (operator ruling, 2026-10-06).
              </P>
            </>
          ),
        },
        {
          q: 'How are the probabilities computed? (market-anchored-v1)',
          a: (
            <ul style={{ margin: 0, padding: 0 }}>
              <Li>
                <strong>Horizon:</strong> the nearest month-end with at least 14 days left. Every market used must resolve on
                that date.
              </Li>
              <Li>
                <strong>Price:</strong> the midpoint of the YES bid and ask (for a &quot;ceasefire continues&quot; market, the
                complement is used).
              </Li>
              <Li>
                <strong>Quality floor:</strong> bid/ask spread at most 5 points, liquidity (Kalshi: open interest) at least
                $10,000 and volume at least $10,000. A market that fails the floor is listed with its reason but not used.
              </Li>
              <Li>
                <strong>Class probability:</strong> the highest qualifying market for the scenario; markets on the same event
                across venues are averaged by venue weight first.
              </Li>
              <Li>
                <strong>C (Cascade):</strong> a Hormuz gate — if the market puts the chance that Hormuz is NOT back to normal by
                the horizon at 90% or more, C is the Bab el-Mandeb closure price; otherwise C is scaled by that chance and the
                run is flagged.
              </Li>
              <Li>
                <strong>B (Prolonged War)</strong> is the residual: 100 − A − C − D.
              </Li>
              <Li>
                <strong>Rounding:</strong> largest-remainder (Hamilton) rounding to whole numbers, so the core set sums to
                exactly 100.
              </Li>
              <Li>
                <strong>KEEP_FROZEN:</strong> if A or D has no qualifying market, if A + C + D would exceed 100, or if a core
                market has closed or is ambiguous, the run is stored for audit and nothing is published that day.
              </Li>
              <Li>
                <strong>Independent scenarios:</strong> with no market that passes the floor, the scenario is published as
                unmeasured (empty), never as zero or a guess.
              </Li>
              <Li>
                <strong>Stored inputs:</strong> every run stores every market read — venue, question, link, bid/ask, liquidity,
                used or excluded and why — together with the horizon, the computed values and the run flags. The Scenarios
                page shows them under &quot;How these numbers are made&quot;.
              </Li>
              <Li>
                <strong>Operator overrides:</strong> the operator can exclude or reclassify a market (the run is recomputed and
                stamped) or replace the output with a stated reason; computed rows are kept either way.
              </Li>
            </ul>
          ),
        },
        {
          q: 'Retirement',
          a: (
            <P>
              A scenario whose published whole-number probability is below 10% for 14 consecutive days starts fading
              automatically; a missing day breaks the streak, and a recovery to 10% or more makes it active again. Only the
              operator retires a core scenario. A retired scenario stays visible. An independent scenario stays
              &quot;unmeasured&quot; while no market measures it.
            </P>
          ),
        },
        {
          q: 'What about Days 1–35?',
          a: (
            <P>
              Days 1–35 were fixed desk estimates (method legacy-desk-v0). Their inputs were not stored and they cannot be
              reproduced. They are kept unchanged, shown only as a separate archived series, and never joined to the market
              series or used for &quot;change since&quot; figures.
            </P>
          ),
        },
        {
          q: 'Why probabilities and not predictions?',
          a: (
            <P>
              A market price is the crowd&apos;s implied chance of an event by the horizon date, under the market&apos;s own
              resolution rules. It can move quickly and can be wrong. A 26% probability means the event is less likely than not
              — not that it will not happen. The core set only covers the outcomes the registry defines.
            </P>
          ),
        },
      ],
    },
    {
      id: 'sources',
      title: 'SOURCES AND COLLECTION',
      subtitle: 'Where data comes from, how sources are labelled, and how often it updates',
      items: [
        {
          q: 'How is news collected?',
          a: (
            <>
              <P>
                Articles come from public RSS feeds, read by an automated collector once an hour (including a Horn of Africa
                feed group). The headline, summary, link, outlet and time are stored with keyword tags and a region label;
                full article text is not stored. A keyword filter keeps conflict-relevant items.
              </P>
              <P>
                Earlier days are covered by a reconstructed headline index built from The GDELT Project (
                <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)' }}>
                  gdeltproject.org
                </a>
                ): title, link, outlet and time only, never article text, and every such row is marked retrospective. The live
                article history for March–August 2026 was lost and is not complete.
              </P>
              <P>
                Article sentiment is a simple keyword count: words of violence and crisis against words of ceasefire and talks.
                It describes the headline&apos;s wording, not the event and not any party&apos;s position.
              </P>
            </>
          ),
        },
        {
          q: 'Source tiers and party labelling (DECISION-002)',
          a: (
            <ul style={{ margin: 0, padding: 0 }}>
              <Li>
                <Tag>TIER 1</Tag>Independent: AFP, Reuters, AP, PolitiFact, NetBlocks, Human Rights Watch.
              </Li>
              <Li>
                <Tag>TIER 2</Tag>Conditional: the Financial Times for economic and energy reporting; Al Jazeera English,
                except where it reports on Qatar, Egypt or the UAE (conflict of interest — labelled as a party source there).
              </Li>
              <Li>
                <Tag color="var(--accent-orange)">PARTY / STATE</Tag>State media and official outlets, labelled as such — for
                example IRNA, Tasnim, Fars, PressTV, Al Mayadeen, Al-Ahram, WAM, SPA, The National, TASS, Xinhua, and in the
                Horn theatre Fana and SONNA. Military communications (CENTCOM, IRGC, IDF) are party sources and need
                independent corroboration before a claim is treated as confirmed or debunked.
              </Li>
              <Li>
                Every report needs at least one Arabic-language, one regional and one non-Western source before it is
                published.
              </Li>
            </ul>
          ),
        },
        {
          q: 'How often does each part update?',
          a: (
            <>
              {[
                { feed: 'News articles', freq: 'Collector scheduled hourly' },
                {
                  feed: 'Market data — collector',
                  freq: 'Scheduled every 30 minutes: Brent, WTI, Gold, Natural Gas, S&P 500, Dow Jones, XLE, USO, VIX, EUR/USD, USD/SAR, USD/AED, USD/IQD. Closed days keep only the newest row per indicator.',
                },
                {
                  feed: 'Market data — daily build',
                  freq: 'Once a day: USD/EGP, open-market USD/IRR, Hormuz and Bab al-Mandeb traffic, war-risk premium — each with its quoted source',
                },
                { feed: 'Social trends', freq: 'Collector scheduled every 12 hours' },
                { feed: 'Fact-checks (disinformation)', freq: 'Collector scheduled daily at 06:00 UTC' },
                { feed: 'Scenario probabilities', freq: 'Market job scheduled daily at 05:20 UTC' },
                { feed: 'War Posture, country reports, daily briefs', freq: 'Once a day by the daily build, after source checks' },
              ].map((r) => (
                <div key={r.feed} style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 220 }}>{r.feed}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, minWidth: 200 }}>{r.freq}</span>
                </div>
              ))}
              <P>
                Scheduled collectors run on GitHub Actions, where a scheduled run can be delayed or skipped. Each page shows the
                day — and where relevant the time — its data was collected. Anything written after 06:00 UTC on the following
                day is labelled reconstructed, not live.
              </P>
            </>
          ),
        },
      ],
    },
    {
      id: 'disinfo',
      title: 'DISINFORMATION TRACKER',
      subtitle: 'Where verdicts come from',
      items: [
        {
          q: 'Where do the claims and verdicts come from?',
          a: (
            <P>
              Claims come from public fact-checking feeds (for example Reuters, AFP and AP fact-check desks). A verdict is taken
              only from the fact-checker&apos;s own published rating, mapped to FALSE, MISLEADING, TRUE or UNVERIFIED; if no
              rating can be read the item is recorded as UNVERIFIED. This desk does not assign verdicts itself and does not
              estimate how far a claim spread.
            </P>
          ),
        },
        {
          q: 'What do the verdict labels mean?',
          a: (
            <ul style={{ margin: 0, padding: 0 }}>
              <Li><Tag color="var(--accent-red)">FALSE</Tag>The fact-checker rated the claim false.</Li>
              <Li><Tag color="var(--accent-orange)">MISLEADING</Tag>The fact-checker rated it misleading, missing context or partly false.</Li>
              <Li><Tag color="var(--accent-green)">TRUE</Tag>The fact-checker rated it true.</Li>
              <Li><Tag color="var(--text-secondary)">UNVERIFIED</Tag>No rating could be read from the fact-check — not a judgment that the claim is false.</Li>
            </ul>
          ),
        },
      ],
    },
    {
      id: 'limits',
      title: 'WHAT WE CANNOT KNOW',
      subtitle: 'The limits of open-source analysis',
      items: [
        {
          q: 'What are the limits?',
          a: (
            <ul style={{ margin: 0, padding: 0 }}>
              <Li>Only public information is used. Classified material and back-channel diplomacy that never surfaces are invisible.</Li>
              <Li>State media is constructed messaging. It is used for what governments say, never as proof of facts or of public opinion.</Li>
              <Li>
                War Posture scores are structured judgments from cited evidence, not measurements. Where society&apos;s position
                has no admissible evidence the band stays empty, and many states are UNSCORABLE for that reason.
              </Li>
              <Li>
                Coverage is uneven across languages; English and Arabic are strongest. Countries with thinner coverage should be
                read with more uncertainty.
              </Li>
              <Li>
                Prediction markets can be thin, single-venue or slow to react; the run flags on the Scenarios page say when that
                applies.
              </Li>
            </ul>
          ),
        },
        {
          q: 'How do I challenge a score or a verdict?',
          a: (
            <P>
              Use the dispute control on the data point and include a source URL and the specific claim. Disputes are stored for
              the operator to review against the cited sources.
            </P>
          ),
        },
      ],
    },
  ];
}

export default async function MethodologyPage() {
  let scenarios: RegistryRow[] = [];
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('scenarios')
      .select('code, name_en, definition_en, status, group_code')
      .order('display_order', { ascending: true });
    scenarios = (data as RegistryRow[] | null) ?? [];
  } catch {
    scenarios = [];
  }
  const sections = buildSections(scenarios);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div style={{ marginBottom: 32, borderBottom: '1px solid var(--border)', paddingBottom: 24 }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 8 }}>
          ◆ MENA INTEL DESK — METHODOLOGY &amp; TRANSPARENCY
        </div>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 40, color: 'var(--text-primary)', letterSpacing: '2px', margin: '0 0 12px 0' }}>
          HOW THIS PLATFORM WORKS
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 680, margin: 0 }}>
          How War Posture is scored, how scenario probabilities are computed from markets, where the data comes from and how
          sources are labelled. Every rule described here is in force today.
        </p>
      </div>

      <nav aria-label="Methodology sections" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 32 }}>
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 11,
              letterSpacing: '1.5px',
              padding: '10px 14px',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
          >
            {s.title}
          </a>
        ))}
      </nav>

      {sections.map((section) => (
        <section key={section.id} id={section.id} style={{ marginBottom: 36, scrollMarginTop: 72 }} aria-labelledby={`${section.id}-h`}>
          <div style={{ marginBottom: 14 }}>
            <h2 id={`${section.id}-h`} style={{ fontFamily: 'Bebas Neue', fontSize: 24, color: 'var(--text-primary)', letterSpacing: '2px', margin: '0 0 4px 0' }}>
              {section.title}
            </h2>
            <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)', margin: 0, letterSpacing: '1px' }}>
              {section.subtitle}
            </p>
          </div>
          <OsintCard>
            {section.items.map((item, i) => (
              <details key={i} open={i === 0} style={{ borderBottom: '1px solid var(--border)' }}>
                <summary
                  style={{
                    padding: '14px 0',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                  }}
                >
                  {item.q}
                </summary>
                <div style={{ paddingBottom: 16, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{item.a}</div>
              </details>
            ))}
          </OsintCard>
        </section>
      ))}

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <EmailCapture source="methodology" compact />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)' }}>
            MENA INTEL DESK — OPEN SOURCE INTELLIGENCE PLATFORM
          </span>
          <Link prefetch={false} href="/" style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', textDecoration: 'none' }}>
            ← RETURN TO DASHBOARD
          </Link>
        </div>
      </div>
    </div>
  );
}
