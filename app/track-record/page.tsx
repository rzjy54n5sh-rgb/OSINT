import type { Metadata } from 'next';
import { TrustPage, H2, P, List, Li, A, NotYetAvailable, EmptyState } from '@/components/trust/TrustPage';
import {
  fetchTrackRecord,
  scoreForecasts,
  effectiveResolutions,
  formatDate,
  formatUtc,
  safeHref,
  type ForecastRow,
} from '@/lib/trust-ledgers';

/** ISR: the ledger is append-only and written at most daily. No per-visitor content. */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Track Record — MENA Intel Desk',
  description:
    'Every forecast the desk registers in advance, how each question resolved, and the Brier score over resolved questions — misses included.',
  alternates: { canonical: '/track-record' },
};

const mono = { fontFamily: 'IBM Plex Mono', fontSize: 12 } as const;
const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;

function ChainStatus({ chain }: { chain: Record<string, unknown> | null | 'unknown' }) {
  const ok = chain === null;
  const text =
    chain === null
      ? 'Ledger hash chain verified: every entry is intact.'
      : chain === 'unknown'
        ? 'Hash chain verification could not run just now.'
        : `Hash chain check FAILED at entry ${String(chain.chain_seq ?? '?')} (${String(chain.problem ?? 'unknown problem')}).`;
  return (
    <p role="status" style={{ ...mono, color: ok ? 'var(--accent-green)' : 'var(--accent-orange)', margin: '0 0 16px 0' }}>
      {ok ? '✓ ' : '! '}
      {text}
    </p>
  );
}

function OpenForecasts({ forecasts }: { forecasts: ForecastRow[] }) {
  if (forecasts.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px 6px 0' }}>QUESTION</th>
            <th style={{ padding: '6px 8px' }}>FORECASTER</th>
            <th style={{ padding: '6px 8px' }}>P(YES)</th>
            <th style={{ padding: '6px 0 6px 8px' }}>REGISTERED</th>
          </tr>
        </thead>
        <tbody>
          {forecasts.map((f) => (
            <tr key={f.id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
              <td style={{ padding: '8px 8px 8px 0', color: 'var(--text-primary)' }}>
                {f.question_text}
                <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Resolves by {formatDate(f.horizon_date)} · {f.resolution_criteria}
                </div>
              </td>
              <td style={{ ...mono, padding: 8 }}>{f.forecaster}</td>
              <td style={{ ...mono, padding: 8 }}>{pct(f.probability)}</td>
              <td style={{ ...mono, padding: '8px 0 8px 8px', whiteSpace: 'nowrap' }}>{formatUtc(f.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TrackRecordPage() {
  const res = await fetchTrackRecord();

  let body: React.ReactNode;
  if (res.status === 'unavailable') {
    body = <NotYetAvailable what="forecast ledger" reason={res.reason} />;
  } else if (res.rows.forecasts.length === 0) {
    body = (
      <EmptyState>
        No forecasts have been registered yet. Pre-registration starts with the first Chokepoint Weekly: from then on every
        forecast is recorded here before the event, with its question, resolution rule and deadline.
      </EmptyState>
    );
  } else {
    const { forecasts, resolutions, chain } = res.rows;
    const { scored, perForecaster } = scoreForecasts(forecasts, resolutions);
    const eff = effectiveResolutions(resolutions);
    const open = forecasts
      .filter((f) => !eff.has(f.question_id))
      .sort((a, b) => b.chain_seq - a.chain_seq);
    body = (
      <>
        <ChainStatus chain={chain} />
        <H2 id="scores">SCORES ON RESOLVED QUESTIONS</H2>
        {perForecaster.length === 0 ? (
          <EmptyState>No registered question has resolved yet, so there is no score to show. Open forecasts are listed below.</EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 12 }}>
              <thead>
                <tr style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px 6px 0' }}>FORECASTER</th>
                  <th style={{ padding: '6px 8px' }}>RESOLVED QUESTIONS</th>
                  <th style={{ padding: '6px 0 6px 8px' }}>BRIER SCORE (LOWER IS BETTER)</th>
                </tr>
              </thead>
              <tbody>
                {perForecaster.map((s) => (
                  <tr key={s.forecaster} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...mono, padding: '8px 8px 8px 0', color: 'var(--text-primary)' }}>{s.forecaster}</td>
                    <td style={{ ...mono, padding: 8 }}>{s.questions}</td>
                    <td style={{ ...mono, padding: '8px 0 8px 8px' }}>{s.brier.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {scored.length > 0 && (
          <>
            <H2 id="resolved">RESOLVED QUESTIONS</H2>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {scored.map((s) => {
                const href = safeHref(s.sourceUrl);
                return (
                  <li key={`${s.forecaster}-${s.questionId}`} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
                    <div style={{ color: 'var(--text-primary)' }}>{s.questionText}</div>
                    <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {s.forecaster} said {pct(s.probability)} on {formatUtc(s.forecastAt)} · resolved {s.outcome ? 'YES' : 'NO'} on{' '}
                      {formatDate(s.resolvedAt)} · Brier {s.brier.toFixed(3)}
                      {href && (
                        <>
                          {' · '}
                          <A href={href}>resolution source</A>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
        <H2 id="open">OPEN FORECASTS</H2>
        {open.length === 0 ? <P>No open forecasts right now.</P> : <OpenForecasts forecasts={open} />}
      </>
    );
  }

  return (
    <TrustPage
      kicker="MENA INTEL DESK — TRACK RECORD"
      title="TRACK RECORD"
      current="/track-record"
      intro={
        <>
          A forecast only counts if it was written down before the event. Every forecast here is registered in advance in an
          append-only ledger — it cannot be edited or deleted afterwards — and scored once its question resolves, hits and misses
          alike.
        </>
      }
    >
      {body}

      <H2 id="how-scored">HOW SCORING WORKS</H2>
      <P>
        Each question has a yes/no answer, a written resolution rule and a deadline, all fixed when the forecast is registered.
        A forecast is a probability that the answer will be yes.
      </P>
      <P>
        When a question resolves we compute the <strong>Brier score</strong>: the square of the gap between the forecast and what
        happened, counting yes as 1 and no as 0. Saying 80% for something that happened scores (0.8 − 1)² = 0.04; saying 80% for
        something that did not happen scores (0.8 − 0)² = 0.64. 0 is perfect; always answering 50% scores 0.25; 1 is the worst
        possible. The score shown is the average over resolved questions only.
      </P>
      <List>
        <Li>If a forecaster updates a forecast, the last one registered before the question resolved is the one scored.</Li>
        <Li>Questions that are voided (for example, the event becomes impossible to judge) are marked annulled and not scored.</Li>
        <Li>
          Market prices are registered alongside the desk&apos;s own forecasts (forecaster names starting with
          &quot;market:&quot;) so the desk can be compared with the crowd.
        </Li>
        <Li>
          A wrong resolution is never edited: a new resolution supersedes it and the change is logged in the{' '}
          <A href="/corrections">corrections log</A>.
        </Li>
      </List>

      <H2 id="verify">HOW TO CHECK WE DID NOT REWRITE IT</H2>
      <P>
        Each ledger entry carries a SHA-256 hash of its own contents chained to the hash of the entry before it, so changing or
        removing any past entry breaks every hash after it.
        {res.status === 'ok' && (
          <>
            {' '}This page runs the check each time it is rebuilt; anyone can also run it through the public database function{' '}
            <code style={mono}>verify_forecast_chain()</code>. A daily count and hash of each ledger is committed to the{' '}
            <code style={mono}>ledger-hashes</code> branch of the{' '}
            <A href="https://github.com/rzjy54n5sh-rgb/OSINT">public code repository</A>, so a rewrite would also show up
            against that history.
          </>
        )}
      </P>
    </TrustPage>
  );
}
