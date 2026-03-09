import Image from 'next/image';

export interface SourceStampProps {
  sourceName: string;
  sourceLogoUrl?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  publishedAt: string;
  url?: string | null;
  confidenceScore?: number | null;
  platform?: string | null;
  handle?: string | null;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    time: d.toISOString().slice(11, 16) + ' UTC',
    date: d.toISOString().slice(5, 10).replace('-', ' '),
  };
}

function confidenceColor(score: number) {
  if (score >= 70) return 'var(--accent-green)';
  if (score >= 40) return 'var(--accent-gold)';
  return 'var(--accent-red)';
}

export function SourceStamp({
  sourceName,
  sourceLogoUrl,
  city,
  country,
  lat,
  lng,
  publishedAt,
  url,
  confidenceScore,
  platform,
  handle,
}: SourceStampProps) {
  const { time, date } = formatDate(publishedAt);
  const coords = lat != null && lng != null ? `${lat.toFixed(1)}°N ${lng.toFixed(1)}°E` : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
      {sourceLogoUrl ? (
        <Image
          src={sourceLogoUrl}
          alt=""
          width={14}
          height={14}
          className="rounded-sm object-contain"
        />
      ) : null}
      <span>{sourceName}</span>
      {(city || country || coords) && (
        <>
          <span aria-hidden>|</span>
          <span>
            {country && <span className="text-text-secondary">{country}</span>}
            {city && ` ${city}`}
            {coords && ` (${coords})`}
          </span>
        </>
      )}
      <span aria-hidden>|</span>
      <span>🕐 {time}</span>
      <span aria-hidden>|</span>
      <span>📅 {date}</span>
      {url && (
        <>
          <span aria-hidden>|</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-gold hover:underline"
          >
            🔗 link
          </a>
        </>
      )}
      {platform && handle && (
        <>
          <span aria-hidden>|</span>
          <span>{platform} @{handle}</span>
        </>
      )}
      {confidenceScore != null && (
        <span
          className="ml-1 rounded px-1.5 py-0.5 font-mono"
          style={{ backgroundColor: 'var(--bg-elevated)', color: confidenceColor(confidenceScore) }}
        >
          CONF: {Math.round(confidenceScore)}%
        </span>
      )}
    </div>
  );
}
