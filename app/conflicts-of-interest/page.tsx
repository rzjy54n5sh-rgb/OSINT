import type { Metadata } from 'next';
import { TrustPage, H2, P, List, Li, A, EmptyState } from '@/components/trust/TrustPage';
import { COI_REGISTER } from '@/lib/desk-identity';
import { formatDate } from '@/lib/trust-ledgers';

export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Conflicts of Interest — MENA Intel Desk',
  description:
    'What MENA Intel Desk discloses about interests that could affect its coverage, the recusal rule, and the register of disclosed interests.',
  alternates: { canonical: '/conflicts-of-interest' },
};

export default function ConflictsOfInterestPage() {
  return (
    <TrustPage
      kicker="MENA INTEL DESK — CONFLICTS OF INTEREST"
      title="CONFLICTS OF INTEREST"
      current="/conflicts-of-interest"
      intro={
        <>
          Readers should be able to see any interest that could pull our coverage one way. This page sets out what we disclose,
          what we do about it, and the register of disclosures.
        </>
      }
    >
      <H2 id="what">WHAT IS DISCLOSED</H2>
      <P>
        Anyone who decides what the desk publishes — the editor, the legal entity that publishes the desk, and any contributor —
        discloses any interest that touches a country, company, market or topic the desk covers, including:
      </P>
      <List>
        <Li>ownership of, or a senior role in, a company that operates in or trades with a covered country;</Li>
        <Li>clients, employers, advisory roles and paid work connected to a covered government, party or company;</Li>
        <Li>funding, sponsorship or grants received by the desk, and who provides them;</Li>
        <Li>positions in a prediction market or financial instrument the desk reports on;</Li>
        <Li>close family ties to an official, party or company the desk covers.</Li>
      </List>

      <H2 id="recusal">THE RECUSAL RULE</H2>
      <List>
        <Li>A person with a disclosed interest does not write, edit or approve content about that interest.</Li>
        <Li>Nobody at the desk trades on a market or instrument before the desk publishes something that could move it.</Li>
        <Li>
          Where content touches a disclosed interest and no one without the interest is available to handle it, the content
          carries a note naming the interest, linking to this register.
        </Li>
        <Li>The register is updated before new content touching a newly disclosed interest is published.</Li>
      </List>

      <H2 id="register">REGISTER</H2>
      {COI_REGISTER.length === 0 ? (
        <EmptyState>Register entries are being compiled.</EmptyState>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {COI_REGISTER.map((e, i) => (
            <li key={`${e.holder}-${i}`} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
              <div style={{ color: 'var(--text-primary)' }}>
                <strong>{e.holder}</strong> — {e.interest}
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Touches: {e.touches.join(', ')} · Handling: {e.handling} · Disclosed {formatDate(e.disclosedOn)}
              </div>
            </li>
          ))}
        </ol>
      )}
      <P>
        If you believe we have an undisclosed interest, tell us through the <A href="/contact">contact form</A>. Corrections
        arising from a conflict of interest are published in the <A href="/corrections">corrections log</A>.
      </P>
    </TrustPage>
  );
}
