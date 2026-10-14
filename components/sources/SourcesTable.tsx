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
        className="inline-block font-mono text-[13px] px-2 py-0.5 rounded-sm whitespace-nowrap"
        style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--line-strong)' }}
      >
        TIER 1 — INDEPENDENT
      </span>
    );
  }
  if (tier === 2) {
    return (
      <span
        className="inline-block font-mono text-[13px] px-2 py-0.5 rounded-sm whitespace-nowrap"
        style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--line-strong)' }}
      >
        TIER 2 — REGIONAL
      </span>
    );
  }
  return (
    <span
      className="inline-block font-mono text-[13px] px-2 py-0.5 rounded-sm whitespace-nowrap"
      style={{ background: 'var(--status-disrupted-tint)', color: 'var(--status-disrupted)', border: '1px solid var(--status-disrupted)' }}
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
                style={{ color: 'var(--text-muted)', fontSize: '13px' }}
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
                className="transition-colors hover:bg-[var(--surface-2)]"
                style={{
                  borderBottom: '1px solid color-mix(in srgb, var(--text) 6%, transparent)',
                  borderLeft: s.is_party_source ? '3px solid color-mix(in srgb, var(--status-closed) 45%, transparent)' : '3px solid transparent',
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
                        className="inline-block font-mono text-[13px] px-2 py-0.5 rounded-sm cursor-help"
                        style={{ background: 'var(--status-closed-tint)', color: 'var(--status-closed)', border: '1px solid var(--status-closed)' }}
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
                      {lang.flag && <span className="mr-2">{lang.flag}</span>}
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
