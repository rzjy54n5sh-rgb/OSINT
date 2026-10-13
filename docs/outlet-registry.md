# Outlet registry (`public.outlets`, `public.outlet_aliases`)

Seeded by `supabase/migrations/20261013120000_outlet_registry_seed.sql` (applied in production: 83 outlets,
181 aliases on 2026-10-13) and extended by `supabase/migrations/20261013200000_outlet_registry_rulings.sql`
(13 outlets, 26 aliases classified under the operator-delegated rule below; not applied by the author).
Evidence for every row was opened on 2026-10-13. Tests: `supabase/tests/run_outlet_registry_seed_tests.sh`
(part A: seed; part B: rulings on top of the seed).

## Why

`outlets` / `outlet_aliases` (schema: `20261007100400_stories.sql`) were empty in production on 2026-10-13.
The daily routine derives `party_source` and tier from them, the story mix (`stories.party_outlet_count`,
`independent_outlet_count`, `unknown_outlet_count`) resolves outlets through them, and
`intel_alerts_candidate_guard` counts distinct outlets registered `independent` among evidence declared
`independent` (fixed in `20261013120100_candidate_guard_distinct_outlets.sql`; it previously counted hosts, so
bbc.com + bbc.co.uk passed as two outlets). With empty tables,
every outlet is `unknown`.

## Rules

1. **No invented claims** (operator standing order). Each `classification_basis` quotes or names the evidence and
   its URL: the outlet's own About page, a government page, State Media Monitor, or Wikipedia where the article
   states the ownership. If no evidence was found, the outlet is **not registered** and stays `unknown` (default).
2. **Statuses** (CHECK in the schema): `party` = belligerent party or military outlet; `state_aligned` = state
   media, or media owned by a ruling family / government and documented as promoting it (needs
   `party_affiliation`); `independent` = evidence names a non-government owner (company, family, trust,
   nonprofit) and no source states government ownership or control — except where a desk rule names the
   outlet (AFP is one-third state-funded and Al Jazeera is Qatar-funded; the desk classes both as independent).
3. **Tiers** come only from a desk rule that names the outlet:
   - Tier 1: AFP, Reuters, AP, PolitiFact, NetBlocks, HRW (independent).
   - Tier 2 independent (conditional): FT (DECISION-002: conditional Tier 1 for economic/energy analysis),
     Al Jazeera English and Arabic (Qatar state-funded; **party source only on Qatar/Egypt/UAE stories**,
     DECISION-002 — stored `independent`, the condition is in `classification_basis`), BBC, Guardian, NYT,
     Washington Post, Bloomberg, CNN, Middle East Eye (Tier 3 for Egypt-specific analysis, SOURCES.md),
     Sudan Tribune, Addis Standard; SOURCES.md Tier 2: Jerusalem Post, Haaretz, Al-Monitor, Mada Masr.
   - Tier 2 state_aligned: The National (UAE, Abu Dhabi ownership), Arab News (Saudi; SOURCES.md "frame as
     government-aligned").
   - Tier 3: IRNA, ISNA, Mehr, Tasnim, Fars, Press TV, TASS, RT, Xinhua, SPA, WAM, both Sabas, Al-Ahram,
     Fana, SONNA, SUNA, ENA, Shabait, Al Mayadeen (state_aligned); CENTCOM, DoD, IDF, Al-Masirah, Al-Manar
     (party).
   - Every other outlet: `source_tier` NULL (no desk rule names it; no tier invented).
4. **Yemen** (operator ruling 2026-10-13, "show both"): two Saba rows — the Houthi-run agency in Sanaa
   (`saba.ye`, per State Media Monitor) and the internationally recognised government's agency. The
   government agency's domain could not be sourced, so it has **no host alias**; add one when sourced.
5. **Aliases**: `host` aliases are matched against `public.url_host(url)` (lowercase, leading `www.` stripped),
   exactly as `intel_alerts_candidate_guard` does — so hosts are stored bare and each subdomain is listed.
   `source_name` aliases are the exact `articles.source_name` strings seen in production. **Resolve by host
   first, then by source_name**: some source_names (`rt.com`, `ahram.org.eg`, `cnn.com`, `xinhuanet.com`) span
   several language editions. `t.me` is never an alias. Multilingual outlets use `lang = 'other'`.
6. **One row per organisation**, not per language edition (so RT Arabic + RT Spanish on one story count as
   one party outlet). Exception: Al Jazeera English / Arabic are separate channels named separately by the desk.
7. **Idempotent and non-destructive**: `ON CONFLICT DO NOTHING`; a row edited later is never overwritten;
   differing pre-existing rows are reported with a WARNING.

## Classification rule (operator delegated, 2026-10-13)

Operator ruling (Omar, 2026-10-13 20:43 Dubai) on the outlets the seed left "ruling needed": "U decide", with
this written rule, applied by `20261013200000_outlet_registry_rulings.sql`:

 - `party` = owned or run by a political party, armed group or military/government body that is itself a party to a tracked conflict (incl. a ruling party's own outlet).
 - `state_aligned` = state-owned or state-funded, OR owned by a business group whose owner is documented (by a cited, reputable source) as allied with the government AND the outlet's editorial line is documented as following that government. Affiliation names the state.
 - `independent` = everything else with documented private or editorially independent public ownership — including editorially independent public broadcasters (BBC, ABC Australia, France 24/France Médias Monde) and advocacy NGOs (labelled "advocacy organisation" in party_affiliation? — no: party_affiliation must be NULL for independent; put "advocacy organisation" in classification_basis).
 - Funding that is only alleged and denied → classify by what is documented, and state the allegation and the denial in classification_basis.
 - tier stays NULL unless a desk rule names the outlet (Tier 1: AFP, Reuters, AP, PolitiFact, NetBlocks, HRW; Tier 2: FT, Al Jazeera, The National, Arab News; Tier 3: listed state media) — so all of these get tier NULL except where the desk rule says otherwise.

"Tracked conflict" = a row of `public.conflicts` (2026-10-13: US/Israel–Iran war, Red Sea and Houthi front,
Ethiopia offensive and Eritrea rupture, Sudan SAF–RSF war). None of the 13 ruled outlets is named by a desk tier
rule, so all 13 have `source_tier` NULL.

### Ruled outlets (2026-10-13)

| Outlet | Status | Affiliation | Basis URL (opened 2026-10-13) | Reason |
|---|---|---|---|---|
| Middle East Monitor | state_aligned | Qatar (state-financed) | <https://en.wikipedia.org/wiki/Middle_East_Monitor>, <https://www.middleeastmonitor.com/about/> | "MEMO is financed by the State of Qatar" (Wikipedia, citing a Cambridge University Press monograph and Rising Powers Quarterly); no denial found. Advocacy/lobbying group. |
| Gulf News | independent | — | <https://en.wikipedia.org/wiki/Gulf_News> | Private (Al Nisr Publishing / Al Tayer Group, chaired by a former UAE finance minister); no source documents a government-following editorial line. |
| Daily Sabah | state_aligned | Turkey (Turkuvaz Media Group / Kalyon Group; pro-government) | <https://en.wikipedia.org/wiki/Daily_Sabah>, <https://www.dailysabah.com/about-us>, <https://en.wikipedia.org/wiki/Turkuvaz_Media_Group> | Owner "a friend of" Erdoğan AND "frequently called a propaganda outlet for the Turkish government". |
| Hürriyet Daily News | independent | — | <https://en.wikipedia.org/wiki/H%C3%BCrriyet_Daily_News>, <https://en.wikipedia.org/wiki/Demir%C3%B6ren_Holding> | Owner (Demirören) documented as an Erdoğan ally, but no source documents the paper's editorial line as following the government (owners said they would run it "independent, non-partisan"). |
| ANI (Asian News International) | state_aligned | India (private agency documented as closely associated with the government) | <https://en.wikipedia.org/wiki/Asian_News_International>, <https://caravanmagazine.in/reportage/ani-reports-government-version-truth> | The Caravan / The Ken: "closely associated with the government of India", "producing blatant propaganda for the state"; ANI contests this (2024 suit against Wikipedia). |
| France 24 | independent | — | <https://en.wikipedia.org/wiki/France_24>, <https://statemediamonitor.com/2026/09/france-medias-monde-fmm/> | State-owned (France Médias Monde) but classified Independent State-Funded and State-Managed (ISFM); editorially independent public broadcaster. |
| Kurdistan 24 | state_aligned | Iraq - Kurdistan Regional Government (KDP; Barzani family) | <https://en.wikipedia.org/wiki/Kurdistan_24>, <https://www.atlanticcouncil.org/blogs/syriasource/challenges-facing-a-developing-kurdish-media/>, <https://syriadirect.org/red-tape-in-northeast-syria-kurdish-political-tensions-shrink-the-media-space/> | Reported (unacknowledged) owner Masrour Barzani, now KRG Prime Minister; editorial policy "biased towards" the ruling KDP. Not `party`: the KRG/KDP is not a party to a tracked conflict (<https://www.aljazeera.com/news/2026/8/8/iraqs-kurdish-region-wants-to-stay-out-of-regional-conflicts-pm-barzani>). |
| Samaa TV | independent | — | <https://en.wikipedia.org/wiki/Samaa_TV>, <https://en.wikipedia.org/wiki/Abdul_Aleem_Khan>, <https://www.journalismpakistan.com/aleem-khan-resigns-as-minister-to-ensure-neutrality-as-samaa-owner> | Private owner Aleem Khan is a sitting federal minister, but no source documents a government-following editorial line. |
| ABC (Australia) | independent | — | <https://en.wikipedia.org/wiki/ABC_News_(Australia)>, <https://statemediamonitor.com/2026/06/australian-broadcasting-corporation-abc/> | Public broadcaster classified Independent State-Funded (ISF). |
| Alhurra | state_aligned | United States (USAGM-funded; operated by MBN) | <https://en.wikipedia.org/wiki/Alhurra>, <https://www.usagm.gov/networks/mbn/>, <https://statemediamonitor.com/2026/06/usagm/> | "American government-funded", run by USAGM grantee MBN; USAGM classed State-Controlled since 2025. Not `party`: run by a non-profit grantee, not a government body. |
| Iran International | independent | — | <https://en.wikipedia.org/wiki/Iran_International>, <https://www.iranintl.com/en/about-us> | Documented owner Volant Media UK Ltd. Allegation: Saudi royal-court-linked financing; denial: the outlet denies Saudi government funding or ties. |
| NIAC (National Iranian American Council) | independent | — | <https://en.wikipedia.org/wiki/National_Iranian_American_Council>, <https://niacouncil.org/about/> | Advocacy organisation; "does not receive funds from the Iranian government nor the United States government". |
| Rybar | state_aligned | Russia (Rostec contract funding, per US State Department) | <https://rewardsforjustice.net/rewards/rybar/>, <https://www.themoscowtimes.com/2024/10/19/us-posts-10-million-reward-citing-russian-election-interference-a86750>, <https://en.wikipedia.org/wiki/Mikhail_Zvinchuk> | US State Department: "receives funding for contracted work from" state-owned Rostec; no denial of that found (Zvinchuk's 2022 "funded by donations" predates it). |

## Counts

After the seed and the rulings: 96 outlets, 207 aliases (89 `source_name`, 118 `host`).
(Seed alone: 83 outlets, 181 aliases — 76 `source_name`, 105 `host`.)

| party_status | source_tier | outlets |
|---|---|---|
| party | 3 | 5 |
| state_aligned | 2 | 2 |
| state_aligned | 3 | 20 |
| state_aligned | — (no desk tier) | 11 (5 seed + 6 ruled) |
| independent | 1 | 6 |
| independent | 2 | 16 |
| independent | — (no desk tier) | 36 (29 seed + 7 ruled) |

## Outlets

| Outlet | Status | Affiliation | Tier | Lang | Country | Basis URL(s) (opened 2026-10-13) |
|---|---|---|---|---|---|---|
| AFP | independent | — | 1 | fr | FR | <https://en.wikipedia.org/wiki/Agence_France-Presse> |
| Reuters | independent | — | 1 | en | GB | <https://en.wikipedia.org/wiki/Reuters> |
| Associated Press | independent | — | 1 | en | US | <https://en.wikipedia.org/wiki/Associated_Press> |
| PolitiFact | independent | — | 1 | en | US | <https://en.wikipedia.org/wiki/PolitiFact> |
| NetBlocks | independent | — | 1 | en | GB | <https://netblocks.org/about> |
| Human Rights Watch | independent | — | 1 | en | US | <https://en.wikipedia.org/wiki/Human_Rights_Watch> |
| Financial Times | independent | — | 2 | en | GB | <https://en.wikipedia.org/wiki/Financial_Times> |
| Al Jazeera English | independent | — | 2 | en | QA | <https://en.wikipedia.org/wiki/Al_Jazeera_English> |
| Al Jazeera Arabic | independent | — | 2 | ar | QA | <https://en.wikipedia.org/wiki/Al_Jazeera_Media_Network> |
| BBC News | independent | — | 2 | en | GB | <https://en.wikipedia.org/wiki/BBC_News> |
| The Guardian | independent | — | 2 | en | GB | <https://en.wikipedia.org/wiki/The_Guardian> |
| The New York Times | independent | — | 2 | en | US | <https://en.wikipedia.org/wiki/The_New_York_Times> |
| The Washington Post | independent | — | 2 | en | US | <https://en.wikipedia.org/wiki/The_Washington_Post> |
| Bloomberg News | independent | — | 2 | en | US | <https://en.wikipedia.org/wiki/Bloomberg_News> |
| CNN | independent | — | 2 | other | US | <https://en.wikipedia.org/wiki/CNN> |
| Middle East Eye | independent | — | 2 | en | GB | <https://en.wikipedia.org/wiki/Middle_East_Eye> |
| Sudan Tribune | independent | — | 2 | other | FR | <https://en.wikipedia.org/wiki/Sudan_Tribune> |
| Addis Standard | independent | — | 2 | en | ET | <https://en.wikipedia.org/wiki/Addis_Standard> |
| The National | state_aligned | UAE (Abu Dhabi ownership) | 2 | en | AE | <https://en.wikipedia.org/wiki/The_National_(Abu_Dhabi> |
| Arab News | state_aligned | Saudi Arabia (SRMG; promotes the Saudi government) | 2 | en | SA | <https://en.wikipedia.org/wiki/Arab_News> |
| IRNA | state_aligned | Iran (official state news agency) | 3 | en | IR | <https://en.wikipedia.org/wiki/Islamic_Republic_News_Agency> |
| ISNA | state_aligned | Iran (ACECR; state-subsidised) | 3 | en | IR | <https://statemediamonitor.com/2026/06/iranian-students-news-agency-isna/> |
| Mehr News Agency | state_aligned | Iran (Islamic Development Organization) | 3 | en | IR | <https://en.wikipedia.org/wiki/Mehr_News_Agency> |
| Tasnim News Agency | state_aligned | Iran (IRGC-associated) | 3 | en | IR | <https://en.wikipedia.org/wiki/Tasnim_News_Agency> |
| Fars News Agency | state_aligned | Iran (IRGC-affiliated) | 3 | fa | IR | <https://en.wikipedia.org/wiki/Fars_News_Agency> |
| Press TV | state_aligned | Iran (IRIB, state-owned) | 3 | en | IR | <https://en.wikipedia.org/wiki/Press_TV> |
| TASS | state_aligned | Russia (state-owned) | 3 | en | RU | <https://en.wikipedia.org/wiki/TASS> |
| RT | state_aligned | Russia (state-controlled, government-funded) | 3 | other | RU | <https://en.wikipedia.org/wiki/RT_(TV_network> |
| Xinhua | state_aligned | China (official state news agency) | 3 | other | CN | <https://en.wikipedia.org/wiki/Xinhua_News_Agency> |
| Saudi Press Agency | state_aligned | Saudi Arabia (state news agency) | 3 | ar | SA | <https://en.wikipedia.org/wiki/Saudi_Press_Agency> |
| WAM (Emirates News Agency) | state_aligned | UAE (official news agency) | 3 | ar | AE | <https://en.wikipedia.org/wiki/Emirates_News_Agency> |
| Saba (Houthi-run, Sanaa) | state_aligned | Yemen - Houthi authorities (Supreme Political Council, Sanaa) | 3 | ar | YE | <https://statemediamonitor.com/yemen/>, <https://statemediamonitor.com/2026/06/yemen-news-agency-saba/> |
| Saba (internationally recognised government) | state_aligned | Yemen - internationally recognised government (Presidential Leadership Council) | 3 | ar | YE | <https://statemediamonitor.com/yemen/> |
| Al-Ahram | state_aligned | Egypt (majority government-owned) | 3 | other | EG | <https://en.wikipedia.org/wiki/Al-Ahram> |
| Fana Media Corporation | state_aligned | Ethiopia (state-owned) | 3 | en | ET | <https://en.wikipedia.org/wiki/Fana_Broadcasting_Corporate> |
| SONNA | state_aligned | Somalia (Federal Government, Ministry of Information) | 3 | en | SO | <https://www.moi.gov.so/department.php?slug=sonna> |
| SUNA | state_aligned | Sudan (SAF-aligned government, Ministry of Culture and Information) | 3 | ar | SD | <https://statemediamonitor.com/2026/05/sudan-news-agency-suna/>, <https://en.wikipedia.org/wiki/Sudan_News_Agency> |
| ENA (Ethiopian News Agency) | state_aligned | Ethiopia (official government news agency) | 3 | en | ET | <https://en.wikipedia.org/wiki/Ethiopian_News_Agency> |
| Shabait (Eritrea Ministry of Information) | state_aligned | Eritrea (Ministry of Information) | 3 | en | ER | <https://statemediamonitor.com/eritrea/> |
| Al Mayadeen | state_aligned | Hezbollah / Iran-aligned (editorial alignment; owners undisclosed) | 3 | ar | LB | <https://en.wikipedia.org/wiki/Al_Mayadeen> |
| CENTCOM | party | US military | 3 | en | US | <https://en.wikipedia.org/wiki/United_States_Central_Command> |
| US Department of Defense | party | US government (Department of Defense / Department of War) | 3 | en | US | <https://en.wikipedia.org/wiki/United_States_Department_of_Defense> |
| IDF | party | Israeli military | 3 | en | IL | <https://en.wikipedia.org/wiki/Israel_Defense_Forces> |
| Al-Masirah | party | Houthi movement (Ansar Allah) | 3 | ar | YE | <https://en.wikipedia.org/wiki/Al-Masirah> |
| Al-Manar | party | Hezbollah | 3 | ar | LB | <https://en.wikipedia.org/wiki/Al-Manar> |
| The Jerusalem Post | independent | — | 2 | en | IL | <https://en.wikipedia.org/wiki/The_Jerusalem_Post> |
| Al-Monitor | independent | — | 2 | en | US | <https://en.wikipedia.org/wiki/Al-Monitor> |
| Asharq Al-Awsat | state_aligned | Saudi Arabia (owned by a member of the royal family; supports the Saudi government) | — | other | SA | <https://en.wikipedia.org/wiki/Asharq_Al-Awsat> |
| Haaretz | independent | — | 2 | en | IL | <https://www.familybusinessmagazine.com/uncategorized/german-firm-plans-to-sell-its-stake-in-family-controlled-haaretz/> |
| Naharnet | independent | — | — | en | LB | <https://www.naharnet.com/about> |
| The Hindu | independent | — | — | en | IN | <https://en.wikipedia.org/wiki/The_Hindu> |
| Anadolu Agency | state_aligned | Turkey (state-run news agency) | — | other | TR | <https://en.wikipedia.org/wiki/Anadolu_Agency> |
| The Times of India | independent | — | — | en | IN | <https://en.wikipedia.org/wiki/The_Times_of_India> |
| The Economic Times | independent | — | — | en | IN | <https://en.wikipedia.org/wiki/The_Economic_Times> |
| ARY News | independent | — | — | en | PK | <https://en.wikipedia.org/wiki/ARY_News> |
| Israel Hayom | independent | — | — | en | IL | <https://en.wikipedia.org/wiki/Israel_Hayom> |
| The Peninsula | state_aligned | Qatar (owned by a senior member of the ruling family; pro-government) | — | en | QA | <https://en.wikipedia.org/wiki/The_Peninsula_(newspaper> |
| Dawn | independent | — | — | en | PK | <https://en.wikipedia.org/wiki/Dawn_(newspaper> |
| NDTV | independent | — | — | en | IN | <https://en.wikipedia.org/wiki/NDTV> |
| GlobalSecurity.org | independent | — | — | en | US | <https://en.wikipedia.org/wiki/GlobalSecurity.org> |
| Egypt Independent | independent | — | — | en | EG | <https://en.wikipedia.org/wiki/Al-Masry_Al-Youm>, <https://en.wikipedia.org/wiki/Egypt_Independent> |
| Geo News | independent | — | — | en | PK | <https://en.wikipedia.org/wiki/Geo_News> |
| Hindustan Times | independent | — | — | en | IN | <https://en.wikipedia.org/wiki/Hindustan_Times> |
| IANS | independent | — | — | en | IN | <https://en.wikipedia.org/wiki/Indo-Asian_News_Service> |
| Radio Dabanga | independent | — | — | other | NL | <https://freepressunlimited.org/en/projects/radio-dabanga-radio-life> |
| WAFA | state_aligned | Palestinian Authority (official state-run agency; Fatah-aligned) | — | en | PS | <https://en.wikipedia.org/wiki/WAFA> |
| The Hill | independent | — | — | en | US | <https://en.wikipedia.org/wiki/The_Hill_(newspaper> |
| Axios | independent | — | — | en | US | <https://en.wikipedia.org/wiki/Axios_(website> |
| Foreign Policy | independent | — | — | en | US | <https://en.wikipedia.org/wiki/Foreign_Policy> |
| New York Post | independent | — | — | en | US | <https://en.wikipedia.org/wiki/New_York_Post> |
| The Jordan Times | independent | — | — | en | JO | <https://jordantimes.com/about-us> |
| SANA | state_aligned | Syria (state-owned; Ministry of Information) | — | other | SY | <https://en.wikipedia.org/wiki/Syrian_Arab_News_Agency> |
| The Reporter (Ethiopia) | independent | — | — | en | ET | <https://en.wikipedia.org/wiki/The_Reporter_(Ethiopia> |
| i24NEWS | independent | — | — | en | IL | <https://en.wikipedia.org/wiki/I24NEWS> |
| Breitbart News | independent | — | — | en | US | <https://en.wikipedia.org/wiki/Breitbart_News> |
| Africanews | independent | — | — | en | FR | <https://www.africanews.com/page/pressroom/>, <https://en.wikipedia.org/wiki/Euronews> |
| Ynetnews | independent | — | — | en | IL | <https://www.ynetnews.com/articles/0> |
| The Times of Israel | independent | — | — | en | IL | <https://en.wikipedia.org/wiki/The_Times_of_Israel> |
| The Media Line | independent | — | — | en | US | <https://en.wikipedia.org/wiki/The_Media_Line> |
| Critical Threats Project | independent | — | — | en | US | <https://en.wikipedia.org/wiki/Critical_Threats_Project> |
| Euronews | independent | — | — | en | FR | <https://en.wikipedia.org/wiki/Euronews> |
| ThePrint | independent | — | — | en | IN | <https://en.wikipedia.org/wiki/ThePrint> |
| Mada Masr | independent | — | 2 | other | EG | <https://en.wikipedia.org/wiki/Mada_Masr> |
| Middle East Monitor | state_aligned | Qatar (state-financed) | — | en | GB | <https://en.wikipedia.org/wiki/Middle_East_Monitor> (ruled) |
| Gulf News | independent | — | — | en | AE | <https://en.wikipedia.org/wiki/Gulf_News> (ruled) |
| Daily Sabah | state_aligned | Turkey (Turkuvaz Media Group / Kalyon Group; pro-government) | — | en | TR | <https://en.wikipedia.org/wiki/Daily_Sabah> (ruled) |
| Hürriyet Daily News | independent | — | — | en | TR | <https://en.wikipedia.org/wiki/H%C3%BCrriyet_Daily_News> (ruled) |
| ANI (Asian News International) | state_aligned | India (private agency documented as closely associated with the government) | — | en | IN | <https://en.wikipedia.org/wiki/Asian_News_International> (ruled) |
| France 24 | independent | — | — | other | FR | <https://statemediamonitor.com/2026/09/france-medias-monde-fmm/> (ruled) |
| Kurdistan 24 | state_aligned | Iraq - Kurdistan Regional Government (KDP; Barzani family) | — | other | IQ | <https://www.atlanticcouncil.org/blogs/syriasource/challenges-facing-a-developing-kurdish-media/> (ruled) |
| Samaa TV | independent | — | — | other | PK | <https://en.wikipedia.org/wiki/Samaa_TV> (ruled) |
| ABC (Australia) | independent | — | — | en | AU | <https://statemediamonitor.com/2026/06/australian-broadcasting-corporation-abc/> (ruled) |
| Alhurra | state_aligned | United States (USAGM-funded; operated by MBN) | — | ar | US | <https://en.wikipedia.org/wiki/Alhurra> (ruled) |
| Iran International | independent | — | — | other | GB | <https://en.wikipedia.org/wiki/Iran_International> (ruled) |
| NIAC (National Iranian American Council) | independent | — | — | en | US | <https://en.wikipedia.org/wiki/National_Iranian_American_Council> (ruled) |
| Rybar | state_aligned | Russia (Rostec contract funding, per US State Department) | — | other | RU | <https://rewardsforjustice.net/rewards/rybar/> (ruled) |

The full one-line basis for each row is in the migration (`classification_basis`).

## Aliases

| Outlet | `source_name` aliases | `host` aliases |
|---|---|---|
| AFP | — | `afp.com` |
| Reuters | `reuters.com` | `reuters.com` |
| Associated Press | — | `apnews.com` |
| PolitiFact | `politifact.com` | `politifact.com` |
| NetBlocks | — | `netblocks.org` |
| Human Rights Watch | `hrw.org` | `hrw.org` |
| Financial Times | `Financial Times` | `ft.com` |
| Al Jazeera English | `aljazeera.com`, `Al Jazeera` | `aljazeera.com` |
| Al Jazeera Arabic | `aljazeera.net` | `aljazeera.net` |
| BBC News | `bbc.com`, `bbc.co.uk`, `BBC World`, `BBC Middle East` | `bbc.com`, `bbc.co.uk` |
| The Guardian | `theguardian.com` | `theguardian.com` |
| The New York Times | `nytimes.com` | `nytimes.com` |
| The Washington Post | — | `washingtonpost.com` |
| Bloomberg News | — | — |
| CNN | `cnn.com` | `cnn.com`, `edition.cnn.com`, `us.cnn.com`, `arabic.cnn.com`, `cnnespanol.cnn.com` |
| Middle East Eye | `middleeasteye.net`, `Middle East Eye` | `middleeasteye.net` |
| Sudan Tribune | `Sudan Tribune (AR)` | `sudantribune.com`, `sudantribune.net` |
| Addis Standard | — | `addisstandard.com` |
| The National | `thenationalnews.com` | `thenationalnews.com` |
| Arab News | `arabnews.com` | `arabnews.com` |
| IRNA | `IRNA English` | `en.irna.ir` |
| ISNA | `ISNA (Iran Students)` | `en.isna.ir`, `isna.ir` |
| Mehr News Agency | `Mehr News` | `en.mehrnews.com`, `mehrnews.com` |
| Tasnim News Agency | — | `tasnimnews.ir` |
| Fars News Agency | — | `farsnews.ir` |
| Press TV | `presstv.co.uk`, `presstv.ir` | `presstv.ir`, `presstv.co.uk` |
| TASS | `TASS` | `tass.com` |
| RT | `rt.com`, `RT (Russian State)`, `RT Arabic` | `rt.com`, `actualidad.rt.com`, `russian.rt.com`, `arabic.rt.com` |
| Xinhua | `xinhuanet.com`, `english.news.cn`, `arabic.news.cn` | `xinhuanet.com`, `english.news.cn`, `french.xinhuanet.com`, `spanish.xinhuanet.com`, `arabic.news.cn` |
| Saudi Press Agency | — | `spa.gov.sa` |
| WAM (Emirates News Agency) | — | `wam.ae` |
| Saba (Houthi-run, Sanaa) | — | `saba.ye` |
| Saba (internationally recognised government) | — | — |
| Al-Ahram | `ahram.org.eg` | `english.ahram.org.eg`, `gate.ahram.org.eg` |
| Fana Media Corporation | `Fana Media Corporation (Ethiopia)` | `fanamc.com` |
| SONNA | `SONNA (Somali National News Agency)` | `sonna.so` |
| SUNA | — | `suna-sd.net`, `suna-news.net` |
| ENA (Ethiopian News Agency) | — | `ena.et` |
| Shabait (Eritrea Ministry of Information) | `shabait.com` | `shabait.com` |
| Al Mayadeen | — | `almayadeen.net`, `english.almayadeen.net` |
| CENTCOM | — | `centcom.mil` |
| US Department of Defense | `Pentagon (DoD)` | `war.gov`, `defense.gov` |
| IDF | — | `idf.il` |
| Al-Masirah | — | `english.almasirah.net.ye` |
| Al-Manar | — | `almanar.com.lb`, `english.almanar.com.lb` |
| The Jerusalem Post | `jpost.com` | `jpost.com` |
| Al-Monitor | `al-monitor.com`, `Al-Monitor` | `al-monitor.com` |
| Asharq Al-Awsat | `aawsat.com`, `Asharq Al-Awsat` | `aawsat.com`, `english.aawsat.com` |
| Haaretz | `haaretz.com` | `haaretz.com` |
| Naharnet | `naharnet.com` | `naharnet.com`, `mobile.naharnet.com`, `prod.naharnet.com` |
| The Hindu | `thehindu.com`, `The Hindu` | `thehindu.com` |
| Anadolu Agency | `aa.com.tr` | `aa.com.tr` |
| The Times of India | — | `timesofindia.indiatimes.com` |
| The Economic Times | — | `economictimes.indiatimes.com` |
| ARY News | `arynews.tv`, `ARY News (Pakistan)` | `arynews.tv` |
| Israel Hayom | `Israel Hayom` | `israelhayom.com` |
| The Peninsula | `thepeninsulaqatar.com` | `thepeninsulaqatar.com` |
| Dawn | `Dawn (Pakistan)` | `dawn.com` |
| NDTV | `NDTV (India)` | `ndtv.com` |
| GlobalSecurity.org | `globalsecurity.org` | `globalsecurity.org` |
| Egypt Independent | `egyptindependent.com`, `Egypt Independent` | `egyptindependent.com` |
| Geo News | `geo.tv` | `geo.tv` |
| Hindustan Times | `hindustantimes.com` | `hindustantimes.com` |
| IANS | `ianslive.in` | `ianslive.in` |
| Radio Dabanga | `dabangasudan.org`, `Radio Dabanga (AR)`, `Radio Dabanga (EN)` | `dabangasudan.org` |
| WAFA | `english.wafa.ps` | `english.wafa.ps` |
| The Hill | `The Hill` | `thehill.com` |
| Axios | `Axios` | `axios.com` |
| Foreign Policy | `foreignpolicy.com`, `Foreign Policy` | `foreignpolicy.com` |
| New York Post | `nypost.com` | `nypost.com` |
| The Jordan Times | `jordantimes.com`, `Jordan Times` | `jordantimes.com` |
| SANA | `sana.sy` | `sana.sy` |
| The Reporter (Ethiopia) | `thereporterethiopia.com` | `thereporterethiopia.com` |
| i24NEWS | `i24news.tv` | `i24news.tv` |
| Breitbart News | `breitbart.com` | `breitbart.com` |
| Africanews | `africanews.com`, `Africanews` | `africanews.com` |
| Ynetnews | `ynetnews.com` | `ynetnews.com` |
| The Times of Israel | — | `timesofisrael.com` |
| The Media Line | — | `themedialine.org` |
| Critical Threats Project | — | `criticalthreats.org` |
| Euronews | — | `euronews.com` |
| ThePrint | — | `theprint.in` |
| Mada Masr | — | `madamasr.com` |
| Middle East Monitor | `middleeastmonitor.com`, `Middle East Monitor` | `middleeastmonitor.com` |
| Gulf News | `gulfnews.com` | `gulfnews.com` |
| Daily Sabah | `dailysabah.com` | `dailysabah.com` |
| Hürriyet Daily News | `hurriyetdailynews.com` | `hurriyetdailynews.com` |
| ANI (Asian News International) | `aninews.in` | `aninews.in` |
| France 24 | `France24` | `france24.com` |
| Kurdistan 24 | `Kurdistan 24` | `kurdistan24.net` |
| Samaa TV | `samaa.tv` | `samaa.tv` |
| ABC (Australia) | `abc.net.au` | `abc.net.au` |
| Alhurra | — | `alhurra.com` |
| Iran International | — | `iranintl.com` |
| NIAC (National Iranian American Council) | `niacouncil.org` | `niacouncil.org`, `insights.niacouncil.org` |
| Rybar | `Rybar (English)`, `Rybar (Russian)` | — (Telegram, `t.me` is never an alias) |

## Left unregistered (stay `unknown`)

Production top-120 `articles.source_name` values (last 30 days, 2026-10-13) and daily-briefing hosts that are
**consciously not registered**. "Ruling needed" = evidence was found but the desk had no rule for that kind
of outlet. **Every "ruling needed" row below was classified on 2026-10-13 under the delegated rule above
(`20261013200000_outlet_registry_rulings.sql`); the rows are kept as the seed-time record that
`outlet_registry_seed_unregistered.sql` mirrors.** Not-researched / ownership-not-sourced rows stay `unknown`.

| source_name / host | Reason | Evidence seen |
|---|---|---|
| middleeastmonitor.com | ruling needed | Wikipedia https://en.wikipedia.org/wiki/Middle_East_Monitor (opened 2026-10-13): 'MEMO is financed by the State of Qatar'; pro-Palestinian advocacy group. No desk rule for Qatar-funded outlets other than Al Jazeera (DECISION-002). |
| Middle East Monitor | ruling needed | Same outlet as middleeastmonitor.com. |
| Intel Slava | ownership not sourced | Telegram channel (t.me); no ownership evidence found. |
| bignewsnetwork.com | ownership not sourced | Syndication/aggregator site; owner not sourced. |
| gulfnews.com | ruling needed | Wikipedia https://en.wikipedia.org/wiki/Gulf_News (opened 2026-10-13): owned through Al Nisr Publishing by the private Al Tayer Group, chaired by former UAE Finance Minister Obaid Al Tayer. Private but government-linked; no desk rule. |
| aninews.in | ruling needed | Wikipedia https://en.wikipedia.org/wiki/Asian_News_International (opened 2026-10-13): private agency described by The Caravan and The Ken as 'closely associated with the government of India'. |
| dailysabah.com | ruling needed | Wikipedia https://en.wikipedia.org/wiki/Daily_Sabah (opened 2026-10-13): Turkuvaz-owned, 'pro-government', 'frequently called a propaganda outlet for the Turkish government'; not state-owned. No desk rule for pro-government private media. |
| aol.co.uk | ownership not sourced | Portal/aggregator; not classified. |
| Rybar (English) | ruling needed | Telegram channel. US State Department (via The Moscow Times https://themoscowtimes.com/2024/10/19/us-posts-10-million-reward-citing-russian-election-interference-a86750, opened 2026-10-13) says Rybar 'receives funding from Russian defense industrial organization Rostec'. That is a belligerent government's claim; operator to rule. |
| Rybar (Russian) | ruling needed | Same channel as Rybar (English). |
| indiatimes.com | ownership not sourced | source_name spans two outlets; its timesofindia.indiatimes.com and economictimes.indiatimes.com hosts are registered (The Times of India, The Economic Times). The bare indiatimes.com host is left unmapped. |
| jns.org | ownership not sourced | Wikipedia gives no owner; ProPublica (https://projects.propublica.org/nonprofits/organizations/450949784, opened 2026-10-13) lists 'Jewish News Service Inc', a 501(c)(3), with 'Jns' under the name, but does not name Jewish News Syndicate or jns.org. |
| oilprice.com | ownership not sourced | oilprice.com/about returns 404; owner not sourced. |
| OilPrice.com | ownership not sourced | Same outlet as oilprice.com. |
| hurriyetdailynews.com | ruling needed | Wikipedia https://en.wikipedia.org/wiki/H%C3%BCrriyet_Daily_News (opened 2026-10-13): sold in 2018 to Demirören Holding, 'owned by Yildirim Demiroren, a close ally of Erdogan'. Private, government-linked; no desk rule. |
| wn.com | ownership not sourced | Aggregator; not classified. |
| diariosigloxxi.com | not researched | No evidence opened. |
| haberler.com | not researched | No evidence opened (aggregator). |
| France24 | ruling needed | Wikipedia https://en.wikipedia.org/wiki/France_24 (opened 2026-10-13): 'French state-owned publicly funded international news television network'. Desk rules cover only the BBC among public broadcasters. |
| inewsgr.com | not researched | No evidence opened. |
| israelnationalnews.com | ownership not sourced | Wikipedia (Arutz Sheva) states a religious-Zionist identity but no owner. |
| clevelandjewishnews.com | not researched | No evidence opened. |
| Hiiraan Online | ownership not sourced | Wikipedia says it is run from Ottawa; no owner stated; hiiraan.com/about.aspx returns 404. |
| aol.com | ownership not sourced | Portal/aggregator; not classified. |
| prokerala.com | not researched | No evidence opened (aggregator). |
| news.az | not researched | No evidence opened. |
| moneycontrol.com | ownership not sourced | Wikipedia 'Moneycontrol' redirects to Network18 Group (Reliance majority) but no page states the ownership of moneycontrol.com. |
| Our Wars Today | ownership not sourced | Telegram channel (t.me); no ownership evidence found. |
| allafrica.com | not researched | No evidence opened (aggregator). |
| Kurdistan 24 | ruling needed | Wikipedia https://en.wikipedia.org/wiki/Kurdistan_24 (opened 2026-10-13): 'described as being affiliated with the Kurdistan Democratic Party ... particularly current prime minister Masrour Barzani'. Party-affiliated regional media; no desk rule. |
| dominicanrepublicpost.com | not researched | No evidence opened. |
| islamicinvitationturkey.com | not researched | No evidence opened. |
| yahoo.com | ownership not sourced | Portal/aggregator; not classified. |
| en.apa.az | ownership not sourced | Wikipedia calls APA an 'Azerbaijani government press agency' but cites only its Ministry of Justice registration; evidence too thin to classify. |
| theyeshivaworld.com | not researched | No evidence opened. |
| middle-east-online.com | ownership not sourced | No Wikipedia article under that name; owner not sourced. |
| baomoi.com | not researched | No evidence opened (aggregator). |
| siasat.com | not researched | No evidence opened. |
| freemalaysiatoday.com | not researched | No evidence opened. |
| wgauradio.com | not researched | No evidence opened. |
| eurasiareview.com | not researched | No evidence opened. |
| europapress.es | not researched | No evidence opened. |
| tienphong.vn | not researched | No evidence opened. |
| iranherald.com | not researched | No evidence opened (aggregator). |
| zerohedge.com | not researched | No evidence opened. |
| breakingnews.ie | not researched | No evidence opened. |
| samaa.tv | ruling needed | Wikipedia https://en.wikipedia.org/wiki/Samaa_TV (opened 2026-10-13): 'owned by businessman and politician Aleem Khan'. Politician-owned; no desk rule. |
| azernews.az | not researched | No evidence opened. |
| come-on.de | not researched | No evidence opened. |
| dantri.com.vn | not researched | No evidence opened. |
| dunyanews.tv | not researched | No evidence opened. |
| thefrontierpost.com | not researched | No evidence opened. |
| winnipegfreepress.com | not researched | No evidence opened. |
| finanzen.net | not researched | No evidence opened. |
| business-standard.com | not researched | No evidence opened. |
| heraldglobe.com | not researched | No evidence opened. |
| dailymail.com | not researched | No evidence opened. |
| freerepublic.com | not researched | No evidence opened. |
| middleeaststar.com | not researched | No evidence opened. |

### Daily-briefing hosts not registered (last 10 days)

| Host(s) | Reason | Evidence seen |
|---|---|---|
| abc.net.au | ruling needed | ABC News is the news service of 'Australia's public broadcaster' (Wikipedia https://en.wikipedia.org/wiki/ABC_News_(Australia), opened 2026-10-13); public broadcasters other than the BBC have no desk rule. |
| alhurra.com | ruling needed | 'an American government-funded Arabic-language' network operated by MBN, a USAGM grantee (Wikipedia https://en.wikipedia.org/wiki/Alhurra, opened 2026-10-13). US-government funded; operator to rule (party vs state_aligned vs independent). |
| iranintl.com | ruling needed | 'backed by Saudi-linked private investors'; the outlet 'denies receiving funding from or having ties to the Saudi government' (Wikipedia https://en.wikipedia.org/wiki/Iran_International, opened 2026-10-13). |
| insights.niacouncil.org / niacouncil.org | ruling needed | NIAC is 'an American lobby' (Wikipedia https://en.wikipedia.org/wiki/National_Iranian_American_Council, opened 2026-10-13): advocacy group, not a news outlet. |
| mofa.gov.ae, fm.gov.om, suezcanal.gov.eg, uae-embassy.org | ownership not sourced | Government ministry/embassy sites; not opened this session. Government primary sources should be flagged by the routine directly. |
| straits.live, egrates.com, tradingeconomics.com, gcaptain.com, bairdmaritime.com, pashizi.com, alanchand.com, wise.com, worldoil.com, lloydslistintelligence.com, insights.windward.ai | not researched | Data / trade / shipping sources; not researched. |
| abcnews.com, asiatimes.com, amnestyusa.org, ohchr.org, en-hrana.org, emro.who.int, jinsa.org, twz.com, defensedaily.com, truthout.org, spokesman.com, dawan.africa, yemenmonitor.com, dailynewsegypt.com, cyprus-mail.com, agbi.com, gpb.org, thisisbeirut.com.lb, nation.com.pk, deccanherald.com, irishtimes.com, thestatesman.com, outlookindia.com, airwars.org, unognewsroom.org, mediaite.com, globalbankingandfinance.com, defense-arabic.com | not researched | 1-4 citations each in 10 days; not researched this pass (Asia Times and Daily News Egypt: Wikipedia opened, no owner stated). |

## Found while seeding (not fixed here)

- **SONNA articles have relative URLs** (`/en/article/...`, 36 rows in 30 days), so `url_host()` is NULL and
  no host alias can match them; they resolve by `source_name` only. Collector fix (Claude): the SONNA feed
  adapter should absolutise links against `https://sonna.so`.
- `Asharq Al-Awsat` and `Jordan Times` rows arrive as `news.google.com` links; they resolve through their
  `source_name` aliases only (`news.google.com` is never an alias).
- Rows for `RT (Russian State)` / `RT Arabic` also come from `rt-english.com`, `rtarabic.com` and
  `actualidad-rt.com`; those mirror hosts were not verified as RT-operated, so they are not host aliases (the
  rows still resolve by `source_name`).
- The repo's `collaboration/SOURCES.md` lists the BBC as Tier 1; the operator tier list applied here puts it in
  Tier 2. The seed follows the operator list; SOURCES.md was not edited (collaboration/ is notes).
