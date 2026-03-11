type NullableScalar = string | number | null | undefined;

const COUNTRY_VARIANTS_BY_CODE: Record<string, string[]> = {
  IR: ['IR', 'IRN', 'Iran', 'Islamic Republic of Iran'],
  IL: ['IL', 'ISR', 'Israel'],
  IQ: ['IQ', 'IRQ', 'Iraq'],
  YE: ['YE', 'YEM', 'Yemen'],
  SA: ['SA', 'SAU', 'Saudi Arabia', 'Kingdom of Saudi Arabia'],
  AE: ['AE', 'ARE', 'UAE', 'United Arab Emirates'],
  LB: ['LB', 'LBN', 'Lebanon'],
  EG: ['EG', 'EGY', 'Egypt'],
  TR: ['TR', 'TUR', 'Turkey', 'Turkiye'],
  RU: ['RU', 'RUS', 'Russia', 'Russian Federation'],
  SY: ['SY', 'SYR', 'Syria', 'Syrian Arab Republic'],
  JO: ['JO', 'JOR', 'Jordan', 'Hashemite Kingdom of Jordan'],
  QA: ['QA', 'QAT', 'Qatar', 'State of Qatar'],
  KW: ['KW', 'KWT', 'Kuwait', 'State of Kuwait'],
  BH: ['BH', 'BHR', 'Bahrain', 'Kingdom of Bahrain'],
  OM: ['OM', 'OMN', 'Oman'],
  PS: ['PS', 'PSE', 'Palestine', 'State of Palestine'],
  LY: ['LY', 'LBY', 'Libya'],
  SD: ['SD', 'SDN', 'Sudan'],
  DZ: ['DZ', 'DZA', 'Algeria'],
  MA: ['MA', 'MAR', 'Morocco'],
  TN: ['TN', 'TUN', 'Tunisia'],
  CN: ['CN', 'CHN', 'China', "People's Republic of China"],
  US: ['US', 'USA', 'United States', 'United States of America'],
  GB: ['GB', 'GBR', 'UK', 'United Kingdom', 'Great Britain'],
  FR: ['FR', 'FRA', 'France'],
  DE: ['DE', 'DEU', 'Germany'],
  IN: ['IN', 'IND', 'India'],
  PK: ['PK', 'PAK', 'Pakistan'],
};

const COUNTRY_VALUE_TO_CODE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [code, values] of Object.entries(COUNTRY_VARIANTS_BY_CODE)) {
    out[normalizeCountryValue(code)] = code;
    for (const value of values) {
      out[normalizeCountryValue(value)] = code;
    }
  }
  return out;
})();

function normalizeCountryValue(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ');
}

function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function parseSuffixedNumber(raw: string): number | null {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*([kmb])?/i);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = (match[2] ?? '').toUpperCase();
  if (suffix === 'K') return base * 1_000;
  if (suffix === 'M') return base * 1_000_000;
  if (suffix === 'B') return base * 1_000_000_000;
  return base;
}

export function countryCodeFromValue(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return COUNTRY_VALUE_TO_CODE[normalizeCountryValue(value)] ?? null;
}

export function countryMatches(value: string | null | undefined, code: string): boolean {
  const parsed = countryCodeFromValue(value);
  return parsed === code.toUpperCase();
}

export function countryQueryValues(code: string): string[] {
  const c = code.toUpperCase();
  return COUNTRY_VARIANTS_BY_CODE[c] ?? [c];
}

export function parseEngagementEstimate(value: NullableScalar): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = value.trim();
  if (!raw) return null;

  const scoreMatch = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*100/);
  if (scoreMatch) {
    return Number(scoreMatch[1]) * 1_000;
  }

  const rangeMatches = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*([kmb])?/gi)];
  if (rangeMatches.length >= 2) {
    const parsed = rangeMatches
      .map((m) => parseSuffixedNumber(`${m[1]}${m[2] ?? ''}`))
      .filter((n): n is number => n != null);
    if (parsed.length > 0) {
      return parsed.reduce((sum, n) => sum + n, 0) / parsed.length;
    }
  }

  const direct = parseSuffixedNumber(raw.replace(/,/g, ''));
  if (direct != null) return direct;

  const upper = raw.toUpperCase();
  if (upper.includes('HIGH')) return 75_000;
  if (upper.includes('MEDIUM')) return 45_000;
  if (upper.includes('LOW')) return 15_000;
  return null;
}

export function formatEngagement(value: NullableScalar): string {
  if (value == null) return '—';
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return '—';
    if (/[A-Za-z]/.test(raw) && !/^[\d.,]+$/.test(raw)) return raw;
    const parsed = parseEngagementEstimate(raw);
    return parsed == null ? raw : compactNumber(parsed);
  }
  return compactNumber(value);
}
