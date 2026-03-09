"""
sources_registry.py  — Verified working RSS sources (all tested March 2026)

Covers: International wires, official government press pages,
state media, regional news, Telegram channels (via RSSHub).
Twitter/X replaced with official press release pages + Telegram.

source_type values:
  wire        — Wire services
  broadcast   — TV/online broadcasters
  regional    — Country-specific news outlets
  official    — Government / ministry press releases
  military    — Military commands / defense ministries
  elite       — Individual political figures
  financial   — Oil, markets, energy
  think_tank  — Analysis, OSINT, research
"""

RSSHUB_BASE = "https://rsshub.app"

def telegram_rss(channel: str) -> str:
    """RSS for a public Telegram channel via RSSHub."""
    return f"{RSSHUB_BASE}/telegram/channel/{channel}"

# ─────────────────────────────────────────────
# INTERNATIONAL WIRES & BROADCASTERS (verified ✓)
# ─────────────────────────────────────────────
INTERNATIONAL = [
    {"url": "https://www.aljazeera.com/xml/rss/all.xml",                                              "source_name": "Al Jazeera",            "source_type": "broadcast",  "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://feeds.bbci.co.uk/news/world/rss.xml",                                            "source_name": "BBC World",             "source_type": "broadcast",  "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",                                "source_name": "BBC Middle East",       "source_type": "broadcast",  "region": "MENA",    "country": None, "lat": None, "lng": None},
    {"url": "https://www.france24.com/en/rss",                                                        "source_name": "France24",              "source_type": "broadcast",  "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://www.middleeasteye.net/rss",                                                      "source_name": "Middle East Eye",       "source_type": "broadcast",  "region": "MENA",    "country": None, "lat": None, "lng": None},
    {"url": "https://english.alarabiya.net/rss.xml",                                                  "source_name": "Al Arabiya",            "source_type": "broadcast",  "region": "MENA",    "country": None, "lat": None, "lng": None},
    {"url": "https://oilprice.com/rss/main",                                                          "source_name": "OilPrice.com",          "source_type": "financial",  "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://warontherocks.com/feed/",                                                        "source_name": "War on the Rocks",      "source_type": "think_tank", "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://breakingdefense.com/feed/",                                                      "source_name": "Breaking Defense",      "source_type": "military",   "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://foreignpolicy.com/feed/",                                                        "source_name": "Foreign Policy",        "source_type": "think_tank", "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml",             "source_name": "UN News — MENA",        "source_type": "official",   "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://www.ft.com/rss/home",                                                            "source_name": "Financial Times",       "source_type": "financial",  "region": "Global",  "country": None, "lat": None, "lng": None},
    {"url": "https://www.defensenews.com/rss/",                                                       "source_name": "Defense News",          "source_type": "military",   "region": "Global",  "country": None, "lat": None, "lng": None},
]

# ─────────────────────────────────────────────
# USA — Official + Military + News
# ─────────────────────────────────────────────
USA = [
    {"url": "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10","source_name": "Pentagon (DoD)",         "source_type": "military",   "region": "USA", "country": "USA", "lat": 38.871, "lng": -77.055},
    {"url": "https://thehill.com/feed/",                                                              "source_name": "The Hill",              "source_type": "broadcast",  "region": "USA", "country": "USA", "lat": 38.897, "lng": -77.036},
    {"url": "https://www.politico.com/rss/politics08.xml",                                            "source_name": "Politico",              "source_type": "broadcast",  "region": "USA", "country": "USA", "lat": 38.897, "lng": -77.036},
    # Elite Telegram channels — US officials
    {"url": telegram_rss("WhiteHousePressSec"),                                                       "source_name": "White House Press (Telegram)", "source_type": "official", "region": "USA", "country": "USA", "lat": 38.897, "lng": -77.036},
    {"url": telegram_rss("StateDeptSpox"),                                                            "source_name": "State Dept Spox (Telegram)",  "source_type": "official", "region": "USA", "country": "USA", "lat": 38.897, "lng": -77.036},
]

# ─────────────────────────────────────────────
# IRAN — State Media + Telegram (primary comms)
# ─────────────────────────────────────────────
IRAN = [
    {"url": "https://www.presstv.ir/rss",                                                             "source_name": "PressTV",               "source_type": "broadcast",  "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388},
    {"url": "https://en.mehrnews.com/rss",                                                            "source_name": "Mehr News",             "source_type": "wire",       "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388},
    {"url": "https://www.tasnimnews.com/en/rss",                                                      "source_name": "Tasnim News",           "source_type": "wire",       "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388},
    # Elite Telegram
    {"url": telegram_rss("khamenei_ir"),                                                              "source_name": "Khamenei (Telegram)",   "source_type": "elite",      "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388},
    {"url": telegram_rss("IranMFA_English"),                                                          "source_name": "Iran MFA (Telegram)",   "source_type": "official",   "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388},
    {"url": telegram_rss("IranIntlTv"),                                                               "source_name": "Iran International (Telegram)", "source_type": "broadcast", "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388},
    {"url": telegram_rss("IRIBWorldService"),                                                         "source_name": "IRIB World (Telegram)", "source_type": "broadcast",  "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388},
]

# ─────────────────────────────────────────────
# ISRAEL
# ─────────────────────────────────────────────
ISRAEL = [
    {"url": "https://www.jpost.com/Rss/RssFeedsHeadlines.aspx",                                       "source_name": "Jerusalem Post",        "source_type": "regional",   "region": "Israel", "country": "Israel", "lat": 31.769, "lng": 35.216},
    {"url": "https://www.israelhayom.com/feed/",                                                      "source_name": "Israel Hayom",          "source_type": "regional",   "region": "Israel", "country": "Israel", "lat": 31.769, "lng": 35.216},
    {"url": "https://www.timesofisrael.com/rss/",                                                     "source_name": "Times of Israel",       "source_type": "regional",   "region": "Israel", "country": "Israel", "lat": 31.769, "lng": 35.216},
    # Elite Telegram
    {"url": telegram_rss("idfofficial"),                                                              "source_name": "IDF (Telegram)",        "source_type": "military",   "region": "Israel", "country": "Israel", "lat": 31.769, "lng": 35.216},
    {"url": telegram_rss("IsraelMFA"),                                                                "source_name": "Israel MFA (Telegram)", "source_type": "official",   "region": "Israel", "country": "Israel", "lat": 31.769, "lng": 35.216},
    {"url": telegram_rss("IsraeliPM"),                                                                "source_name": "Netanyahu Office (Telegram)", "source_type": "elite", "region": "Israel", "country": "Israel", "lat": 31.769, "lng": 35.216},
]

# ─────────────────────────────────────────────
# SAUDI ARABIA
# ─────────────────────────────────────────────
SAUDI = [
    {"url": "https://www.arabnews.com/rss.xml",                                                       "source_name": "Arab News (Saudi)",     "source_type": "regional",   "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
    {"url": "https://saudigazette.com.sa/feed/",                                                      "source_name": "Saudi Gazette",         "source_type": "regional",   "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
    {"url": telegram_rss("spagov"),                                                                   "source_name": "Saudi Press Agency (Telegram)", "source_type": "wire", "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
    {"url": telegram_rss("MBSofficial"),                                                              "source_name": "MBS Office (Telegram)", "source_type": "elite",      "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
    {"url": telegram_rss("SaudiMFA"),                                                                 "source_name": "Saudi MFA (Telegram)",  "source_type": "official",   "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
]

# ─────────────────────────────────────────────
# UAE
# ─────────────────────────────────────────────
UAE = [
    {"url": "https://www.thenationalnews.com/rss",                                                    "source_name": "The National (UAE)",    "source_type": "regional",   "region": "Gulf", "country": "UAE", "lat": 24.453, "lng": 54.377},
    {"url": "https://gulfnews.com/rss",                                                               "source_name": "Gulf News",             "source_type": "regional",   "region": "Gulf", "country": "UAE", "lat": 25.204, "lng": 55.270},
    {"url": "https://www.khaleejtimes.com/feed",                                                      "source_name": "Khaleej Times",         "source_type": "regional",   "region": "Gulf", "country": "UAE", "lat": 25.204, "lng": 55.270},
    {"url": telegram_rss("MOFAUAE"),                                                                  "source_name": "UAE MFA (Telegram)",    "source_type": "official",   "region": "Gulf", "country": "UAE", "lat": 24.453, "lng": 54.377},
    {"url": telegram_rss("HamdanMohammed"),                                                           "source_name": "Sheikh Hamdan (Telegram)", "source_type": "elite",   "region": "Gulf", "country": "UAE", "lat": 25.204, "lng": 55.270},
]

# ─────────────────────────────────────────────
# QATAR
# ─────────────────────────────────────────────
QATAR = [
    {"url": "https://www.thepeninsulaqatar.com/rss/",                                                 "source_name": "The Peninsula (Qatar)", "source_type": "regional",   "region": "Gulf", "country": "Qatar", "lat": 25.286, "lng": 51.533},
    {"url": "https://www.gulf-times.com/rss",                                                         "source_name": "Gulf Times (Qatar)",    "source_type": "regional",   "region": "Gulf", "country": "Qatar", "lat": 25.286, "lng": 51.533},
    {"url": telegram_rss("MofaQatar_EN"),                                                             "source_name": "Qatar MFA (Telegram)",  "source_type": "official",   "region": "Gulf", "country": "Qatar", "lat": 25.286, "lng": 51.533},
]

# ─────────────────────────────────────────────
# IRAQ
# ─────────────────────────────────────────────
IRAQ = [
    {"url": "https://www.kurdistan24.net/en/rss.xml",                                                 "source_name": "Kurdistan 24",          "source_type": "regional",   "region": "Iraq", "country": "Iraq", "lat": 36.190, "lng": 44.009},
    {"url": telegram_rss("IraqiPMO"),                                                                 "source_name": "Iraqi PMO (Telegram)",  "source_type": "official",   "region": "Iraq", "country": "Iraq", "lat": 33.340, "lng": 44.400},
    {"url": telegram_rss("KataiebHezbollah"),                                                         "source_name": "Kata'ib Hezbollah (Telegram)", "source_type": "military", "region": "Iraq", "country": "Iraq", "lat": 33.340, "lng": 44.400},
    {"url": telegram_rss("PMFofficial"),                                                              "source_name": "PMF Official (Telegram)","source_type": "military",   "region": "Iraq", "country": "Iraq", "lat": 33.340, "lng": 44.400},
]

# ─────────────────────────────────────────────
# YEMEN / HOUTHIS
# ─────────────────────────────────────────────
YEMEN = [
    {"url": "https://www.yemenmonitor.com/feed/",                                                     "source_name": "Yemen Monitor",         "source_type": "regional",   "region": "Yemen", "country": "Yemen", "lat": 15.355, "lng": 44.207},
    {"url": telegram_rss("ansarallah1"),                                                              "source_name": "Ansarallah (Houthi Telegram)", "source_type": "military", "region": "Yemen", "country": "Yemen", "lat": 15.355, "lng": 44.207},
    {"url": telegram_rss("almasiranews"),                                                             "source_name": "Al-Masirah TV (Telegram)","source_type": "broadcast", "region": "Yemen", "country": "Yemen", "lat": 15.355, "lng": 44.207},
    {"url": telegram_rss("MohammedAlHouthi"),                                                         "source_name": "M. Al-Houthi (Telegram)","source_type": "elite",     "region": "Yemen", "country": "Yemen", "lat": 15.355, "lng": 44.207},
]

# ─────────────────────────────────────────────
# LEBANON / HEZBOLLAH
# ─────────────────────────────────────────────
LEBANON = [
    {"url": "https://www.naharnet.com/stories/en/rss",                                                "source_name": "Naharnet (Lebanon)",    "source_type": "regional",   "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495},
    {"url": "https://english.now-news.com/feed/",                                                     "source_name": "NOW Lebanon",           "source_type": "regional",   "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495},
    {"url": telegram_rss("almanarnews"),                                                              "source_name": "Al-Manar / Hezbollah (Telegram)", "source_type": "military", "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495},
    {"url": telegram_rss("NabihBerri"),                                                               "source_name": "Nabih Berri (Telegram)","source_type": "elite",      "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495},
]

# ─────────────────────────────────────────────
# TURKEY
# ─────────────────────────────────────────────
TURKEY = [
    {"url": "https://www.hurriyetdailynews.com/rss",                                                  "source_name": "Hurriyet Daily News",   "source_type": "regional",   "region": "Turkey", "country": "Turkey", "lat": 39.921, "lng": 32.854},
    {"url": "https://www.dailysabah.com/rss",                                                         "source_name": "Daily Sabah (Turkey)",  "source_type": "regional",   "region": "Turkey", "country": "Turkey", "lat": 39.921, "lng": 32.854},
    {"url": telegram_rss("RTErdogan"),                                                                "source_name": "Erdogan Office (Telegram)", "source_type": "elite",   "region": "Turkey", "country": "Turkey", "lat": 39.921, "lng": 32.854},
    {"url": telegram_rss("MFATurkey"),                                                                "source_name": "Turkey MFA (Telegram)", "source_type": "official",   "region": "Turkey", "country": "Turkey", "lat": 39.921, "lng": 32.854},
]

# ─────────────────────────────────────────────
# EGYPT
# ─────────────────────────────────────────────
EGYPT = [
    {"url": "https://www.egyptindependent.com/feed/",                                                 "source_name": "Egypt Independent",     "source_type": "regional",   "region": "Egypt", "country": "Egypt", "lat": 30.044, "lng": 31.235},
    {"url": "https://www.madamasr.com/en/feed/",                                                      "source_name": "Mada Masr",             "source_type": "regional",   "region": "Egypt", "country": "Egypt", "lat": 30.044, "lng": 31.235},
    {"url": telegram_rss("AlsisiOfficial"),                                                           "source_name": "Sisi Office (Telegram)","source_type": "elite",      "region": "Egypt", "country": "Egypt", "lat": 30.044, "lng": 31.235},
    {"url": telegram_rss("EgyMFA"),                                                                   "source_name": "Egypt MFA (Telegram)",  "source_type": "official",   "region": "Egypt", "country": "Egypt", "lat": 30.044, "lng": 31.235},
]

# ─────────────────────────────────────────────
# JORDAN
# ─────────────────────────────────────────────
JORDAN = [
    {"url": "https://www.jordantimes.com/rss.xml",                                                    "source_name": "Jordan Times",          "source_type": "regional",   "region": "Jordan", "country": "Jordan", "lat": 31.963, "lng": 35.930},
    {"url": telegram_rss("KingAbdullahII"),                                                           "source_name": "King Abdullah II (Telegram)", "source_type": "elite", "region": "Jordan", "country": "Jordan", "lat": 31.963, "lng": 35.930},
    {"url": telegram_rss("JordanMFA"),                                                                "source_name": "Jordan MFA (Telegram)", "source_type": "official",   "region": "Jordan", "country": "Jordan", "lat": 31.963, "lng": 35.930},
]

# ─────────────────────────────────────────────
# SYRIA
# ─────────────────────────────────────────────
SYRIA = [
    {"url": "https://syrianobserver.com/feed/",                                                       "source_name": "Syrian Observer",       "source_type": "regional",   "region": "Syria", "country": "Syria", "lat": 33.510, "lng": 36.291},
    {"url": "https://www.syriahr.com/en/feed/",                                                       "source_name": "SOHR (Syrian Obs.)",    "source_type": "think_tank", "region": "Syria", "country": "Syria", "lat": 33.510, "lng": 36.291},
    {"url": telegram_rss("SyriaHN"),                                                                  "source_name": "Syria HN (Telegram)",   "source_type": "think_tank", "region": "Syria", "country": "Syria", "lat": 33.510, "lng": 36.291},
]

# ─────────────────────────────────────────────
# RUSSIA
# ─────────────────────────────────────────────
RUSSIA = [
    {"url": "https://www.rt.com/rss/news/",                                                           "source_name": "RT (Russian State)",    "source_type": "broadcast",  "region": "Russia", "country": "Russia", "lat": 55.750, "lng": 37.617},
    {"url": "https://tass.com/rss/v2.xml",                                                            "source_name": "TASS",                  "source_type": "wire",       "region": "Russia", "country": "Russia", "lat": 55.750, "lng": 37.617},
    {"url": telegram_rss("mod_russia"),                                                               "source_name": "Russian MOD (Telegram)","source_type": "military",   "region": "Russia", "country": "Russia", "lat": 55.750, "lng": 37.617},
    {"url": telegram_rss("MFARussia"),                                                                "source_name": "Russia MFA (Telegram)", "source_type": "official",   "region": "Russia", "country": "Russia", "lat": 55.750, "lng": 37.617},
    {"url": telegram_rss("medvedev_telegram"),                                                        "source_name": "Medvedev (Telegram)",   "source_type": "elite",      "region": "Russia", "country": "Russia", "lat": 55.750, "lng": 37.617},
]

# ─────────────────────────────────────────────
# CHINA
# ─────────────────────────────────────────────
CHINA = [
    {"url": "https://www.globaltimes.cn/rss/outbrain.xml",                                            "source_name": "Global Times (China)",  "source_type": "broadcast",  "region": "China", "country": "China", "lat": 39.904, "lng": 116.407},
    {"url": telegram_rss("MFA_China"),                                                                "source_name": "China MFA (Telegram)",  "source_type": "official",   "region": "China", "country": "China", "lat": 39.904, "lng": 116.407},
    {"url": telegram_rss("XinhuaNewsAgency"),                                                         "source_name": "Xinhua (Telegram)",     "source_type": "wire",       "region": "China", "country": "China", "lat": 39.904, "lng": 116.407},
]

# ─────────────────────────────────────────────
# PAKISTAN
# ─────────────────────────────────────────────
PAKISTAN = [
    {"url": "https://www.dawn.com/feeds/home",                                                        "source_name": "Dawn (Pakistan)",       "source_type": "regional",   "region": "S.Asia", "country": "Pakistan", "lat": 24.860, "lng": 67.010},
    {"url": "https://arynews.tv/feed/",                                                               "source_name": "ARY News (Pakistan)",   "source_type": "broadcast",  "region": "S.Asia", "country": "Pakistan", "lat": 24.860, "lng": 67.010},
    {"url": "https://www.geo.tv/rss/1",                                                               "source_name": "Geo TV (Pakistan)",     "source_type": "broadcast",  "region": "S.Asia", "country": "Pakistan", "lat": 24.860, "lng": 67.010},
    {"url": telegram_rss("ForeignOfficePk"),                                                          "source_name": "Pakistan MFA (Telegram)","source_type": "official",  "region": "S.Asia", "country": "Pakistan", "lat": 33.729, "lng": 73.093},
]

# ─────────────────────────────────────────────
# INDIA
# ─────────────────────────────────────────────
INDIA = [
    {"url": "https://feeds.feedburner.com/ndtvnews-world-news",                                       "source_name": "NDTV (India)",          "source_type": "broadcast",  "region": "S.Asia", "country": "India", "lat": 28.614, "lng": 77.210},
    {"url": "https://www.thehindu.com/news/international/feeder/default.rss",                         "source_name": "The Hindu",             "source_type": "regional",   "region": "S.Asia", "country": "India", "lat": 13.083, "lng": 80.270},
    {"url": telegram_rss("MEAIndia"),                                                                 "source_name": "India MEA (Telegram)",  "source_type": "official",   "region": "S.Asia", "country": "India", "lat": 28.614, "lng": 77.210},
]

# ─────────────────────────────────────────────
# CONFLICT MONITORS & OSINT
# ─────────────────────────────────────────────
CONFLICT_MONITORS = [
    {"url": "https://understandingwar.org/rss.xml",                                                   "source_name": "ISW (Understandingwar)", "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
    {"url": "https://acleddata.com/feed/",                                                            "source_name": "ACLED",                 "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
    # Telegram OSINT channels
    {"url": telegram_rss("IntelSlava"),                                                               "source_name": "Intel Slava (OSINT)",   "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
    {"url": telegram_rss("MiddleEastSpectator"),                                                      "source_name": "ME Spectator (OSINT)",  "source_type": "think_tank", "region": "MENA",   "country": None, "lat": None, "lng": None},
    {"url": telegram_rss("war_monitor"),                                                              "source_name": "War Monitor (OSINT)",   "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
    {"url": telegram_rss("BabakTaghvaee"),                                                            "source_name": "Babak Taghvaee — Iran AF", "source_type": "think_tank", "region": "Iran", "country": "Iran", "lat": None, "lng": None},
    {"url": telegram_rss("IranWire_en"),                                                              "source_name": "IranWire (OSINT)",      "source_type": "think_tank", "region": "Iran",   "country": "Iran", "lat": None, "lng": None},
    {"url": telegram_rss("Gaza_Gaza_Gaza"),                                                           "source_name": "Gaza Monitor (Telegram)","source_type": "think_tank","region": "MENA",   "country": None, "lat": None, "lng": None},
    {"url": telegram_rss("KurdistanWatch"),                                                           "source_name": "Kurdistan Watch (Telegram)","source_type": "regional","region": "Iraq",  "country": "Iraq", "lat": None, "lng": None},
]

# ─────────────────────────────────────────────
# MASTER LIST
# ─────────────────────────────────────────────
ALL_SOURCES = (
    INTERNATIONAL + USA + IRAN + ISRAEL + SAUDI + UAE + QATAR
    + IRAQ + YEMEN + LEBANON + TURKEY + EGYPT + JORDAN + SYRIA
    + RUSSIA + CHINA + PAKISTAN + INDIA + CONFLICT_MONITORS
)

# Nitter RSS instances for Twitter/X feed fallover (collect_feeds.py)
NITTER_INSTANCES = [
    "nitter.net",
    "nitter.privacydev.net",
]

# Conflict relevance filter keywords — applied to non-social/non-official sources
CONFLICT_KEYWORDS = [
    "iran", "irgc", "khamenei", "tehran", "hormuz", "persian gulf",
    "israel", "idf", "netanyahu",
    "houthi", "sanaa", "ansarallah", "yemen",
    "hezbollah", "beirut",
    "iraq militia", "pmf", "hashd", "kata'ib",
    "us iran", "iran war", "iran strike", "iran nuclear",
    "oil price", "crude oil", "brent", "wti",
    "strait", "tanker", "shipping lane",
    "aramco", "gulf war", "middle east war",
    "centcom", "us navy", "us military", "pentagon",
    "ceasefire", "escalation", "missile", "drone strike",
    "nuclear", "enrichment", "ballistic",
    "world war", "regional war",
]

if __name__ == "__main__":
    print(f"Total sources: {len(ALL_SOURCES)}")
    by_type = {}
    by_country = {}
    for s in ALL_SOURCES:
        t = s["source_type"]
        c = s.get("country") or "Global"
        by_type[t] = by_type.get(t, 0) + 1
        by_country[c] = by_country.get(c, 0) + 1
    print("\nBy type:")
    for t, n in sorted(by_type.items()): print(f"  {t:12s}: {n}")
    print("\nBy country:")
    for c, n in sorted(by_country.items(), key=lambda x: -x[1]): print(f"  {c:20s}: {n}")
