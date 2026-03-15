'use client';

import { useState } from 'react';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { EmailCapture } from '@/components/EmailCapture';

// ── Types ──────────────────────────────────────────────────────────────────
interface QAItem {
  q: string;
  a: string | React.ReactNode;
  citation?: string;
}

interface Section {
  id: string;
  title: string;
  subtitle: string;
  items: QAItem[];
}

// ── All methodology content — do not alter text ─────────────────────────
const SECTIONS: Section[] = [
  {
    id: 'platform',
    title: 'WHAT IS THIS PLATFORM',
    subtitle: 'Purpose, neutrality, and what we do not do',
    items: [
      {
        q: 'What is MENA Intel Desk?',
        a: 'MENA Intel Desk is an open-source intelligence (OSINT) aggregation and analysis platform tracking the geopolitical dynamics of the US-Iran conflict that began on February 28, 2026 (Operation Epic Fury) and its effects across 29 countries in the Middle East, North Africa, and beyond. We collect publicly available information — news articles, official statements, social media trends, market data — run it through a structured analytical framework, and present the results with full source attribution.',
      },
      {
        q: 'Who built this and why?',
        a: 'This platform was built independently by a researcher operating companies in Egypt and the UAE, with direct personal and professional exposure to the conflict\'s regional consequences. It was built because no existing public tool provided a unified, daily-updated, source-cited view of how all parties in this conflict are actually positioned — not just how they present themselves publicly.',
      },
      {
        q: 'Are you neutral?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 10 }}>
              Yes. Neutrality is not a marketing claim here — it is a structural design principle built into every layer of this platform:
            </span>
            <span style={{ display: 'block', marginBottom: 6 }}>▸ We collect from all sides. Our source registry includes Iranian state media, Israeli military communications, US Pentagon feeds, Russian official channels, Gulf state press offices, and Western wire services simultaneously.</span>
            <span style={{ display: 'block', marginBottom: 6 }}>▸ We do not editorialize. Article titles and summaries are reproduced as published by the original source. We do not add commentary to news items.</span>
            <span style={{ display: 'block', marginBottom: 6 }}>▸ We do not predict. Scenario probabilities are calculated estimates based on observable conditions — not opinions about what should happen or what we hope happens.</span>
            <span style={{ display: 'block', marginBottom: 6 }}>▸ We show our working. Every metric has a methodology. Every article links to its source. Every score can be cross-checked.</span>
            <span style={{ display: 'block' }}>▸ We acknowledge uncertainty. We maintain a &quot;What We Cannot Know&quot; section because intellectual honesty requires stating the limits of open-source analysis.</span>
          </>
        ),
      },
      {
        q: 'What is this platform NOT?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 6 }}>▸ <strong style={{ color: 'var(--text-primary)' }}>Not a news outlet.</strong> We do not produce original journalism. We aggregate and analyze existing public information.</span>
            <span style={{ display: 'block', marginBottom: 6 }}>▸ <strong style={{ color: 'var(--text-primary)' }}>Not affiliated with any government.</strong> We have no relationship with any state, military, intelligence service, or political organization.</span>
            <span style={{ display: 'block', marginBottom: 6 }}>▸ <strong style={{ color: 'var(--text-primary)' }}>Not a prediction service.</strong> We calculate probabilities. Probabilities are not predictions. A 35% scenario probability means it has a real chance of occurring — not that it will not occur.</span>
            <span style={{ display: 'block' }}>▸ <strong style={{ color: 'var(--text-primary)' }}>Not legal, financial, or security advice.</strong> This platform is for informational and analytical purposes only.</span>
          </>
        ),
      },
    ],
  },
  {
    id: 'nai',
    title: 'THE NARRATIVE ALIGNMENT INDEX (NAI)',
    subtitle: 'How it is calculated, what it measures, and what the numbers mean',
    items: [
      {
        q: 'What is the Narrative Alignment Index?',
        a: 'The Narrative Alignment Index (NAI) is a proprietary 0–100 scoring system that measures how closely a country\'s observable public behavior aligns with US-led coalition objectives in the current conflict. It is not a measure of sympathy, loyalty, or moral alignment — it is a measure of observable diplomatic, media, and behavioral signals as they appear in public data sources. A high score means the country\'s public actions are consistent with coalition objectives. A low score means they are divergent.',
        citation: 'Methodology adapted from narrative analysis frameworks in: Entman, R.M. (1993). Framing: Toward Clarification of a Fractured Paradigm. Journal of Communication, 43(4), 51–58.',
      },
      {
        q: 'What is the difference between Expressed and Latent scores?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-gold)' }}>Expressed Score (0–100):</strong> What a country is doing and saying publicly. This is derived from official government statements, diplomatic communiqués, voting patterns at international forums, military posture announcements, and state-controlled media framing. If a government publicly condemns Iran strikes, that shifts its expressed score upward.
            </span>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-orange)' }}>Latent Score (0–100):</strong> What the underlying structural conditions suggest about where the country actually stands. This is derived from economic dependency indicators, historical alliance patterns, domestic public sentiment signals from social media trends, and elite-level communications that are less curated than official statements.
            </span>
            <span style={{ display: 'block' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Why both matter:</strong> A country can publicly support a coalition while privately hedging its bets — buying Iranian oil through intermediaries, refusing to host certain military assets, or signaling to Tehran through backchannel elite communications. The gap between these two tracks is often the most important intelligence signal.
            </span>
          </>
        ),
        citation: 'Dual-track analysis concept from: Mearsheimer, J.J. & Walt, S.M. (2007). The Israel Lobby and U.S. Foreign Policy. Farrar, Straus and Giroux.',
      },
      {
        q: 'What is the GAP Score and why does it matter?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>
              The GAP is the arithmetic difference between the Expressed and Latent scores. A country expressing 65 (publicly aligned) but carrying a latent score of 35 (structurally divergent) has a GAP of +30.
            </span>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-red)' }}>GAP {'>'} 30 = CRITICAL:</strong> The country is significantly overstating its alignment. Historical precedent suggests this level of divergence is unsustainable — it typically precedes a policy reversal, a quiet defection from coalition obligations, or a domestic political crisis. Example analog: Turkey during the 2003 Iraq War, where public NATO alignment masked a parliamentary vote that blocked US troop deployment.
            </span>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-orange)' }}>GAP 15–30 = ELEVATED:</strong> Measurable tension between public posture and structural reality. Watch for signals in elite communications and economic activity.
            </span>
            <span style={{ display: 'block' }}>
              <strong style={{ color: 'var(--text-muted)' }}>GAP {'<'} 15 = NORMAL:</strong> Expressed and latent positions are broadly consistent. No extraordinary divergence detected.
            </span>
          </>
        ),
        citation: 'Diplomatic gap analysis framework: Jervis, R. (1976). Perception and Misperception in International Politics. Princeton University Press.',
      },
      {
        q: 'What do the NAI categories mean?',
        a: (
          <>
            {[
              { label: 'ALIGNED (65–100)', color: 'var(--nai-safe)', desc: 'Active coalition partner. Public and private behavior are broadly consistent with US-led objectives. Example: Bahrain, which hosts the US Fifth Fleet and has maintained consistent alignment signals.' },
              { label: 'STABLE (50–64)', color: 'var(--nai-stable)', desc: 'Aligned but cautious. The country publicly supports coalition objectives but is managing domestic or regional constraints. Typical of Gulf states that depend economically on both Western markets and regional stability.' },
              { label: 'TENSION (35–49)', color: 'var(--nai-tension)', desc: 'Mixed signals and hedging. The country is balancing between coalition pressure and competing interests — economic, demographic, or historical. Jordan at this level is managing Palestinian population pressure. Turkey is managing NATO obligations against Eurasian economic ties.' },
              { label: 'FRACTURE (20–34)', color: 'var(--nai-fracture)', desc: 'Significant internal or external pressure causing visible divergence. Countries at this level may be actively obstructing coalition logistics, issuing conflicting diplomatic signals to different audiences, or facing internal political pressure to break with the coalition.' },
              { label: 'INVERSION (<20)', color: 'var(--nai-inversion)', desc: 'Expressed and latent positions have inverted — what the country says publicly and what its structural behavior indicates are sharply contradictory. This is the highest-risk category and typically precedes overt policy reversal or defection.' },
            ].map((cat) => (
              <div key={cat.label} style={{ marginBottom: 12 }}>
                <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: cat.color, letterSpacing: '1px', border: '1px solid currentColor', padding: '2px 8px', display: 'inline-block', marginBottom: 4 }}>{cat.label}</span>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{cat.desc}</p>
              </div>
            ))}
          </>
        ),
      },
      {
        q: 'What is Velocity?',
        a: 'Velocity is the rate of change in expressed score between the current conflict day and the previous measurement. A positive velocity (↑) means a country is becoming more publicly aligned with the coalition. A negative velocity (↓) means it is drifting away. A velocity of ↓↓ (decline of 2+ points in one day) is flagged as a significant signal because rapid movement in either direction typically reflects a specific triggering event — an airstrike, a diplomatic incident, a domestic political development.',
      },
      {
        q: 'What inputs go into the NAI score?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>The NAI is calculated daily by analyzing the following data sources, all collected automatically from public feeds:</span>
            {[
              { label: 'Official statements', desc: 'Government press releases, ministerial statements, foreign ministry communiqués collected from official RSS feeds.' },
              { label: 'State and national media framing', desc: 'How domestic media — including state-controlled outlets — frames the conflict. Sentiment analysis applied to titles and summaries.' },
              { label: 'Social media trend signals', desc: 'Trend data from regional platforms showing the dominant narrative in public discourse, weighted by engagement estimate.' },
              { label: 'Elite network communications', desc: 'Public statements from identified political and military elite figures tracked individually (Telegram channels, official press offices).' },
              { label: 'Economic activity signals', desc: 'Market data, trade indicators, and conflict-sensitive economic metrics that reveal structural dependencies.' },
            ].map((input) => (
              <div key={input.label} style={{ marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid var(--border)' }}>
                <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--accent-gold)' }}>{input.label}</span>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0 0', lineHeight: 1.5 }}>{input.desc}</p>
              </div>
            ))}
          </>
        ),
      },
    ],
  },
  {
    id: 'scenarios',
    title: 'THE FOUR CONFLICT SCENARIOS',
    subtitle: 'How they were defined, what triggers each, and why probabilities are not predictions',
    items: [
      {
        q: 'How were the four scenarios defined?',
        a: 'The scenarios were derived from an escalation ladder framework — a tool used in formal conflict analysis to map the space of possible outcomes from a given conflict state. Rather than inventing arbitrary scenarios, we mapped the observable trigger conditions that historically distinguish one escalation pathway from another. Each scenario represents a distinct bundle of conditions that, if they occur together, produces a qualitatively different conflict outcome. The framework draws on established work in strategic studies and conflict forecasting.',
        citation: 'Escalation ladder concept adapted from: Kahn, H. (1965). On Escalation: Metaphors and Scenarios. Frederick A. Praeger. Updated with: RAND Corporation (2019). Measuring the Health of the Liberal International Order.',
      },
      {
        q: 'Scenario A — Managed Exit: What does this mean?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-gold)' }}>Definition:</strong> An Oman-mediated or backchannel diplomatic framework produces a 30–90 day renewable cessation of direct strikes. Iranian nuclear program is placed under enhanced IAEA monitoring without dismantlement. Hormuz reopens under international maritime guarantee. Both sides claim a form of non-defeat.
            </span>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-gold)' }}>Trigger conditions to watch:</strong> Oman diplomatic shuttle activity. US backchannel signaling through Swiss embassy in Tehran. Iranian Supreme Leader public language shifting from &quot;resistance&quot; to &quot;protection of the nation.&quot; Brent crude falling below $115 (markets pricing in de-escalation).
            </span>
            <span style={{ display: 'block' }}>
              <strong style={{ color: 'var(--accent-gold)' }}>Why probability is declining:</strong> Iranian preconditions for negotiation (full sanctions relief, no regime change guarantees) are hardening as conflict continues. Each day of strikes increases the domestic political cost for Iranian leadership of accepting any deal that looks like capitulation.
            </span>
          </>
        ),
      },
      {
        q: 'Scenario B — Controlled Escalation: What does this mean?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-blue)' }}>Definition:</strong> Conflict expands beyond Iran-US bilateral strikes into a multi-front proxy war. Lebanon ground phase activates (Hezbollah moves beyond rockets into border incursion). Houthi attacks on Red Sea shipping intensify and expand target set. Iraqi Shia militia conduct sustained attacks on US assets in-country. Conflict remains below the nuclear threshold.
            </span>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-blue)' }}>Trigger conditions to watch:</strong> IDF ground forces mobilizing at northern border. Houthi attack frequency crossing 3+ incidents per day. Brent crude sustained above $130. G7 foreign ministers emergency session. Iraqi PM requesting US troop reduction.
            </span>
            <span style={{ display: 'block' }}>
              <strong style={{ color: 'var(--accent-blue)' }}>Why probability is rising:</strong> Proxy fronts are multiplying. Each front that activates increases Iran&apos;s ability to sustain pressure without directly escalating, and increases US domestic political pressure to either broaden the operation or negotiate.
            </span>
          </>
        ),
      },
      {
        q: 'Scenario C — Humanitarian and Economic Crisis: What does this mean?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-orange)' }}>Definition:</strong> Extended conflict duration triggers a secondary humanitarian and economic crisis that becomes the dominant political constraint. Red Sea closure and Suez Canal disruption create global supply chain shock. Egypt enters IMF emergency program. Regional refugee displacement from Lebanon and/or Yemen exceeds 2 million. Western public opinion forces a premature ceasefire that ends the conflict without a verifiable resolution.
            </span>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-orange)' }}>Trigger conditions to watch:</strong> Egyptian pound depreciation exceeding 25% from pre-conflict baseline. WFP emergency declaration for Yemen. European parliament resolution calling for ceasefire. US Congressional opposition to continued AUMF authorization.
            </span>
            <span style={{ display: 'block' }}>
              <strong style={{ color: 'var(--accent-orange)' }}>The risk in this scenario:</strong> A crisis-forced ceasefire without verification mechanisms leaves Iran&apos;s nuclear program in an ambiguous state, which historically produces a more dangerous second conflict within 3–7 years.
            </span>
          </>
        ),
        citation: 'Conflict termination analysis: Fortna, V.P. (2004). Peace Time: Cease-Fire Agreements and the Durability of Peace. Princeton University Press.',
      },
      {
        q: 'Scenario D — Regional War: What does this mean?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-red)' }}>Definition:</strong> A triggering event crosses the threshold that activates full US war authorization (AUMF). The most likely trigger: an Iranian ballistic missile or proxy attack that kills more than 50 US military personnel in a single incident. Saudi Arabia and UAE are drawn in militarily — either by Iranian attack or by US request. Strait of Hormuz is closed indefinitely. Global recession scenario with oil sustained above $200.
            </span>
            <span style={{ display: 'block', marginBottom: 8 }}>
              <strong style={{ color: 'var(--accent-red)' }}>Trigger conditions to watch:</strong> US carrier group repositioning to within 200nm of Iranian coast. Tanker insurance Lloyd&apos;s of London suspending Gulf coverage. Saudi Aramco facilities entering emergency shutdown protocol. Nuclear signaling from Iranian IRGC-affiliated media.
            </span>
            <span style={{ display: 'block' }}>
              <strong style={{ color: 'var(--accent-red)' }}>Why this remains a real probability:</strong> The structural conditions for this scenario — miscalculation, escalatory action by a proxy actor without central command authorization, or a single catastrophic strike — exist independent of the political will of either main party.
            </span>
          </>
        ),
      },
      {
        q: 'Why are these expressed as probabilities and not predictions?',
        a: 'Because the future is not determined. Any analyst who tells you they know what will happen is misrepresenting how geopolitical forecasting works. We express scenarios as probabilities because that is the honest representation of what the data supports. A probability of 35% for Scenario B means: given current observable conditions, we assess that roughly 35 out of 100 trajectories that start from here end at Scenario B. It does not mean Scenario B is likely (it is less likely than not). It does not mean the other 65% guarantees something better. Probabilities sum to 100% across all four scenarios — the entire space of outcomes we have defined. If reality produces a fifth scenario we have not modeled, our probabilities will be wrong — and that is an acknowledged limitation.',
        citation: 'Superforecasting methodology: Tetlock, P.E. & Gardner, D. (2015). Superforecasting: The Art and Science of Prediction. Crown Publishers. CIA analytic standards: Directorate of Intelligence (2009). A Tradecraft Primer: Structured Analytic Techniques for Improving Intelligence Analysis.',
      },
    ],
  },
  {
    id: 'sources',
    title: 'SOURCES AND DATA COLLECTION',
    subtitle: 'Where the data comes from, how it is classified, and how often it updates',
    items: [
      {
        q: 'Where do the articles come from?',
        a: 'All articles are collected automatically from public RSS feeds across seven source categories: international wire services (Reuters, AP, AFP), broadcast media (BBC, France 24, CNN, Al Arabiya), regional news outlets (country-specific publications), official government and ministry press feeds, military command communications, elite individual figures (Telegram channels of public political and military leaders), financial and energy media (OilPrice.com; Financial Times is a primary source for economic and energy analysis), and think tanks and research institutions (War on the Rocks, Foreign Policy, RAND). A full list of all sources by country and category is maintained in our open-source repository.',
      },
      {
        q: 'What regional and Arabic sources do you use?',
        a: 'We include regional and Arabic-language sources to meet our source universe audit requirement. Key Tier 2 sources: Mada Masr (Egypt independent), Al-Monitor (regional analysis), The National (UAE), and Arab News (Saudi). These are used with attribution and framed according to their editorial alignment (e.g. government-aligned for UAE/Saudi outlets). All sources are assigned bias profiles and cross-checked against the platform\'s source universe audit requirement before publication.',
      },
      {
        q: 'What do the source type labels mean?',
        a: (
          <>
            {[
              { type: 'WIRE', desc: 'International wire services — Reuters, Associated Press, AFP. Generally highest factual reliability but limited context.' },
              { type: 'BROADCAST', desc: 'Television and online news broadcasters. Includes both Western (BBC, CNN) and regional (Al Jazeera, Al Arabiya, France 24) with varying editorial positions.' },
              { type: 'OFFICIAL', desc: 'Government ministries, press offices, and official state communications. Primary source for government position — but also the most subject to deliberate framing.' },
              { type: 'MILITARY', desc: 'Defense ministries and military command communications. Pentagon, IDF, IRGC. Primary source for operational claims — which must be treated as inherently advocacy documents.' },
              { type: 'ELITE', desc: 'Public communications from individually tracked political and military figures via Telegram, official press offices, or verified social accounts.' },
              { type: 'FINANCIAL', desc: 'Market and energy media tracking conflict-sensitive economic indicators.' },
              { type: 'THINK TANK', desc: 'Research institutions and policy analysis organizations. Higher analytical depth but should be read with awareness of institutional positioning.' },
            ].map((s) => (
              <div key={s.type} style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)', padding: '2px 6px', flexShrink: 0, marginTop: 2 }}>{s.type}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s.desc}</span>
              </div>
            ))}
          </>
        ),
      },
      {
        q: 'How is article sentiment scored?',
        a: 'Sentiment is applied at collection time using a keyword and framing analysis model. It classifies each article\'s narrative framing into one of five categories: POSITIVE (framing favorable to de-escalation or coalition objectives), NEGATIVE (framing adverse to coalition objectives or emphasizing civilian/humanitarian harm), NEUTRAL (factual/analytical framing without clear narrative alignment), PRO_WAR (explicitly advocating for or justifying military action), ANTI_WAR (explicitly opposing military action). Sentiment is applied to the source\'s framing of the headline and summary — it is not a judgment of whether the underlying facts are positive or negative.',
      },
      {
        q: 'How often does data update?',
        a: (
          <>
            {[
              { feed: 'Articles & news feeds', freq: 'Every 60 minutes, 24/7' },
              { feed: 'Market data', freq: 'Every 30 minutes during trading hours' },
              { feed: 'Social trends', freq: 'Every 12 hours' },
              { feed: 'Disinformation tracker', freq: 'Daily at 06:00 UTC' },
              { feed: 'NAI scores and country reports', freq: 'Daily at 06:00 UTC (automated Claude analysis pipeline)' },
              { feed: 'Scenario probabilities', freq: 'Daily at 06:00 UTC alongside NAI update' },
            ].map((r) => (
              <div key={r.feed} style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, width: 220 }}>{r.feed}</span>
                <span style={{ fontSize: 12, color: 'var(--accent-gold)' }}>{r.freq}</span>
              </div>
            ))}
          </>
        ),
      },
    ],
  },
  {
    id: 'disinfo',
    title: 'DISINFORMATION TRACKER',
    subtitle: 'How claims are flagged, what verdicts mean, and our own limits',
    items: [
      {
        q: 'How are disinformation claims identified?',
        a: 'Claims are flagged when they meet one or more of the following criteria: (1) The claim originates from a source known to amplify state-directed information operations, (2) the claim makes a specific verifiable assertion that is contradicted by multiple independent primary sources, (3) the claim is circulating at high volume across multiple platforms simultaneously — a pattern associated with coordinated amplification, or (4) the claim has been specifically addressed by an established fact-checking organization. We do not originate disinformation claims. Every claim in our tracker was already publicly circulating before we logged it.',
      },
      {
        q: 'What do the verdict labels mean?',
        a: (
          <>
            {[
              { v: 'FALSE', c: 'var(--accent-red)', desc: 'The specific verifiable claim has been definitively contradicted by multiple independent primary sources (original footage, official records, satellite imagery, or direct testimony from multiple unrelated parties).' },
              { v: 'MISLEADING', c: 'var(--accent-orange)', desc: 'The claim contains factual elements but is presented in a context that produces a false impression. The individual facts may be checkable but their combination or framing distorts the overall meaning.' },
              { v: 'UNVERIFIED', c: 'var(--text-muted)', desc: 'The claim cannot be confirmed or denied with available open-source evidence at the time of logging. This is not a judgment of falsity — it is a statement of the limits of available public evidence.' },
              { v: 'TRUE', c: 'var(--accent-green)', desc: 'The claim has been corroborated by multiple independent primary sources. Note: "true" in a conflict context requires careful reading — a claim can be factually accurate while serving a disinformation function through selective framing.' },
            ].map((item) => (
              <div key={item.v} style={{ marginBottom: 10 }}>
                <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: item.c, border: '1px solid currentColor', padding: '2px 8px', display: 'inline-block', marginBottom: 4 }}>{item.v}</span>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </>
        ),
      },
    ],
  },
  {
    id: 'limits',
    title: 'WHAT WE CANNOT KNOW',
    subtitle: 'An honest statement of the limits of open-source intelligence',
    items: [
      {
        q: 'What are the fundamental limits of OSINT analysis?',
        a: (
          <>
            <span style={{ display: 'block', marginBottom: 8 }}>Open-source intelligence is, by definition, limited to what is publicly observable. We are transparent about the following constraints:</span>
            {[
              'We cannot access classified information. Our NAI scores are based entirely on publicly available signals. Classified communications, intelligence assessments, and back-channel diplomatic activity that never surfaces in public records are invisible to us — and may be the most important factors.',
              'State media is itself a form of information warfare. A significant portion of our sources includes state-controlled media from Iran, Russia, and China. These sources are included because they are primary sources for understanding the official narrative — but they must be read as deliberately constructed messaging, not neutral reporting.',
              'Our NAI scores are estimates, not measurements. We are measuring something inherently difficult to quantify: the gap between public posture and actual intent. Reasonable analysts could apply a different weighting to the inputs and arrive at different scores. We believe our methodology is sound, but we acknowledge it is one analytical approach among several legitimate ones.',
              'Our source coverage is uneven. We have stronger coverage of English-language, Arabic-language, and Persian-language sources. Turkish, Hebrew, Russian, and Urdu coverage is thinner. This means our scores for Turkey, Israel, Russia, and Pakistan should be read with slightly more uncertainty than others.',
              'Scenario probabilities are recalibrated daily but are not predictions. They represent our current assessment of observable trajectory — not certainty about outcome. Events can and do move faster than daily recalibration.',
            ].map((limit, i) => (
              <div key={i} style={{ marginBottom: 8, paddingLeft: 12, borderLeft: '2px solid var(--accent-red)' }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{limit}</p>
              </div>
            ))}
          </>
        ),
        citation: 'Limitations of OSINT analysis: Lowenthal, M.M. (2019). Intelligence: From Secrets to Policy (8th ed.). CQ Press. Chapter 4: Collection.',
      },
      {
        q: 'How do I challenge or dispute a score or verdict?',
        a: 'We welcome factual challenges supported by primary source citations. If you believe a country\'s NAI score is materially incorrect and you have publicly available evidence to support a different assessment, you can submit a dispute through the structured reaction system on each data point. Disputes that include a source URL and a specific claim will be reviewed and, if substantiated, will be factored into the next daily recalculation.',
      },
    ],
  },
];

// ── Accordion item ──────────────────────────────────────────────────────────
function AccordionItem({ item }: { item: QAItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', textAlign: 'left', padding: '14px 0',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
        }}
      >
        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5, letterSpacing: '0.3px' }}>
          {item.q}
        </span>
        <span style={{ color: 'var(--accent-gold)', fontFamily: 'IBM Plex Mono', fontSize: 14, flexShrink: 0, marginTop: 1 }}>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div style={{ paddingBottom: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {item.a}
          </div>
          {item.citation && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.6 }}>
              ◆ Source: {item.citation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MethodologyPage() {
  const [activeSection, setActiveSection] = useState<string>('platform');

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div style={{ marginBottom: 32, borderBottom: '1px solid var(--border)', paddingBottom: 24 }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '3px', marginBottom: 8 }}>
          ◆ MENA INTEL DESK — METHODOLOGY & TRANSPARENCY
        </div>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 40, color: 'var(--text-primary)', letterSpacing: '3px', margin: '0 0 12px 0' }}>
          HOW THIS PLATFORM WORKS
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 680, margin: 0 }}>
          This document explains every analytical framework, scoring methodology, and data source used on this platform. It is written for three audiences simultaneously: casual readers who want to understand what they are looking at, informed analysts who want to evaluate our methodology, and professionals who intend to cite this work. All claims are sourced. All limitations are stated.
        </p>

        {/* Neutrality statement */}
        <div style={{ marginTop: 20, padding: '14px 18px', border: '1px solid var(--accent-gold)', background: 'rgba(232,197,71,0.04)' }}>
          <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 8 }}>
            ◆ NEUTRALITY STATEMENT
          </div>
          <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.7, margin: 0 }}>
            We do not report news. We do not editorialize. We collect, score, calculate, and present. Every number has a methodology. Every article links to its original source. Every conclusion is probabilistic, not predictive. We are wrong sometimes — and we show our working so you can disagree.
          </p>
        </div>
      </div>

      {/* Section navigation */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 32 }}>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSection(s.id)}
            style={{
              fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1.5px',
              padding: '6px 14px', border: '1px solid',
              borderColor: activeSection === s.id ? 'var(--accent-gold)' : 'var(--border)',
              color: activeSection === s.id ? 'var(--accent-gold)' : 'var(--text-muted)',
              background: activeSection === s.id ? 'rgba(232,197,71,0.06)' : 'transparent',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {s.title.split(' ').slice(0, 3).join(' ')}
          </button>
        ))}
      </div>

      {/* Active section */}
      {SECTIONS.filter((s) => s.id === activeSection).map((section) => (
        <div key={section.id}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--text-primary)', letterSpacing: '2px', margin: '0 0 4px 0' }}>
              {section.title}
            </h2>
            <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-muted)', margin: 0, letterSpacing: '1px' }}>
              {section.subtitle}
            </p>
          </div>
          <OsintCard>
            {section.items.map((item, i) => (
              <AccordionItem key={i} item={item} />
            ))}
          </OsintCard>
        </div>
      ))}

      {/* Footer */}
      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <EmailCapture source="methodology" compact />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-muted)' }}>
            MENA INTEL DESK — OPEN SOURCE INTELLIGENCE PLATFORM
          </span>
          <Link href="/" style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', textDecoration: 'none' }}>
            ← RETURN TO DASHBOARD
          </Link>
        </div>
      </div>
    </div>
  );
}
