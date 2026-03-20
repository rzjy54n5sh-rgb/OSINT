export interface DigestData {
  conflictDay: number;
  date: string;
  scenarioA: number;
  scenarioB: number;
  scenarioC: number;
  scenarioD: number;
  leadScenario: string;
  biggestMove: {
    countryCode: string;
    countryName: string;
    delta: number;
    newScore: number;
    category: string;
  } | null;
  brentPrice: number;
  topHeadlines: Array<{ title: string; source: string }>;
  tier: 'free' | 'informed' | 'professional';
}

const DEFAULT_SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mena-intel-desk.mores-cohorts9x.workers.dev';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function catColor(cat: string): string {
  const map: Record<string, string> = {
    ALIGNED: '#1A7A4A',
    STABLE: '#1E90FF',
    TENSION: '#D97706',
    FRACTURE: '#C0392B',
    INVERSION: '#6B21A8',
  };
  return map[cat.toUpperCase()] || '#6C7A8A';
}

function scenarioRowHtml(data: DigestData): string {
  const vals = [data.scenarioA, data.scenarioB, data.scenarioC, data.scenarioD];
  const max = Math.max(...vals);
  const letters = ['A', 'B', 'C', 'D'];
  const names = ['Ceasefire', 'Prolonged', 'Cascade', 'Escalation'];
  return letters
    .map((s, i) => {
      const isLead = vals[i] === max;
      return `<td style="text-align:center;padding:8px;">
                  <div style="color:${isLead ? '#E8C547' : '#6C7A8A'};font-size:11px;">SCN ${s}</div>
                  <div style="color:${isLead ? '#E8C547' : '#ffffff'};font-size:${isLead ? '22px' : '18px'};font-weight:${isLead ? 'bold' : 'normal'};">${vals[i]}%</div>
                  <div style="color:#6C7A8A;font-size:10px;">${names[i]}</div>
                </td>`;
    })
    .join('');
}

export function dailyDigestTemplate(
  data: DigestData,
  siteUrl: string = DEFAULT_SITE
): { subject: string; html: string } {
  const maxPct = Math.max(data.scenarioA, data.scenarioB, data.scenarioC, data.scenarioD);
  const subject = `Day ${data.conflictDay} — ${data.leadScenario} leads at ${maxPct}% · Brent $${data.brentPrice}`;

  const biggestMoveHtml = data.biggestMove
    ? `<tr><td style="padding:12px;border-bottom:1px solid #1C3A5E;">
        <strong style="color:#E8C547;">◆ BIGGEST MOVE</strong><br/>
        <span style="color:#ffffff;">${esc(data.biggestMove.countryName)}:
          ${data.biggestMove.delta > 0 ? '↑' : '↓'}${Math.abs(data.biggestMove.delta)} pts
          → ${data.biggestMove.newScore}
          <span style="color:${catColor(data.biggestMove.category)};">[${esc(data.biggestMove.category)}]</span>
        </span>
      </td></tr>`
    : '';

  const headlinesHtml = data.topHeadlines
    .slice(0, 3)
    .map(
      (h) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #0D1B2A;font-size:13px;">
      <span style="color:#6C7A8A;font-size:11px;">${esc(h.source)}</span><br/>
      <span style="color:#E8E8E8;">${esc(h.title)}</span>
    </td></tr>`
    )
    .join('');

  const upgradeRow =
    data.tier === 'free'
      ? `<tr><td style="padding:16px;background:#1C3A5E;text-align:center;">
        <a href="${esc(siteUrl + '/pricing')}"
           style="color:#E8C547;font-family:monospace;font-size:13px;">
          ◆ Upgrade for full country reports, NAI latent scores, and API access →
        </a>
      </td></tr>`
      : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#070A0F;font-family:'IBM Plex Mono',monospace,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">

        <tr><td style="padding:24px;background:#0D1B2A;border-bottom:2px solid #E8C547;">
          <span style="color:#E8C547;font-weight:bold;font-size:16px;">◆ MENA INTEL DESK</span>
          <span style="color:#6C7A8A;font-size:12px;float:right;">CONFLICT DAY ${data.conflictDay}</span>
          <br/><span style="color:#6C7A8A;font-size:12px;">${esc(data.date)}</span>
        </td></tr>

        <tr><td style="padding:16px;background:#0D1B2A;">
          <div style="color:#6C7A8A;font-size:11px;margin-bottom:8px;">SCENARIO PROBABILITIES</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${scenarioRowHtml(data)}
            </tr>
          </table>
        </td></tr>

        <tr><td style="background:#0D1B2A;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${biggestMoveHtml}
            <tr><td style="padding:12px;border-bottom:1px solid #1C3A5E;">
              <strong style="color:#D97706;">◆ BRENT CRUDE</strong>
              <span style="color:#ffffff;margin-left:8px;">$${data.brentPrice}/bbl</span>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:12px;background:#0D1B2A;">
          <div style="color:#6C7A8A;font-size:11px;margin-bottom:8px;">TODAY'S KEY ARTICLES</div>
          <table width="100%" cellpadding="0" cellspacing="0">${headlinesHtml}</table>
        </td></tr>

        ${upgradeRow}

        <tr><td style="padding:16px;text-align:center;background:#070A0F;">
          <a href="${esc(siteUrl)}"
             style="color:#E8C547;font-size:12px;">Open Platform →</a>
          <span style="color:#6C7A8A;font-size:11px;display:block;margin-top:8px;">
            MENA Intel Desk · Open Source Intelligence · All data subject to verification
          </span>
          <a href="${esc(siteUrl + '/unsubscribe')}"
             style="color:#6C7A8A;font-size:10px;">Unsubscribe</a>
        </td></tr>

      </table>
    </body>
    </html>
  `;

  return { subject, html };
}
