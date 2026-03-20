import { getNaiScores } from '@/lib/api/nai';
import { getConflictDay, getSessionToken } from '@/utils/supabase/server';

/**
 * Server-rendered: largest |Δ expressed| vs previous conflict day (api-nai `delta`).
 */
export async function NaiBiggestMoveBanner() {
  const day = await getConflictDay();
  const token = await getSessionToken();
  let res: Awaited<ReturnType<typeof getNaiScores>>;
  try {
    res = await getNaiScores(day, token ?? undefined);
  } catch {
    return null;
  }

  const rows = res?.data ?? [];
  const withDelta = rows.filter((r) => r.delta !== null && r.delta !== undefined);
  if (withDelta.length === 0) return null;

  const biggest = [...withDelta].sort(
    (a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0),
  )[0];
  const d = biggest.delta ?? 0;
  if (Math.abs(d) < 5) return null;

  const cat = biggest.category ?? '—';

  return (
    <div className="border border-[#E8C547]/40 bg-[#E8C547]/5 px-4 py-3 font-mono text-sm mb-4 rounded-sm">
      <span className="text-[#E8C547]">◆ BIGGEST MOVE TODAY:</span>
      <span className="text-white ml-2">
        <span translate="no">{biggest.country_code}</span>{' '}
        <span translate="no">
          {d > 0 ? '↑' : '↓'}
          {Math.abs(d)} points
        </span>
        <span translate="no">
          {' '}
          · Now {biggest.expressed_score} [{cat}]
        </span>
      </span>
    </div>
  );
}
