'use client';

const COUNTRY_EMOJI: Record<string, string> = {
  IR: '🇮🇷', SA: '🇸🇦', IQ: '🇮🇶', SY: '🇸🇾', LB: '🇱🇧', YE: '🇾🇪',
  EG: '🇪🇬', JO: '🇯🇴', AE: '🇦🇪', QA: '🇶🇦', KW: '🇰🇼', BH: '🇧🇭',
  OM: '🇴🇲', IL: '🇮🇱', PS: '🇵🇸', TR: '🇹🇷', LY: '🇱🇾', SD: '🇸🇩',
  DZ: '🇩🇿', MA: '🇲🇦', TN: '🇹🇳',
};

type CountryFlagProps = {
  code: string;
  name?: string | null;
  className?: string;
};

export function CountryFlag({ code, name, className = '' }: CountryFlagProps) {
  const emoji = COUNTRY_EMOJI[code?.toUpperCase()] ?? '🏳️';
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-sm ${className}`}>
      <span aria-hidden>{emoji}</span>
      <span>{name ?? code ?? '—'}</span>
    </span>
  );
}
