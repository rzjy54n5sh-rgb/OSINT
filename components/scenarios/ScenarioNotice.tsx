import Link from 'next/link';
import { formatNoticeUpdated, type ScenarioNotice } from '@/lib/scenario-notice';
import s from './notice.module.css';

/**
 * Operator notice (platform_alerts.scenario_notice, lib/scenario-notice.ts). Server-safe: no hooks, no
 * fetch. Every string is a React text child (escaped); line breaks are kept by CSS (white-space: pre-line).
 * Renders nothing for a null notice.
 */
export function ScenarioNoticePanel({ notice, headingId = 'scenario-notice-h' }: { notice: ScenarioNotice | null; headingId?: string }) {
  if (!notice) return null;
  const updated = formatNoticeUpdated(notice.updatedAt);
  return (
    <section id="scenario-notice" aria-labelledby={headingId} className={s.notice} data-testid="scenario-notice">
      <div className={s.head}>
        <span className={s.label}>NOTICE</span>
        {updated && notice.updatedAt ? (
          <time dateTime={notice.updatedAt} className={`${s.num} ${s.muted}`}>
            {updated}
          </time>
        ) : null}
      </div>
      <h2 id={headingId} className={s.title}>
        {notice.title ?? 'Scenario model notice'}
      </h2>
      {notice.message ? <p className={s.text}>{notice.message}</p> : null}
      {notice.messageAr ? (
        <div dir="rtl" lang="ar" className={`${s.ar} font-arabic-ui`} data-testid="scenario-notice-ar">
          <p className={s.text}>{notice.messageAr}</p>
        </div>
      ) : null}
    </section>
  );
}

/** Home scenario card: title (else the message's first line), clamped to two lines, linking to /scenarios. */
export function ScenarioNoticeLine({ notice }: { notice: ScenarioNotice | null }) {
  if (!notice) return null;
  const summary = notice.title ?? (notice.message ?? '').split('\n')[0].trim();
  return (
    <p role="status" className={s.line} data-testid="home-scenario-notice">
      <span className={s.label}>NOTICE</span>
      <span className={s.lineText}>{summary}</span>
      <Link prefetch={false} href="/scenarios" className={s.lineLink}>
        Details<span className="chip-sr-only"> on the scenarios page</span> →
      </Link>
    </p>
  );
}
