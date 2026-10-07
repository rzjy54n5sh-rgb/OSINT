'use client';

import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import type { RunInput, ScenarioRegistryView } from '@/lib/scenario-registry';

const pct = (v: number | null, digits = 1) => (v === null ? '—' : `${(v * 100).toFixed(digits).replace(/\.0+$/, '')}%`);
const cents = (v: number | null) => (v === null ? '—' : `${Math.round(v * 1000) / 10}¢`);

function MarketRow({ m }: { m: RunInput }) {
  return (
    <li className="border-t pt-2" style={{ borderColor: 'var(--border)' }} data-testid="driving-market">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-[11px] px-1 border rounded-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }} translate="no">
          {m.scenario_class}
        </span>
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }} translate="no">
          {m.venue}
        </span>
        <a
          href={m.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-body text-sm underline-offset-2 hover:underline"
          style={{ color: 'var(--accent-gold)' }}
        >
          {m.question}
        </a>
      </div>
      <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }} translate="no">
        PRICE {pct(m.probability)}
        {m.yes_bid !== null && m.yes_ask !== null ? ` · YES bid ${cents(m.yes_bid)} / ask ${cents(m.yes_ask)}` : ''}
        {m.liquidity ? ` · ${m.liquidity.replace(/_/g, ' ')}` : ''}
      </p>
      {m.transform && (
        <p className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Transform: {m.transform}
        </p>
      )}
    </li>
  );
}

/**
 * "How these numbers are made" — the method, horizon, every market that drove the latest run
 * (scenario_runs.inputs where used = true) with venue, question, price and link, and the run flags.
 * Everything shown is read from the run row; nothing is hard-coded.
 */
export function ScenarioMethodPanel({
  registry,
  hasDetailAccess,
}: {
  registry: ScenarioRegistryView;
  hasDetailAccess: boolean;
}) {
  const run = registry.run;
  const method = registry.methods.find((m) => m.method_version === (run?.method_version ?? registry.latestMethod));
  const core = registry.groups.find((g) => g.code === 'core');
  const used = run?.inputs.filter((i) => i.used) ?? [];
  const excluded = run?.inputs.filter((i) => !i.used) ?? [];
  const published = (code: string) =>
    registry.history.find((p) => p.code === code && p.conflict_day === run?.conflict_day)?.probability ?? null;

  return (
    <section
      id="method"
      className="osint-card p-5 mt-8"
      aria-labelledby="method-h"
      data-testid="scenario-method-panel"
    >
      <h2 id="method-h" className="font-display text-xl mb-1" style={{ color: 'var(--text-primary)' }}>
        HOW THESE NUMBERS ARE MADE
      </h2>
      {!run ? (
        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          No stored run for Day {registry.latestDay ?? '—'}
          {registry.latestMethod ? ` (method ${registry.latestMethod})` : ''}. Inputs are not available for this day.
        </p>
      ) : (
        <>
          <p className="font-mono text-xs mb-3" style={{ color: 'var(--text-muted)' }} translate="no">
            DAY {run.conflict_day} · METHOD {run.method_version} · HORIZON {run.horizon_end ?? '—'} · VERDICT {run.verdict}
            {run.recorded_at ? ` · RUN ${run.recorded_at.slice(0, 16).replace('T', ' ')} UTC` : ''}
            {run.provenance ? ` · ${run.provenance.toUpperCase()}` : ''}
          </p>
          {method?.description && (
            <p className="font-body text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
              {method.description}
            </p>
          )}
          <ul className="font-body text-sm leading-relaxed space-y-1 mb-4 list-disc pl-5" style={{ color: 'var(--text-secondary)' }}>
            <li>
              Each scenario class takes the highest price among its markets that pass the quality floor: bid/ask spread at most 5
              points, liquidity (Kalshi: open interest) and volume each at least $10,000, and resolution on the horizon date.
            </li>
            <li>
              B is the residual: 100 − A − C − D. The published whole numbers use largest-remainder (Hamilton) rounding so the
              core set sums to exactly 100.
            </li>
            <li>
              If A or D has no qualifying market, or the core probabilities would exceed 100, the run is KEEP_FROZEN: it is stored
              for audit and nothing is published for that day.
            </li>
            <li>
              Independent scenarios are measured on their own; with no qualifying market they are published as unmeasured, not
              zero.
            </li>
            {core && (
              <li>
                Retirement: a scenario that is below {core.fade_threshold_pct}% on the published number for{' '}
                {core.fade_consecutive_days} consecutive days starts fading; only the operator retires a core scenario.
              </li>
            )}
            {run.hormuz_gate_rule && <li>C gate: {run.hormuz_gate_rule}</li>}
          </ul>

          {run.raw_percent && (
            <p className="font-mono text-[11px] mb-4" style={{ color: 'var(--text-muted)' }} translate="no">
              RAW → PUBLISHED:{' '}
              {Object.entries(run.raw_percent)
                .map(([k, v]) => `${k} ${v} → ${published(k) ?? '—'}`)
                .join(' · ')}
            </p>
          )}

          <h3 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--accent-gold)' }}>
            Driving markets — passed the quality floor ({used.length}); each class takes its highest
          </h3>
          {used.length === 0 ? (
            <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>No market passed the floor in this run.</p>
          ) : (
            <ul className="space-y-2 mb-4">
              {used.map((m, i) => (
                <MarketRow key={`${m.url}-${i}`} m={m} />
              ))}
            </ul>
          )}

          {run.flags.length > 0 && (
            <>
              <h3 className="font-mono text-xs uppercase mb-2 mt-4" style={{ color: 'var(--accent-gold)' }}>
                Run flags
              </h3>
              <ul className="font-mono text-[11px] space-y-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }} data-testid="run-flags">
                {run.flags.map((f, i) => (
                  <li key={i}>▸ {f}</li>
                ))}
              </ul>
            </>
          )}

          <h3 className="font-mono text-xs uppercase mb-2 mt-5" style={{ color: 'var(--accent-gold)' }}>
            Markets read but not used ({excluded.length})
          </h3>
          {hasDetailAccess ? (
            excluded.length === 0 ? (
              <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>None.</p>
            ) : (
              <ul className="space-y-2">
                {excluded.map((m, i) => (
                  <li key={`${m.url}-${i}`} className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <span translate="no">{m.scenario_class} · {m.venue} · </span>
                    <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-gold)' }}>
                      {m.question}
                    </a>
                    <span> — excluded: {m.excluded_reason ?? 'not used'} (observed {pct(m.probability)}, display only)</span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>Excluded markets with their exclusion reasons</span>
              <PaywallOverlay requiredTier="informed" featureName="Scenario input audit" compact />
            </div>
          )}
        </>
      )}
    </section>
  );
}
