import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  const { apiKey, countryCode, countryName, conflictDay } = await req.json();

  if (!apiKey?.startsWith('sk-ant-')) {
    return NextResponse.json({ error: 'Invalid API key format' }, { status: 400 });
  }
  if (!countryCode || !countryName || !conflictDay) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check if report already exists
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: existing } = await supabase
    .from('daily_briefings')
    .select('id, title')
    .eq('conflict_day', conflictDay)
    .eq('report_type', 'country')
    .eq('country_code', countryCode.toUpperCase())
    .single();

  if (existing) {
    return NextResponse.json({
      message: 'Report already exists',
      existing: true,
      reportId: existing.id,
    });
  }

  // Call Anthropic with the user's key
  const prompt = `You are a MENA conflict intelligence analyst applying STRUCTURAL NEUTRALITY.
Generate a country intelligence brief for ${countryName} (${countryCode}) on Conflict Day ${conflictDay} of the US-Iran War 2026.

Cover: official position on the conflict, public sentiment, economic impact, key risks, strategic assessment.
Apply structural neutrality: present US-coalition AND Iranian perspectives where relevant.
Output ONLY valid JSON:
{
  "title": "${countryName} Intelligence Brief — Day ${conflictDay}",
  "lead": "2-3 sentence summary",
  "cover_stats": {"conflict_day": ${conflictDay}},
  "sections": [
    {
      "id": "official-position",
      "heading": "OFFICIAL POSITION",
      "type": "module",
      "subsections": [
        {
          "id": "stance",
          "heading": "${countryName}'s Official Stance",
          "paragraphs": [{"text": "...", "perspective": "neutral"}]
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
          "paragraphs": [{"text": "...", "perspective": "neutral"}]
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
          "heading": "Key Economic Indicators",
          "paragraphs": [{"text": "...", "perspective": "neutral"}]
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
          "heading": "Analyst Assessment",
          "paragraphs": [{"text": "...", "perspective": "neutral"}]
        }
      ]
    }
  ],
  "source_ids": []
}`;

  try {
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
      const err = await aiResp.json();
      return NextResponse.json({ error: err.error?.message ?? 'API error' }, { status: 400 });
    }

    const aiData = await aiResp.json();
    let text = aiData.content?.[0]?.text ?? '';
    if (text.startsWith('```')) text = text.split('\n', 2)[1];
    text = text.replace(/```$/, '').trim();

    const briefingData = JSON.parse(text);
    const now = new Date().toISOString();

    const row = {
      conflict_day: conflictDay,
      report_type: 'country',
      country_code: countryCode.toUpperCase(),
      country_name: countryName,
      title: briefingData.title,
      lead: briefingData.lead,
      cover_stats: briefingData.cover_stats,
      sections: briefingData.sections,
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
      return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
    }

    return NextResponse.json({ success: true, reportId: inserted.id });
  } catch (e) {
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
