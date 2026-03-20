type SourceRow = {
  name: string;
  display_name: string;
  is_party_source: boolean;
  language: string;
  category: string;
  neutrality_note: string | null;
  party_affiliation: string | null;
  tier: 1 | 2 | 3;
  typeLabel: string;
};

const LANG_DISPLAY: Record<string, { flag: string; label: string }> = {
  en: { flag: '', label: 'English' },
  ar: { flag: 'عربي', label: 'Arabic' },
  fa: { flag: 'فا', label: 'Persian' },
  he: { flag: 'עב', label: 'Hebrew' },
  fr: { flag: 'FR', label: 'French' },
  de: { flag: 'DE', label: 'German' },
  ru: { flag: 'RU', label: 'Russian' },
  tr: { flag: 'TR', label: 'Turkish' },
};

function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  if (tier === 1) {
    return (
      <span
        className="inline-block font-mono text-[10px] px-2 py-0.5 rounded-sm whitespace-nowrap"
        style={{ background: 'rgba(26, 122, 74, 0.25)', color: '#4ade80', border: '1px solid #1A7A4A' }}
      >
        TIER 1 — INDEPENDENT
      </span>
    );
  }
  if (tier === 2) {
    return (
      <span
        className="inline-block font-mono text-[10px] px-2 py-0.5 rounded-sm whitespace-nowrap"
        style={{ background: 'rgba(232, 197, 71, 0.12)', color: '#E8C547', border: '1px solid rgba(232, 197, 71, 0.45)' }}
      >
        TIER 2 — REGIONAL
      </span>
    );
  }
  return (
    <span
      className="inline-block font-mono text-[10px] px-2 py-0.5 rounded-sm whitespace-nowrap"
      style={{ background: 'rgba(217, 119, 6, 0.2)', color: '#fdba74', border: '1px solid #D97706' }}
    >
      TIER 3 — PARTY/STATE
    </span>
  );
}

export function SourcesTable({ sources }: { sources: SourceRow[] }) {
  return (
    <div className="w-full overflow-x-auto -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
      <table className="w-full min-w-[720px] border-collapse font-mono text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['SOURCE NAME', 'TIER', 'LANGUAGE', 'TYPE', 'BIAS NOTE'].map((h) => (
              <th
                key={h}
                className="text-left py-3 px-3 uppercase tracking-wider"
                style={{ color: 'var(--text-muted)', fontSize: '10px' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const lang = LANG_DISPLAY[s.language] ?? { flag: s.language.toUpperCase(), label: s.language };
            return (
              <tr
                key={s.name}
                className="transition-colors hover:bg-white/[0.04]"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  borderLeft: s.is_party_source ? '3px solid rgba(239, 68, 68, 0.45)' : '3px solid transparent',
                }}
              >
                <td className="py-3 px-3 align-top" style={{ color: 'var(--text-primary)' }}>
                  {s.display_name}
                </td>
                <td className="py-3 px-3 align-top">
                  <div className="flex flex-wrap items-center gap-2">
                    <TierBadge tier={s.tier} />
                    {s.is_party_source && (
                      <span
                        className="inline-block font-mono text-[10px] px-2 py-0.5 rounded-sm cursor-help"
                        style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.5)' }}
                        title="This source represents a conflict party. All claims require independent corroboration before use."
                      >
                        PARTY SOURCE
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 align-top" style={{ color: 'var(--text-secondary)' }}>
                  {s.language === 'ar' ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="text-base" dir="rtl" translate="no">
                        عربي
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>Arabic</span>
                    </span>
                  ) : (
                    <span>
                      {lang.flag && <span className="mr-2 opacity-70">{lang.flag}</span>}
                      {lang.label}
                    </span>
                  )}
                </td>
                <td className="py-3 px-3 align-top" style={{ color: 'var(--text-secondary)' }}>
                  {s.typeLabel}
                </td>
                <td className="py-3 px-3 align-top max-w-[280px]" style={{ color: 'var(--text-muted)' }}>
                  {s.neutrality_note?.trim() ||
                    s.party_affiliation?.trim() ||
                    (s.is_party_source ? 'Party-position framing; corroborate independently.' : '—')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
