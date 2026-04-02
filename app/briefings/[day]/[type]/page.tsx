import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import BriefingReader from './BriefingReader';

interface PageProps {
  params: Promise<{ day: string; type: string }>;
}

export default async function BriefingReaderPage({ params }: PageProps) {
  const { day: dayStr, type } = await params;
  const day = parseInt(dayStr, 10);
  if (isNaN(day) || day < 1 || !type) return notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_briefings')
    .select('*')
    .eq('conflict_day', day)
    .eq('report_type', type)
    .maybeSingle();

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <a href="/briefings" className="font-mono text-xs mb-6 inline-block"
           style={{ color: 'var(--accent-gold)' }}>← BRIEFINGS</a>
        <p className="redacted py-12">NO BRIEFING AVAILABLE — DAY {day} / {type.toUpperCase()}</p>
      </div>
    );
  }

  return <BriefingReader briefing={data} day={day} type={type} />;
}
