import { createClient } from '@/utils/supabase/server';
import { OsintCard } from '@/components/OsintCard';
import { SourcesTable } from '@/components/sources/SourcesTable';
import { SourcesTierMethodology } from '@/components/sources/SourcesTierMethodology';

export const metadata = {
  title: 'Source Universe · MENA Intel Desk',
  description:
    'Full disclosure of RSS and feed sources used by MENA Intel Desk — tiers, languages, and party-state attribution.',
};

type SourceRow = {
  name: string;
  display_name: string;
  is_party_source: boolean;
  language: string;
  category: string;
  is_active: boolean;
  neutrality_note: string | null;
  party_affiliation: string | null;
};

/** Tier when `article_sources.tier` is absent; aligns with public methodology. */
const TIER1_NAMES = new Set([
  'reuters',
  'ap',
  'afp',
  'bbc_middleeast',
  'guardian',
  'netblocks',
  'hrw',
]);

function inferSourceTier(row: { name: string; is_party_source: boolean }): 1 | 2 | 3 {
  if (row.is_party_source) return 3;
  if (TIER1_NAMES.has(row.name)) return 1;
  return 2;
}

function typeLabel(row: SourceRow): string {
  if (row.is_party_source) return 'Party / state communicator';
  if (row.category === 'market') return 'Market intelligence';
  if (
    ['iran', 'gulf', 'egypt', 'uae', 'israel', 'lebanon', 'iraq', 'yemen'].includes(row.category)
  ) {
    return 'Regional coverage';
  }
  return 'International / specialty';
}

export default async function SourcesPage() {
  const supabase = await createClient();
  const { data: raw, error } = await supabase
    .from('article_sources')
    .select(
      'name, display_name, is_party_source, language, category, is_active, neutrality_note, party_affiliation'
    )
    .eq('is_active', true)
    .order('display_name', { ascending: true });

  const rows = (raw ?? []) as SourceRow[];
  const enriched = rows.map((r) => ({
    ...r,
    tier: inferSourceTier(r),
    typeLabel: typeLabel(r),
  }));
  enriched.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.display_name.localeCompare(b.display_name);
  });

  const total = enriched.length;
  const tier1Count = enriched.filter((s) => s.tier === 1).length;
  const partyCount = enriched.filter((s) => s.is_party_source).length;
  const languageCount = new Set(enriched.map((s) => s.language)).size;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-3" style={{ color: 'var(--text-primary)' }}>
        SOURCE UNIVERSE
      </h1>
      <p className="font-mono text-sm mb-8 max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
        MENA Intel Desk monitors <strong style={{ color: 'var(--accent-gold)' }}>{total}</strong> active
        sources across <strong style={{ color: 'var(--accent-gold)' }}>{languageCount}</strong>{' '}
        languages. All sources are disclosed.
      </p>

      {error && (
        <p className="font-mono text-xs mb-6" style={{ color: 'var(--accent-red)' }}>
          [SOURCE LIST UNAVAILABLE]
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total sources', value: String(total) },
          { label: 'Tier 1', value: String(tier1Count) },
          { label: 'Party sources', value: String(partyCount) },
          { label: 'Languages', value: String(languageCount) },
        ].map((s) => (
          <OsintCard key={s.label} className="py-4">
            <p className="font-mono text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              {s.label}
            </p>
            <p className="font-display text-2xl" style={{ color: 'var(--text-primary)' }}>
              {s.value}
            </p>
          </OsintCard>
        ))}
      </div>

      <OsintCard className="mb-8 border-l-2" style={{ borderLeftColor: 'var(--accent-gold)' }}>
        <h2 className="font-mono text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--accent-gold)' }}>
          ◆ SOURCE UNIVERSE AUDIT REQUIREMENT
        </h2>
        <p className="font-mono text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Every intelligence report requires at minimum:
        </p>
        <ul className="font-mono text-xs space-y-2 mb-4" style={{ color: 'var(--text-secondary)' }}>
          <li>✓ At least 1 Arabic-language source</li>
          <li>✓ At least 1 regional source (non-Western)</li>
          <li>✓ At least 1 non-Western perspective source</li>
        </ul>
        <p className="font-mono text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Reports that do not meet this threshold are flagged as incomplete. This requirement is structural — not
          editorial — to prevent systematic English-language framing bias.
        </p>
      </OsintCard>

      <SourcesTable sources={enriched} />

      <div className="mt-10">
        <SourcesTierMethodology />
      </div>
    </div>
  );
}
