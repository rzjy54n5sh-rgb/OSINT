'use client';

const COUNTRY_EMOJI: Record<string, string> = {
  IR: '🇮🇷', SA: '🇸🇦', IQ: '🇮🇶', SY: '🇸🇾', LB: '🇱🇧', YE: '🇾🇪',
  EG: '🇪🇬', JO: '🇯🇴', AE: '🇦🇪', QA: '🇶🇦', KW: '🇰🇼', BH: '🇧🇭',
  OM: '🇴🇲', IL: '🇮🇱', PS: '🇵🇸', TR: '🇹🇷', LY: '🇱🇾', SD: '🇸🇩',
  DZ: '🇩🇿', MA: '🇲🇦', TN: '🇹🇳', GB: '🇬🇧', IN: '🇮🇳', US: '🇺🇸', FR: '🇫🇷', DE: '🇩🇪', PK: '🇵🇰', CN: '🇨🇳', RU: '🇷🇺',
};

export const COUNTRY_NAMES: Record<string, string> = {
  IL: 'Israel', GB: 'United Kingdom', AE: 'UAE', QA: 'Qatar', SA: 'Saudi Arabia',
  KW: 'Kuwait', IN: 'India', US: 'United States', JO: 'Jordan', TR: 'Turkey',
  FR: 'France', EG: 'Egypt', DE: 'Germany', PK: 'Pakistan', LB: 'Lebanon',
  CN: 'China', IQ: 'Iraq', YE: 'Yemen', RU: 'Russia', IR: 'Iran',
  SY: 'Syria', OM: 'Oman', BH: 'Bahrain', PS: 'Palestine', LY: 'Libya', SD: 'Sudan', DZ: 'Algeria', MA: 'Morocco', TN: 'Tunisia',
};

type CountryFlagProps = {
  code: string;
  name?: string | null;
  className?: string;
};

export function CountryFlag({ code, name, className = '' }: CountryFlagProps) {
  const emoji = COUNTRY_EMOJI[code?.toUpperCase()] ?? '🏳️';
  const displayName = name ?? COUNTRY_NAMES[code?.toUpperCase()] ?? code ?? '—';
  const label = code ? `${code} — ${displayName}` : displayName;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-sm ${className}`} translate="no">
      <span aria-hidden>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}
