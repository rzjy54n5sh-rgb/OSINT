export function SourcesTierMethodology() {
  return (
    <details className="group rounded-sm border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <summary
        className="font-mono text-sm cursor-pointer px-4 py-3 flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden"
        style={{ color: 'var(--accent-gold)', listStyle: 'none' }}
      >
        <span>How we classify sources</span>
        <span className="text-xs opacity-60 group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <div className="px-4 pb-4 pt-0 space-y-4 font-mono text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>Tier 1 — Independent:</strong> AFP, Reuters, BBC, NetBlocks,
          PolitiFact, HRW. Editorial independence verified. Used as primary verification.
        </p>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>Tier 2 — Regional/Conditional:</strong> Al Jazeera
          (Qatar/regional COI noted), Financial Times (conditional — economic/energy only), Middle East Eye (Gaza/Lebanon:
          Tier 2; Egypt: Tier 3). Credible but with acknowledged editorial interests.
        </p>
        <p>
          <strong style={{ color: 'var(--text-primary)' }}>Tier 3 — Party/State:</strong> PressTV, IRNA, Fars News,
          CENTCOM, IDF. Official party sources. Never used as sole verification. Reported with attribution: &quot;Iran
          state media says...&quot;
        </p>
      </div>
    </details>
  );
}
