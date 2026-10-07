/**
 * Display names of the 25 tracked countries, as stored in country_reports.country_name
 * (human-supplied, verified 2026-10-07). Server-safe (no 'use client'), for metadata and static copy.
 */
export const TRACKED_COUNTRY_NAMES: Record<string, string> = {
  IR: 'Iran', US: 'United States', IL: 'Israel', SA: 'Saudi Arabia', AE: 'United Arab Emirates', IQ: 'Iraq',
  LB: 'Lebanon', YE: 'Yemen', JO: 'Jordan', EG: 'Egypt', TR: 'Türkiye', RU: 'Russia', CN: 'China',
  GB: 'United Kingdom', FR: 'France', DE: 'Germany', QA: 'Qatar', KW: 'Kuwait', IN: 'India', PK: 'Pakistan',
  ET: 'Ethiopia', ER: 'Eritrea', SD: 'Sudan', SO: 'Somalia', DJ: 'Djibouti',
};
