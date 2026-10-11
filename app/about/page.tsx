import type { Metadata } from 'next';
import { TrustPage, H2, P, List, Li, A } from '@/components/trust/TrustPage';
import { identityFields, DESK_NAME, PRE_PUBLICATION_HUMAN_REVIEW } from '@/lib/desk-identity';
import { TRACKED_COUNTRY_CODES } from '@/lib/countries';

/** Static text + config; ISR so a config change ships with the next deploy and the page stays cached. */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'About — MENA Intel Desk',
  description:
    'What MENA Intel Desk is, how its briefs and scores are made (AI-assisted, from public sources), who is responsible, and how to complain or ask for a correction.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  const identity = identityFields();
  return (
    <TrustPage
      kicker="MENA INTEL DESK — ABOUT"
      title="ABOUT THE DESK"
      current="/about"
      intro={
        <>
          {DESK_NAME} is an open-source intelligence desk. It follows the US–Iran war that began on 28 February 2026 and, since
          7 October 2026, the Horn of Africa &amp; Red Sea, across {TRACKED_COUNTRY_CODES.length} countries — using only public
          information, with a link to every source.
        </>
      }
    >
      {identity.length > 0 && (
        <>
          <H2 id="who">WHO IS RESPONSIBLE</H2>
          <dl style={{ margin: '0 0 12px 0', display: 'grid', gridTemplateColumns: 'minmax(110px, max-content) 1fr', gap: '6px 16px' }}>
            {identity.map((f) => (
              <div key={f.label} style={{ display: 'contents' }}>
                <dt style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-muted)' }}>{f.label}</dt>
                <dd style={{ margin: 0, color: 'var(--text-primary)' }}>{f.href ? <A href={f.href}>{f.value}</A> : f.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <H2 id="what">WHAT THE DESK DOES</H2>
      <List>
        <Li>Publishes daily intelligence briefs with a citation on every paragraph, and weekly digests.</Li>
        <Li>
          Scores each tracked government&apos;s official position on continuing the war (War Posture), always from quoted, linked
          statements.
        </Li>
        <Li>
          Shows scenario probabilities computed by a fixed, published formula from prediction-market prices — not guessed by a
          model; any operator override is recorded with its reason.
        </Li>
        <Li>Tracks market and shipping indicators and fact-checks published by independent fact-checkers.</Li>
      </List>
      <P>
        It is not a news outlet and does no original reporting. It is not affiliated with any government, military, intelligence
        service or political organisation. Every party&apos;s framing is presented and party or state sources are labelled as
        such. The full method is on the <A href="/methodology">methodology page</A>; the editorial rules are in the{' '}
        <A href="/charter">charter</A>.
      </P>

      <H2 id="how">HOW IT IS MADE</H2>
      <P>
        The desk is AI-assisted. Automated collectors gather news feeds, market prices, search trends and fact-checks without
        any AI. An AI agent then drafts the daily briefs and War Posture scores from those sources; it must open every page it
        cites and drop any claim it cannot confirm there.
      </P>
      <P>
        {PRE_PUBLICATION_HUMAN_REVIEW
          ? 'Every brief is reviewed by an editor before it is published.'
          : 'Briefs are published by the automated daily build; they are not edited line by line by a person before they go live. A person sets the methods through written rulings and approves every new scenario and every prediction market used.'}{' '}
        The details — what is automated, what the AI does and what a person checks — are on the{' '}
        <A href="/ai-disclosure">AI disclosure page</A>.
      </P>

      <H2 id="complain">COMPLAINTS AND CORRECTIONS</H2>
      <P>
        If something on this site is wrong, unfair or missing a party&apos;s view, tell us through the{' '}
        <A href="/contact">contact form</A>
        {identity.some((f) => f.href?.startsWith('mailto:')) ? ' or by email (above)' : ''}. Please include the page, the
        sentence and, if you can, a source. Corrections are published, with what changed, in the{' '}
        <A href="/corrections">corrections log</A>.
      </P>
      <P>
        How forecasts are scored, including the misses, is on the <A href="/track-record">track record</A> page. Interests that
        could affect our coverage are listed in the <A href="/conflicts-of-interest">conflicts-of-interest register</A>.
      </P>
    </TrustPage>
  );
}
