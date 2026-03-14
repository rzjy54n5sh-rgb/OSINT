import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { apiKey, countryCode, countryName, conflictDay } = await req.json();

    // Validate
    if (!apiKey?.startsWith('sk-ant-')) {
      return NextResponse.json({ error: 'Invalid API key format' }, { status: 400 });
    }
    if (!countryCode || !countryName || !conflictDay) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (typeof conflictDay !== 'number' || conflictDay < 1 || conflictDay > 365) {
      return NextResponse.json({ error: 'Invalid conflict day' }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const code = countryCode.toUpperCase();

    // Check if report already exists for this day
    const { data: existing } = await supabase
      .from('daily_briefings')
      .select('id, title, quality')
      .eq('conflict_day', conflictDay)
      .eq('report_type', 'country')
      .eq('country_code', code)
      .single();

    if (existing) {
      return NextResponse.json({
        message: 'Report already exists',
        existing: true,
        reportId: existing.id,
        quality: existing.quality,
      });
    }

    // Build the generation prompt
    const prompt = `You are a MENA conflict intelligence analyst applying STRUCTURAL NEUTRALITY.
Generate a Day ${conflictDay} country intelligence brief for ${countryName} (${countryCode})
in the context of the US-Iran War 2026 (started February 28, 2026).

US codename: Operation Epic Fury
Iran/IRGC codename: Operation True Promise IV (وعد صادق ۴)
Israel codename: Operation Roaring Lion
Conflict Day ${conflictDay} = ${new Date(new Date('2026-02-28').getTime() + (conflictDay - 1) * 86400000).toDateString()}

Cover:
1. ${countryName}'s official position on the conflict
2. Public/street sentiment (is it anti-US-intervention? pro-Iran? neutral?)
3. Economic impact (energy prices, trade disruption, currency, key sectors)
4. Key risks and stabilizing factors
5. Strategic assessment — where does ${countryName} sit in this conflict?

Apply structural neutrality throughout. Where relevant, present both
US-coalition AND Iranian/resistance perspectives on ${countryName}'s role.

Output ONLY valid JSON:
{
  "title": "${countryName} Intelligence Brief — Day ${conflictDay}",
  "lead": "2-3 sentence summary of most important development for ${countryName} today",
  "cover_stats": {
    "conflict_day": ${conflictDay},
    "country": "${countryName}"
  },
  "sections": [
    {
      "id": "official-position",
      "heading": "OFFICIAL POSITION",
      "type": "module",
      "subsections": [
        {
          "id": "stance",
          "heading": "${countryName}'s Official Stance",
          "paragraphs": [
            {"text": "...", "perspective": "neutral"},
            {"text": "...", "perspective": "neutral"}
          ]
        }
      ]
    },
    {
      "id": "public-sentiment",
      "heading": "PUBLIC SENTIMENT",
      "type": "module",
      "subsections": [
        {
          "id": "street",
          "heading": "Social Media & Street Signals",
          "paragraphs": [
            {"text": "...", "perspective": "neutral"}
          ]
        }
      ]
    },
    {
      "id": "economic-impact",
      "heading": "ECONOMIC IMPACT",
      "type": "module",
      "subsections": [
        {
          "id": "economy",
          "heading": "Key Economic Indicators & Exposure",
          "paragraphs": [
            {"text": "...", "perspective": "neutral"},
            {"text": "...", "perspective": "neutral"}
          ]
        }
      ]
    },
    {
      "id": "assessment",
      "heading": "STRATEGIC ASSESSMENT",
      "type": "module",
      "subsections": [
        {
          "id": "analysis",
          "heading": "Analyst Assessment — Day ${conflictDay}",
          "paragraphs": [
            {"text": "...", "perspective": "neutral"},
            {"text": "...", "perspective": "neutral"}
          ]
        }
      ]
    }
  ],
  "source_ids": []
}`;

    // Call Anthropic with the user's key directly
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiResp.ok) {
      const err = await aiResp.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } }).error?.message ?? `API error ${aiResp.status}`;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const aiData = await aiResp.json() as {
      content?: Array<{ text?: string }>;
    };
    let text = aiData.content?.[0]?.text ?? '';
    if (text.startsWith('```')) {
      text = text.split('\n').slice(1).join('\n');
      text = text.replace(/```\s*$/, '');
    }
    text = text.trim();

    const briefingData = JSON.parse(text) as {
      title?: string;
      lead?: string;
      cover_stats?: Record<string, unknown>;
      sections?: unknown[];
    };

    const now = new Date().toISOString();
    const row = {
      conflict_day: conflictDay,
      report_type: 'country',
      country_code: code,
      country_name: countryName,
      title: briefingData.title ?? `${countryName} Intelligence Brief — Day ${conflictDay}`,
      lead: briefingData.lead ?? null,
      cover_stats: briefingData.cover_stats ?? { conflict_day: conflictDay },
      sections: briefingData.sections ?? [],
      source_ids: [],
      source: 'community',
      quality: 'auto',
      updated_at: now,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('daily_briefings')
      .insert(row)
      .select('id')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to save report to database' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reportId: (inserted as { id: string }).id,
      countryCode: code,
      conflictDay,
    });
  } catch (e) {
    console.error('Generate briefing error:', e);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
