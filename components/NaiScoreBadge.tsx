'use client';

import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { GLOSSARY } from '@/lib/glossary';
import { useI18n } from '@/components/I18nProvider';
import { categoryLabel } from '@/lib/i18n';

const NAI_CLASS: Record<string, string> = {
  SAFE: 'safe',
  STABLE: 'stable',
  TENSION: 'tension',
  TENSE: 'tension',
  FRACTURE: 'fracture',
  FRACTURED: 'fracture',
  INVERSION: 'inversion',
  INVERTED: 'inversion',
};

type NaiScoreBadgeProps = {
  category: string;
  score?: number;
  className?: string;
};

export function NaiScoreBadge({ category, score, className = '' }: NaiScoreBadgeProps) {
  const { lang } = useI18n();
  const key = (category || '').toUpperCase().replace(/\s+/g, '_');
  const variant = NAI_CLASS[key] ?? 'safe';
  const definition = GLOSSARY[key as keyof typeof GLOSSARY];
  const displayCategory = categoryLabel(category || '—', lang);

  const badge = (
    <span className={`nai-badge ${variant} ${className}`} translate="no">
      {displayCategory}
      {score != null && <span className="opacity-80 ml-1">({score})</span>}
    </span>
  );

  return definition ? (
    <GlossaryTooltip term={key} definition={definition}>
      {badge}
    </GlossaryTooltip>
  ) : badge;
}
