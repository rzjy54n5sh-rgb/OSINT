/**
 * Tracked-country registry (25 countries).
 *
 * The original 20 (the daily NAI / country-report set) plus the Horn of Africa & Red Sea theatre
 * added by operator ruling 2026-10-07: ET Ethiopia, ER Eritrea, SD Sudan, SO Somalia, DJ Djibouti.
 *
 * Used where the UI must show every tracked country even before it has data (NAI War Posture map
 * and list, /countries grid): a country with no `nai_scores_v2` row for the day is shown as
 * "No sourced data", never with an invented score or a default category.
 */

export const ORIGINAL_COUNTRY_CODES = [
  'IR', 'US', 'IL', 'SA', 'AE', 'IQ', 'LB', 'YE', 'JO', 'EG',
  'TR', 'RU', 'CN', 'GB', 'FR', 'DE', 'QA', 'KW', 'IN', 'PK',
] as const;

export const HORN_COUNTRY_CODES = ['ET', 'ER', 'SD', 'SO', 'DJ'] as const;

export const TRACKED_COUNTRY_CODES: readonly string[] = [...ORIGINAL_COUNTRY_CODES, ...HORN_COUNTRY_CODES];

/** Shown in place of a score for a tracked country that has no row for the day. */
export const NO_SOURCED_DATA_TEXT = 'No sourced data';
