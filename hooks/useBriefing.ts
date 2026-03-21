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

export function useBriefing(day: number | null, type: string) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (day == null || day < 1 || !type) {
      setBriefing(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { data, error: e } = await supabase
          .from('daily_briefings')
          .select('*')
          .eq('conflict_day', day)
          .eq('report_type', type)
          .maybeSingle();
        if (cancelled) return;
        if (e) setError(e);
        else setBriefing((data as Briefing) ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load briefing'));
          setBriefing(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day, type]);

  return { briefing, loading, error };
}
