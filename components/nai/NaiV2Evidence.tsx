import type { NaiV2View } from '@/lib/nai-v2';

/**
 * Confidence + cited sources for one nai_scores_v2 row. No hooks — safe in Server and Client Components.
 * Do not nest inside <a>/<button> (it renders links).
 * Every row in nai_scores_v2 carries >= 1 source (DB CHECK); party/state sources are labelled as such.
 */
export function NaiV2Evidence({ row, compact = false }: { row: NaiV2View; compact?: boolean }) {
  const list = compact ? row.sources.slice(0, 3) : row.sources;
  return (
    <div className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
      <p translate="no">
        CONFIDENCE <span style={{ color: 'var(--text-secondary)' }}>{row.confidence.toUpperCase()}</span>
        {' · '}AS OF {row.as_of}
      </p>
      <ul className="mt-1 space-y-1">
        {list.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            <span
              className="px-1 mr-1 rounded-sm border text-[10px]"
              style={{ borderColor: 'var(--border)' }}
              title={s.feeds === 'E' ? 'Evidence for the expressed (official) score' : 'Evidence for the latent (societal) band'}
              translate="no"
            >
              {s.feeds}
            </span>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              style={{ color: 'var(--accent-gold)' }}
            >
              {s.name}
            </a>
            {s.party_source && (
              <span className="ml-1 uppercase" style={{ color: 'var(--accent-orange)' }} title="Party / state source — requires independent corroboration">
                (party source)
              </span>
            )}
            {!compact && s.claim && <span className="block" style={{ color: 'var(--text-secondary)' }}>{s.claim}</span>}
            {!compact && s.published_at && <span className="block opacity-80">{s.published_at}</span>}
          </li>
        ))}
      </ul>
      {compact && row.sources.length > list.length && (
        <p className="mt-1">+{row.sources.length - list.length} more source(s) — open country for full list</p>
      )}
      {row.hiddenLatentSourceCount > 0 && (
        <p className="mt-1">
          {row.hiddenLatentSourceCount} latent-evidence source(s) available on Informed tier.
        </p>
      )}
    </div>
  );
}
