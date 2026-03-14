'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Paragraph {
  text: string;
  source_ids?: string[];
  perspective?: string;
}

export interface Subsection {
  id: string;
  heading: string;
  nai_category?: string;
  nai_expressed?: number;
  nai_latent?: number;
  paragraphs: Paragraph[];
}

export interface Section {
  id: string;
  heading: string;
  type: string;
  subsections: Subsection[];
}

export interface Briefing {
  id: string;
  conflict_day: number;
  report_type: string;
  title: string;
  lead: string | null;
  cover_stats: Record<string, unknown> | null;
  sections: Section[];
  source_ids: string[] | null;
  source: string;
  quality: string;
  generated_at: string;
}

export function useBriefing(day: number, type: string) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!day || !type) return;
    const supabase = createClient();
    setLoading(true);
    void (async () => {
      const { data, error: e } = await supabase
        .from('daily_briefings')
        .select('*')
        .eq('conflict_day', day)
        .eq('report_type', type)
        .single();
      setLoading(false);
      if (e) setError(e);
      else setBriefing(data as Briefing);
    })();
  }, [day, type]);

  return { briefing, loading, error };
}
