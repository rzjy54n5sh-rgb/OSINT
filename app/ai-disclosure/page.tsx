import type { Metadata } from 'next';
import { TrustPage, H2, P, List, Li, A } from '@/components/trust/TrustPage';
import { PRE_PUBLICATION_HUMAN_REVIEW } from '@/lib/desk-identity';

export const revalidate = 900;

export const metadata: Metadata = {
  title: 'How We Use AI — MENA Intel Desk',
  description:
    'Plain disclosure of how MENA Intel Desk uses AI: what an AI agent drafts, what is automated without AI, what a person decides and checks, and the rules the AI must follow.',
  alternates: { canonical: '/ai-disclosure' },
};

export default function AiDisclosurePage() {
  return (
    <TrustPage
      kicker="MENA INTEL DESK — AI DISCLOSURE"
      title="HOW WE USE AI"
      current="/ai-disclosure"
      updated="8 October 2026"
      intro={
        <>
          This desk is built with AI. You should know exactly where, so this page says what an AI writes, what runs
          automatically without AI, and what a person decides. Every brief also carries a one-line notice saying it was drafted
          with AI.
        </>
      }
    >
      <H2 id="ai-writes">WHAT AN AI AGENT WRITES</H2>
      <List>
        <Li>
          <strong>Daily and weekly briefs.</strong> An AI agent (Anthropic&apos;s Claude, run once a day as a scheduled task)
          reads the collected articles and other public sources and drafts each brief, paragraph by paragraph, with links to the
          sources each paragraph relies on.
        </Li>
        <Li>
          <strong>War Posture scores.</strong> The same agent proposes each government&apos;s score from quoted, linked
          statements. The database rejects any score that does not list a source feeding it, and a public-opinion band is left
          empty when there is no admissible evidence rather than guessed.
        </Li>
        <Li>
          <strong>Market and shipping figures that have no automated feed</strong> (for example the open-market Iranian rial
          rate or Strait of Hormuz traffic) are entered by the daily build with the source they were quoted from.
        </Li>
      </List>

      <H2 id="rules">RULES THE AI MUST FOLLOW</H2>
      <List>
        <Li>Open every page it cites and confirm the claim is on that page before using it.</Li>
        <Li>Check every quotation word for word against the page text; a summary of a page is not enough.</Li>
        <Li>
          Remove anything it cannot confirm. Where nothing confirmed is left, the brief says &quot;No sourced data available&quot;
          instead of filling the gap.
        </Li>
        <Li>Label state and party sources as such, and never use them as evidence of what a population thinks.</Li>
        <Li>Present every side&apos;s framing, with each party&apos;s own name for its operation.</Li>
      </List>
      <P>
        AI can still misread a source or miss context. That is why every paragraph links to its sources, so you can check them,
        and why errors are corrected in public.
      </P>

      <H2 id="no-ai">WHAT IS AUTOMATED WITHOUT AI</H2>
      <List>
        <Li>News collection: public RSS feeds read hourly; headline, summary, link, outlet and time are stored.</Li>
        <Li>Market prices: collected every 30 minutes from public market data.</Li>
        <Li>Search interest: Google Trends readings for conflict-related terms.</Li>
        <Li>
          Fact-checks: taken from independent fact-checkers&apos; feeds; the verdict is the fact-checker&apos;s own published
          rating, never ours.
        </Li>
        <Li>
          Scenario probabilities: computed by a fixed, published formula from prediction-market prices. No AI estimates them.
          The operator can override the formula, but an override is stored with its reason and labelled in the method shown
          with the numbers.
        </Li>
      </List>

      <H2 id="humans">WHAT A PERSON DECIDES AND CHECKS</H2>
      <List>
        <Li>The methods themselves — how scores and probabilities are made — are set by the operator&apos;s written rulings.</Li>
        <Li>A new scenario is never added automatically: each candidate needs a person&apos;s approval.</Li>
        <Li>Each prediction market linked to a scenario needs a person&apos;s approval before it counts.</Li>
        <Li>
          {PRE_PUBLICATION_HUMAN_REVIEW
            ? 'Every brief is reviewed by an editor before it is published.'
            : 'Briefs are published by the automated daily build. They are not edited line by line by a person before they go live.'}
        </Li>
        <Li>
          Every correction to a published brief is logged in public in the <A href="/corrections">corrections log</A>.
        </Li>
      </List>

      <H2 id="not">WHAT WE DO NOT USE AI FOR</H2>
      <List>
        <Li>We do not use AI to estimate scenario probabilities or to give fact-check verdicts.</Li>
        <Li>We do not publish AI-generated images, audio or video as evidence of events.</Li>
        <Li>We do not let AI invent quotations, figures or sources: anything without a confirmed source is removed.</Li>
      </List>

      <H2 id="errors">IF YOU SPOT AN ERROR</H2>
      <P>
        Use the <A href="/contact">contact form</A> with the page, the sentence and, if you can, a source. The rest of our rules
        are in the <A href="/charter">editorial charter</A>, and the full method is on the{' '}
        <A href="/methodology">methodology page</A>.
      </P>
    </TrustPage>
  );
}
