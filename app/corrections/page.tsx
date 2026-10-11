import type { Metadata } from 'next';
import { TrustPage, H2, P, List, Li, A, NotYetAvailable, EmptyState } from '@/components/trust/TrustPage';
import { fetchCorrections, formatUtc, type CorrectionRow } from '@/lib/trust-ledgers';
import { CORRECTIONS_LOG_START } from '@/lib/desk-identity';

/** ISR: the log changes rarely; a new correction shows within 15 minutes. No per-visitor content. */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Corrections — MENA Intel Desk',
  description: 'Every correction to a published MENA Intel Desk brief, newest first, with what changed and why.',
  alternates: { canonical: '/corrections' },
};

const CLASS_LABEL: Record<CorrectionRow['correction_class'], { label: string; color: string }> = {
  material: { label: 'MATERIAL', color: 'var(--accent-red)' },
  minor: { label: 'MINOR', color: 'var(--accent-gold)' },
  clarification: { label: 'CLARIFICATION', color: 'var(--accent-blue)' },
  reply: { label: 'RIGHT OF REPLY', color: 'var(--text-secondary)' },
};

const BRIEF_TYPE = /^[a-z_]{1,40}$/;

function targetLink(c: CorrectionRow): { href: string; label: string } | null {
  if (c.target_table === 'daily_briefings' && c.conflict_day && c.report_type && BRIEF_TYPE.test(c.report_type)) {
    return { href: `/briefings/${c.conflict_day}/${c.report_type}`, label: `Day ${c.conflict_day} · ${c.report_type.replace(/_/g, ' ')} brief` };
  }
  return null;
}

function Excerpt({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '1px' }}>{label}</div>
      <blockquote style={{ margin: '2px 0 0 0', paddingLeft: 10, borderLeft: '2px solid var(--border)', whiteSpace: 'pre-wrap', fontSize: 14 }}>
        {text}
      </blockquote>
    </div>
  );
}

export default async function CorrectionsPage() {
  const res = await fetchCorrections();
  return (
    <TrustPage
      kicker="MENA INTEL DESK — CORRECTIONS LOG"
      title="CORRECTIONS"
      current="/corrections"
      intro={
        <>
          When we get something wrong we fix it and say so here, newest first. To report an error, use the{' '}
          <A href="/contact">contact form</A> with the page, the sentence and, if you can, a source.
        </>
      }
    >
      {res.status === 'unavailable' ? (
        <NotYetAvailable what="corrections log" reason={res.reason} />
      ) : res.rows.length === 0 ? (
        <EmptyState>No corrections logged yet. The log started on {CORRECTIONS_LOG_START}.</EmptyState>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {res.rows.map((c) => {
            const cls = CLASS_LABEL[c.correction_class] ?? CLASS_LABEL.minor;
            const target = targetLink(c);
            return (
              <li key={c.id} style={{ borderBottom: '1px solid var(--border)', padding: '16px 0' }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 6 }}>
                  <time dateTime={c.created_at} style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatUtc(c.created_at)}
                  </time>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: cls.color, border: '1px solid currentColor', padding: '0 6px', letterSpacing: '1px' }}>
                    {cls.label}
                  </span>
                  {target && <A href={target.href}>{target.label}</A>}
                </div>
                <p style={{ margin: 0, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{c.summary}</p>
                {c.before_excerpt && <Excerpt label="BEFORE" text={c.before_excerpt} />}
                {c.after_excerpt && <Excerpt label="AFTER" text={c.after_excerpt} />}
              </li>
            );
          })}
        </ol>
      )}

      <H2 id="classes">WHAT THE LABELS MEAN</H2>
      <List>
        <Li><strong>Material</strong> — a fact, number, quote, attribution or conclusion was wrong and changed what a reader would take away.</Li>
        <Li><strong>Minor</strong> — a wrong detail that does not change the meaning, such as a misspelt name or a wrong date in a citation.</Li>
        <Li><strong>Clarification</strong> — the text was accurate but could be misread, or lacked context; we added it.</Li>
        <Li><strong>Right of reply</strong> — a person or organisation we wrote about responded, and we added their response.</Li>
      </List>
      {res.status === 'ok' && (
        <P>
          Since {CORRECTIONS_LOG_START}, the database itself refuses any change to a published brief made more than two hours
          after it was generated unless the change is logged here first. Edits inside those two hours are the daily build
          finishing its own run.
        </P>
      )}
      <P>
        How AI is used in drafting is explained on the <A href="/ai-disclosure">AI disclosure page</A>; the rules we hold
        ourselves to are in the <A href="/charter">editorial charter</A>.
      </P>
    </TrustPage>
  );
}
