/**
 * Country page War Posture block (v2 per conflict; v1 blended fallback). No hooks.
 * EG / AE / SA: stated-positions ledger only — no score, label, band or colour.
 */
import Link from 'next/link';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { formatBand, formatGap } from '@/lib/nai-v2';
import {
  BLENDED_CONFLICT,
  conflictName as nameFor,
  isPostureWithheld,
  type ConflictDef,
  type CountryPosture,
  type PostureView,
} from '@/lib/posture';
import { CitedReporting, EvidenceQuote, PositionsLedger, PostureAge, PostureChip, V1FrozenTag } from '@/components/posture/PostureParts';

function ConflictCard({ r, conflicts }: { r: PostureView; conflicts: readonly ConflictDef[] }) {
  const title = r.conflict_code === null ? BLENDED_CONFLICT.name : (conflicts.find((c) => c.conflict_code === r.conflict_code)?.name ?? r.conflict_code);
  return (
    <article className="border rounded-sm p-3" style={{ borderColor: 'var(--border)' }} data-testid="posture-conflict-card" data-conflict={r.conflict_code ?? 'blended-v1'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-xs uppercase" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {r.score_day != null && (
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }} translate="no">
            CODED DAY {r.score_day}
            {r.as_of ? ` · ${r.as_of}` : ''}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {r.expressed_score !== null && (
          <span className="font-display text-3xl" style={{ color: 'var(--text-primary)' }} translate="no" data-testid="war-posture-expressed">
            {r.expressed_score}
          </span>
        )}
        <PostureChip row={r} />
      </div>
      {/* v1 row kept while a v2 statement awaits coding: "War Posture v1 — frozen, Day N · … not yet coded" */}
      {r.method === 'war-posture-v1' && r.v2UncodedConflicts.length > 0 && <V1FrozenTag row={r} className="block mt-1" />}
      <PostureAge row={r} className="block mt-1" />
      {r.change_reason === 'new_evidence' && r.previous_score != null && r.expressed_score != null && (
        <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-muted)' }} translate="no">
          Changed on new evidence: {r.previous_score} → {r.expressed_score} (since Day {r.previous_day})
        </p>
      )}
      {r.change_reason === 'reverification' && r.note && (
        <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
          Re-coded on the same evidence: {r.note}
        </p>
      )}
      {r.stance === 'nulled' && r.note && (
        <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
          Correction: {r.note}
        </p>
      )}
      {r.evidence && (
        <div className="mt-3">
          <EvidenceQuote e={r.evidence} />
        </div>
      )}
      {r.method === 'war-posture-v1' && (
        <div className="mt-3 space-y-2">
          {r.expressed_basis && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-mono text-[11px] uppercase block" style={{ color: 'var(--text-muted)' }}>
                Basis (desk summary)
              </span>
              {r.expressed_basis}
            </p>
          )}
          <CitedReporting sources={r.cited} />
        </div>
      )}
      {r.stance === 'position' && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {r.latentLocked ? (
            <span className="inline-flex items-center gap-1">
              SOCIETY (BAND) <PaywallOverlay requiredTier="informed" featureName="War Posture latent band" compact />
            </span>
          ) : (
            <span translate="no">SOCIETY (BAND) {r.latent_low === null ? 'no admissible evidence' : formatBand(r.latent_low, r.latent_high)}</span>
          )}
          {r.gapLocked ? (
            <span className="inline-flex items-center gap-1">
              GAP <PaywallOverlay requiredTier="informed" featureName="War Posture gap analysis" compact />
            </span>
          ) : (
            <span translate="no">GAP {formatGap(r.gap)}</span>
          )}
          {r.category && <span translate="no">CATEGORY {r.category}</span>}
        </div>
      )}
    </article>
  );
}

export function PostureCountryPanel({
  countryCode,
  posture,
  conflicts,
}: {
  countryCode: string;
  posture: CountryPosture | null;
  conflicts: readonly ConflictDef[];
}) {
  const withheld = isPostureWithheld(countryCode);
  const rows = posture?.rows ?? [];
  const ledger = posture?.ledger ?? [];
  const cn = (code: string | null) => nameFor(conflicts, code);
  return (
    <section className="osint-card p-5 mb-6" data-testid="war-posture-panel" aria-labelledby="war-posture-h" data-schema={posture?.schema ?? 'none'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h2 id="war-posture-h" className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
          WAR POSTURE
        </h2>
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }} translate="no">
          {withheld ? 'STATED POSITIONS LEDGER' : posture?.schema === 'v2' ? 'PER CONFLICT · METHOD V2' : 'ONE NUMBER ACROSS WARS · METHOD V1'}
        </span>
      </div>
      {withheld ? (
        <PositionsLedger ledger={ledger} conflictName={cn} withheld />
      ) : rows.length === 0 ? (
        <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="war-posture-empty">
          No position on record for any tracked conflict. A posture is left empty only when no statement has ever been
          captured; nothing is guessed in its place.
        </p>
      ) : (
        <>
          {posture?.schema === 'v1' && (
            <p className="font-mono text-[11px] mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              This country is still shown on the v1 method: one number across wars, frozen since Day 227 (no longer updated).
              Per-conflict positions replace it once coded.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3">
            {rows.map((r) => (
              <ConflictCard key={`${r.conflict_code ?? 'v1'}`} r={r} conflicts={conflicts} />
            ))}
          </div>
          {ledger.length > 0 && (
            <details className="mt-4">
              <summary className="font-mono text-[11px] uppercase cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                Evidence ledger ({ledger.length})
              </summary>
              <div className="mt-3">
                <PositionsLedger ledger={ledger} conflictName={cn} withheld={false} />
              </div>
            </details>
          )}
        </>
      )}
      <p className="font-mono text-[11px] mt-4" style={{ color: 'var(--text-muted)' }}>
        <Link prefetch={false} href="/methodology#war-posture" style={{ color: 'var(--accent-gold)' }}>
          How War Posture is coded →
        </Link>
      </p>
    </section>
  );
}
