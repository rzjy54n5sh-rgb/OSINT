import type { Metadata } from 'next';
import { TrustPage, H2, P, List, Li, A } from '@/components/trust/TrustPage';

export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Editorial Charter — MENA Intel Desk',
  description:
    'The rules MENA Intel Desk holds itself to: neutrality, sourcing, uncertainty, corrections, use of AI, safety red lines and conflicts of interest.',
  alternates: { canonical: '/charter' },
};

/**
 * Editorial charter, English. The Arabic version is marked "coming": it is NOT machine-translated here.
 * Any change to this text is a new version (bump CHARTER_VERSION + date) and is logged as an operator ruling.
 */
const CHARTER_VERSION = 'Version 1 · 8 October 2026';

export default function CharterPage() {
  return (
    <TrustPage
      kicker="MENA INTEL DESK — EDITORIAL CHARTER"
      title="EDITORIAL CHARTER"
      current="/charter"
      intro={
        <>
          The rules this desk holds itself to. If we break one, tell us through the <A href="/contact">contact form</A> and we
          will answer in public in the <A href="/corrections">corrections log</A>.
          <span style={{ display: 'block', marginTop: 10, fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-muted)' }}>
            {CHARTER_VERSION} · English · <span lang="ar" dir="rtl">النسخة العربية</span> (Arabic version): coming
          </span>
        </>
      }
    >
      <H2 id="purpose">1. PURPOSE</H2>
      <P>
        The desk helps readers understand the US–Iran war and the Horn of Africa &amp; Red Sea crisis from public information:
        what each party says, what independent sources report, what markets price, and what remains unknown. It does no original
        reporting and serves no government, party or armed group.
      </P>

      <H2 id="neutrality">2. INDEPENDENCE AND NEUTRALITY</H2>
      <List>
        <Li>The same questions are asked of every state and every party. No belligerent is the reference point for any score.</Li>
        <Li>
          Every party&apos;s framing is presented, including each party&apos;s own name for its operations. Reporting a framing is
          not endorsing it.
        </Li>
        <Li>Civilian harm is reported on every side, with sources, whoever caused it.</Li>
        <Li>Words are chosen to describe, not to take sides: we attribute loaded terms to whoever uses them.</Li>
      </List>

      <H2 id="sourcing">3. SOURCING AND VERIFICATION</H2>
      <List>
        <Li>Every factual paragraph links to the sources it relies on. A claim we cannot source is not published.</Li>
        <Li>
          Every cited page is opened and the claim confirmed on it; quotations are checked word for word. Where nothing confirmed
          remains, we say &quot;No sourced data available&quot; rather than fill the gap.
        </Li>
        <Li>
          State media, official agencies and military communications are labelled as party sources. They show what a party says;
          they are not independent confirmation of a fact and never evidence of what a population thinks.
        </Li>
        <Li>Each brief draws on at least one Arabic-language, one regional and one non-Western source.</Li>
        <Li>Times are recorded in UTC. Anything written after the day it describes is labelled reconstructed, not live.</Li>
      </List>

      <H2 id="uncertainty">4. UNCERTAINTY, SCORES AND FORECASTS</H2>
      <List>
        <Li>Scores and probabilities come from published methods with their inputs shown; see the <A href="/methodology">methodology</A>.</Li>
        <Li>When evidence is missing we show a gap, not an estimate. A probability is not a prediction that something will happen.</Li>
        <Li>
          Forecasts are registered before the event in an append-only ledger and scored when they resolve, misses included, on the{' '}
          <A href="/track-record">track record</A> page.
        </Li>
      </List>

      <H2 id="corrections">5. CORRECTIONS AND RIGHT OF REPLY</H2>
      <List>
        <Li>We correct errors promptly and in public. A correction says what was wrong and what it now says.</Li>
        <Li>
          We do not quietly rewrite published work. Once a brief has been live for two hours, every change to it is logged in
          the <A href="/corrections">corrections log</A>.
        </Li>
        <Li>Anyone we write about can reply; a substantive reply is added and logged as a right of reply.</Li>
        <Li>A forecast, resolution or piece of evidence, once recorded, is never edited: a mistake is fixed by a new, linked entry.</Li>
      </List>

      <H2 id="ai">6. USE OF AI</H2>
      <List>
        <Li>Briefs and War Posture scores are drafted by an AI agent from public sources, under the sourcing rules above.</Li>
        <Li>Every AI-drafted brief says so on the page.</Li>
        <Li>AI does not estimate scenario probabilities or give fact-check verdicts, and does not decide what the methods are.</Li>
        <Li>
          What is automated, what the AI does and what a person checks is set out on the <A href="/ai-disclosure">AI disclosure</A>{' '}
          page.
        </Li>
      </List>

      <H2 id="safety">7. SAFETY RED LINES</H2>
      <P>Some accurate, public information can still get people killed. We do not publish:</P>
      <List>
        <Li>
          the precise location — coordinates, street or named facility — of a strike, impact, interception or military position
          less than 72 hours old;
        </Li>
        <Li>
          the position or movement of specific military units, aircraft or vessels (aggregate traffic through a strait is not
          tracking and may be reported);
        </Li>
        <Li>
          findings from internet-exposure scanners such as Shodan — exposed devices, control systems or cameras — whatever
          country they are in;
        </Li>
        <Li>personal details of private individuals that could put them at risk.</Li>
      </List>
      <P>These lines apply even when the information is already circulating elsewhere.</P>

      <H2 id="coi">8. CONFLICTS OF INTEREST</H2>
      <P>
        Interests that could affect our coverage are disclosed, and the people who hold them step back from that coverage. The
        policy and register are on the <A href="/conflicts-of-interest">conflicts-of-interest</A> page.
      </P>

      <H2 id="changes">9. CHANGES TO THIS CHARTER</H2>
      <P>
        Each change produces a new dated version. Who is responsible for the desk is on the <A href="/about">about</A> page.
      </P>
    </TrustPage>
  );
}
