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

source_perspective values (for neutrality tracking):
  western    — English-language Western media/think tanks
  arabic     — Arabic-language regional media
  iranian    — Iranian state/semi-state media (PressTV, Fars, IRNA, Tasnim, Mehr)
  russian    — Russian state/semi-state media (RT, TASS)
  resistance — Hezbollah, Houthi, PMF, IRGC-aligned channels
  neutral    — UN, ICRC, academic, multilateral
"""

import os
import re

RSSHUB_BASE = os.environ.get("RSSHUB_BASE", "https://rsshub.app")

def telegram_rss(channel: str) -> str:
    """RSS for a public Telegram channel via RSSHub."""
    return f"{RSSHUB_BASE}/telegram/channel/{channel}"

# ─────────────────────────────────────────────
# INTERNATIONAL WIRES & BROADCASTERS (verified ✓)
# ─────────────────────────────────────────────
INTERNATIONAL = [
    {"url": "https://www.reuters.com/world/rss",                                                      "source_name": "Reuters World",         "source_type": "wire",       "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://www.reuters.com/world/middle-east/rss",                                          "source_name": "Reuters Middle East",   "source_type": "wire",       "region": "MENA",    "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://api.axios.com/feed/",                                                            "source_name": "Axios",                 "source_type": "broadcast",  "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "http://rss.cnn.com/rss/cnn_topstories.rss",                                              "source_name": "CNN Top Stories",       "source_type": "broadcast",  "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://www.aljazeera.com/xml/rss/all.xml",                                              "source_name": "Al Jazeera",            "source_type": "broadcast",  "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western", "source_tier": 2, "language": "en", "bias_profile": "Qatar-funded. Direct conflict of interest for Egypt and UAE analysis. Use for on-ground access and non-state actor perspectives only. Never use as neutral baseline for Egypt or UAE analysis.", "requires_attribution": True},
    {"url": "https://feeds.bbci.co.uk/news/world/rss.xml",                                            "source_name": "BBC World",             "source_type": "broadcast",  "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",                                "source_name": "BBC Middle East",       "source_type": "broadcast",  "region": "MENA",    "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://www.france24.com/en/rss",                                                        "source_name": "France24",              "source_type": "broadcast",  "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://www.middleeasteye.net/rss",                                                      "source_name": "Middle East Eye",       "source_type": "broadcast",  "region": "MENA",    "country": None, "lat": None, "lng": None, "source_perspective": "western", "source_tier": 2, "language": "en", "bias_profile": "Pro-Muslim Brotherhood lean creates direct conflict of interest for Egypt coverage. Retain Tier 2 for Gaza and Lebanon coverage only. Tier 3 for any Egypt-specific analysis.", "requires_attribution": True},
    {"url": "https://english.alarabiya.net/rss.xml",                                                  "source_name": "Al Arabiya",            "source_type": "broadcast",  "region": "MENA",    "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://oilprice.com/rss/main",                                                          "source_name": "OilPrice.com",          "source_type": "financial",  "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://warontherocks.com/feed/",                                                        "source_name": "War on the Rocks",      "source_type": "think_tank", "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://breakingdefense.com/feed/",                                                      "source_name": "Breaking Defense",      "source_type": "military",   "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://foreignpolicy.com/feed/",                                                        "source_name": "Foreign Policy",        "source_type": "think_tank", "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml",             "source_name": "UN News — MENA",        "source_type": "official",   "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "neutral"},
    {"url": "https://www.ft.com/rss/home",                                                            "source_name": "Financial Times",       "source_type": "financial",  "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western", "source_tier": 1, "language": "en", "bias_profile": "Conditional Tier 1 for economic and energy analysis only. Strongest English-language source for oil markets, Suez economics, UAE trade, and EGP/FX dynamics.", "requires_attribution": False},
    {"url": "https://www.defensenews.com/rss/",                                                       "source_name": "Defense News",          "source_type": "military",   "region": "Global",  "country": None, "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://www.al-monitor.com/rss",                                                         "source_name": "Al-Monitor",            "source_type": "think_tank", "region": "MENA",    "country": "International", "lat": None, "lng": None, "source_perspective": "western", "source_tier": 2, "language": "en", "bias_profile": "Balanced MENA coverage, strong on diplomacy and political economy.", "requires_attribution": True},
    {"url": "https://www.middleeastmonitor.com/feed/",                                                "source_name": "Middle East Monitor",  "source_type": "regional",   "region": "MENA",    "country": "International", "lat": None, "lng": None, "source_perspective": "western"},
    {"url": "https://arabic.rt.com/rss/",                                                             "source_name": "RT Arabic",             "source_type": "broadcast",  "region": "MENA",    "country": None, "lat": None, "lng": None, "source_perspective": "russian"},
    {"url": "https://www.aljazeera.net/rss.xml",                                                      "source_name": "Al Jazeera Arabic",     "source_type": "broadcast",  "region": "MENA",    "country": None, "lat": None, "lng": None, "source_perspective": "arabic"},
    {"url": "https://orient-news.net/en/rss/",                                                        "source_name": "Orient XXI",            "source_type": "think_tank", "region": "MENA",    "country": None, "lat": None, "lng": None, "source_perspective": "arabic"},
    {"url": "https://www.madamasr.com/ar/feed/",                                                      "source_name": "Mada Masr Arabic",     "source_type": "regional",   "region": "Egypt",   "country": "Egypt", "lat": 30.044, "lng": 31.235, "source_perspective": "arabic"},
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
    {"url": "https://en.irna.ir/rss",                                                                 "source_name": "IRNA English",          "source_type": "wire",       "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian", "source_tier": 3, "language": "en", "bias_profile": "Iran state agency. Use for official Iranian government positions only. Label as party source on every citation.", "requires_attribution": True},
    {"url": "https://ifpnews.com/feed",                                                               "source_name": "IFP News",              "source_type": "official",   "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": "https://www.presstv.ir/rss",                                                             "source_name": "PressTV",               "source_type": "broadcast",  "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": "https://en.mehrnews.com/rss",                                                            "source_name": "Mehr News",             "source_type": "wire",       "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": "https://www.tasnimnews.com/en/rss",                                                      "source_name": "Tasnim News",           "source_type": "wire",       "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": "https://www.farsnews.ir/rss",                                                            "source_name": "Fars News (IRGC-linked)", "source_type": "wire",     "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": "https://en.isna.ir/rss",                                                                 "source_name": "ISNA (Iran Students)",  "source_type": "wire",       "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": telegram_rss("IranPresidency"),                                                           "source_name": "Iran Presidency (Telegram)", "source_type": "official", "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    # Elite Telegram
    {"url": telegram_rss("khamenei_ir"),                                                              "source_name": "Khamenei (Telegram)",   "source_type": "elite",      "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": telegram_rss("IranMFA_English"),                                                          "source_name": "Iran MFA (Telegram)",   "source_type": "official",   "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": telegram_rss("IranIntlTv"),                                                               "source_name": "Iran International (Telegram)", "source_type": "broadcast", "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
    {"url": telegram_rss("IRIBWorldService"),                                                         "source_name": "IRIB World (Telegram)", "source_type": "broadcast",  "region": "Iran", "country": "Iran", "lat": 35.689, "lng": 51.388, "source_perspective": "iranian"},
]

# ─────────────────────────────────────────────
# ISRAEL
# ─────────────────────────────────────────────
ISRAEL = [
    {"url": "https://www.haaretz.com/cmlink/1.628765",                                                "source_name": "Haaretz English",      "source_type": "regional",   "region": "Israel", "country": "Israel", "lat": 31.769, "lng": 35.216, "source_tier": 2, "language": "en", "bias_profile": "Israeli left-liberal. Use for internal Israeli political dynamics and civil society. Note editorial lean.", "requires_attribution": True},
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
    {"url": "https://news.google.com/rss/search?q=site:english.aawsat.com&hl=en-US&gl=US&ceid=US:en","source_name": "Asharq Al-Awsat",       "source_type": "elite",      "region": "GCC", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
    {"url": "https://www.arabnews.com/rss.xml",                                                       "source_name": "Arab News (Saudi)",     "source_type": "regional",   "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722, "source_tier": 2, "language": "en", "bias_profile": "Saudi pro-government. Use for Saudi official positions and Gulf business signals. Frame as government-aligned.", "requires_attribution": True},
    {"url": "https://saudigazette.com.sa/feed/",                                                      "source_name": "Saudi Gazette",         "source_type": "regional",   "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
    {"url": telegram_rss("spagov"),                                                                   "source_name": "Saudi Press Agency (Telegram)", "source_type": "wire", "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
    {"url": telegram_rss("MBSofficial"),                                                              "source_name": "MBS Office (Telegram)", "source_type": "elite",      "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
    {"url": telegram_rss("SaudiMFA"),                                                                 "source_name": "Saudi MFA (Telegram)",  "source_type": "official",   "region": "Gulf", "country": "Saudi Arabia", "lat": 24.688, "lng": 46.722},
]

# ─────────────────────────────────────────────
# UAE
# ─────────────────────────────────────────────
UAE = [
    {"url": "https://www.thenationalnews.com/rss",                                                    "source_name": "The National (UAE)",    "source_type": "regional",   "region": "Gulf", "country": "UAE", "lat": 24.453, "lng": 54.377, "source_tier": 2, "language": "en", "bias_profile": "UAE pro-government. Essential for UAE official signals and business sentiment. Frame as government-aligned.", "requires_attribution": True},
    {"url": "https://gulfnews.com/rss",                                                               "source_name": "Gulf News",             "source_type": "regional",   "region": "Gulf", "country": "UAE", "lat": 25.204, "lng": 55.270},
    {"url": "https://www.khaleejtimes.com/feed",                                                      "source_name": "Khaleej Times",         "source_type": "regional",   "region": "Gulf", "country": "UAE", "lat": 25.204, "lng": 55.270},
    {"url": telegram_rss("MOFAUAE"),                                                                  "source_name": "UAE MFA (Telegram)",    "source_type": "official",   "region": "Gulf", "country": "UAE", "lat": 24.453, "lng": 54.377},
    {"url": telegram_rss("HamdanMohammed"),                                                           "source_name": "Sheikh Hamdan (Telegram)", "source_type": "elite",   "region": "Gulf", "country": "UAE", "lat": 25.204, "lng": 55.270},
]

# ─────────────────────────────────────────────
# KUWAIT / OMAN / BAHRAIN (GCC)
# ─────────────────────────────────────────────
KUWAIT_OMAN_BAHRAIN = [
    {"url": "https://www.kuna.net.kw/ArticleRss.aspx",                                                "source_name": "KUNA (Kuwait)",        "source_type": "wire",       "region": "Gulf", "country": "Kuwait", "lat": 29.375, "lng": 47.977},
    {"url": "https://www.omanobserver.com/feed/",                                                     "source_name": "Oman Observer",        "source_type": "regional",   "region": "Gulf", "country": "Oman", "lat": 23.588, "lng": 58.382},
    {"url": "https://www.bna.bh/en/rss/",                                                             "source_name": "BNA (Bahrain)",        "source_type": "wire",       "region": "Gulf", "country": "Bahrain", "lat": 26.066, "lng": 50.557},
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
    {"url": "https://www.kurdistan24.net/en/rss.xml",                                                 "source_name": "Kurdistan 24",          "source_type": "regional",   "region": "Iraq", "country": "Iraq", "lat": 36.190, "lng": 44.009, "source_perspective": "western"},
    {"url": telegram_rss("IraqiPMO"),                                                                 "source_name": "Iraqi PMO (Telegram)",  "source_type": "official",   "region": "Iraq", "country": "Iraq", "lat": 33.340, "lng": 44.400, "source_perspective": "western"},
    {"url": telegram_rss("KataiebHezbollah"),                                                         "source_name": "Kata'ib Hezbollah (Telegram)", "source_type": "military", "region": "Iraq", "country": "Iraq", "lat": 33.340, "lng": 44.400, "source_perspective": "resistance"},
    {"url": telegram_rss("PMFofficial"),                                                              "source_name": "PMF Official (Telegram)","source_type": "military",   "region": "Iraq", "country": "Iraq", "lat": 33.340, "lng": 44.400, "source_perspective": "resistance"},
]

# ─────────────────────────────────────────────
# YEMEN / HOUTHIS
# ─────────────────────────────────────────────
YEMEN = [
    {"url": "https://www.yemenmonitor.com/feed/",                                                     "source_name": "Yemen Monitor",         "source_type": "regional",   "region": "Yemen", "country": "Yemen", "lat": 15.355, "lng": 44.207, "source_perspective": "western"},
    {"url": telegram_rss("ansarallah1"),                                                              "source_name": "Ansarallah (Houthi Telegram)", "source_type": "military", "region": "Yemen", "country": "Yemen", "lat": 15.355, "lng": 44.207, "source_perspective": "resistance"},
    {"url": telegram_rss("almasiranews"),                                                             "source_name": "Al-Masirah TV (Telegram)","source_type": "broadcast", "region": "Yemen", "country": "Yemen", "lat": 15.355, "lng": 44.207, "source_perspective": "resistance"},
    {"url": telegram_rss("MohammedAlHouthi"),                                                         "source_name": "M. Al-Houthi (Telegram)","source_type": "elite",     "region": "Yemen", "country": "Yemen", "lat": 15.355, "lng": 44.207, "source_perspective": "resistance"},
]

# ─────────────────────────────────────────────
# LEBANON / HEZBOLLAH
# ─────────────────────────────────────────────
LEBANON = [
    {"url": "https://www.naharnet.com/stories/en/rss",                                                "source_name": "Naharnet (Lebanon)",    "source_type": "regional",   "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495, "source_perspective": "western"},
    {"url": "https://english.now-news.com/feed/",                                                     "source_name": "NOW Lebanon",           "source_type": "regional",   "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495, "source_perspective": "western"},
    {"url": "https://today.lorientlejour.com/feed/",                                                   "source_name": "L'Orient Today",        "source_type": "regional",   "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495, "source_perspective": "western"},
    {"url": telegram_rss("almanarnews"),                                                              "source_name": "Al-Manar / Hezbollah (Telegram)", "source_type": "military", "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495, "source_perspective": "resistance"},
    {"url": telegram_rss("NabihBerri"),                                                               "source_name": "Nabih Berri (Telegram)","source_type": "elite",      "region": "Lebanon", "country": "Lebanon", "lat": 33.888, "lng": 35.495, "source_perspective": "western"},
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
    {"url": "https://www.madamasr.com/en/feed/",                                                      "source_name": "Mada Masr",             "source_type": "regional",   "region": "Egypt", "country": "Egypt", "lat": 30.044, "lng": 31.235, "source_tier": 2, "language": "en", "bias_profile": "Egypt independent press. Critical of government, reliable on civil society and political economy. Use with attribution.", "requires_attribution": True},
    {"url": "http://english.ahram.org.eg/rss",                                                        "source_name": "Al-Ahram English",      "source_type": "regional",   "region": "Egypt", "country": "Egypt", "lat": 30.044, "lng": 31.235, "source_tier": 3, "language": "en", "bias_profile": "Egypt state media. Use for Egyptian official positions only. Never cite as independent source.", "requires_attribution": True},
    {"url": telegram_rss("AlsisiOfficial"),                                                           "source_name": "Sisi Office (Telegram)","source_type": "elite",      "region": "Egypt", "country": "Egypt", "lat": 30.044, "lng": 31.235},
    {"url": telegram_rss("EgyMFA"),                                                                   "source_name": "Egypt MFA (Telegram)",  "source_type": "official",   "region": "Egypt", "country": "Egypt", "lat": 30.044, "lng": 31.235},
]

# ─────────────────────────────────────────────
# JORDAN (Jordan Times direct RSS returns 403 — use Google News aggregate)
# ─────────────────────────────────────────────
JORDAN = [
    {"url": "https://news.google.com/rss/search?q=site:jordantimes.com&hl=en-US&gl=US&ceid=US:en",    "source_name": "Jordan Times",          "source_type": "regional",   "region": "Levant", "country": "Jordan", "lat": 31.963, "lng": 35.930},
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
# HORN OF AFRICA & RED SEA — theatre added 2026-10-07 (ruling by Omar)
# Ethiopia's 2026 offensive vs TPLF/Fano/OLA, the Ethiopia-Eritrea rupture, the
# Egypt-Eritrea-Somalia-Sudan "Red Sea for coastal states" declaration (New Alamein 2026-10-04).
#
# Every URL below was fetched from the build container on 2026-10-07 and returned a parseable
# feed with items dated within the last ~3 weeks (see the PR for the per-feed check). Feeds that
# failed (Cloudflare / SiteGround captcha, 404, hijacked domain) are NOT listed here.
#
# Flags (same convention as the other groups, DECISION-002):
#   source_tier 2 + party_source False  -> independent / specialist outlet, use with attribution
#   source_tier 3 + party_source True   -> state / ruling-party-affiliated: valid for what a
#                                          government SAYS, never as evidence of fact or of
#                                          public opinion; label as party source on every citation
#   "domain_scope": "feed"              -> the feed is one country slice of a multi-country site
#                                          (ReliefWeb); backfill_gdelt_index must not stamp every
#                                          article of that domain with this feed's country
#   "fetch": "requests"                 -> fetched with requests (20 s timeout) instead of
#                                          feedparser's timeout-less fetch, so one slow African
#                                          host cannot stall the hourly job
# region is the article label 'Horn of Africa' (articles.country holds REGION-style labels, see
# CLAUDE.md); `country` is the covered country's name, which lib/utils.countryCodeFromValue maps.
# ─────────────────────────────────────────────
HORN_REGION = "Horn of Africa"
_HORN_FETCH = {"fetch": "requests"}

HORN_OF_AFRICA = [
    # ── Ethiopia ──
    {"url": "https://www.ethiopia-insight.com/feed/",                  "source_name": "Ethiopia Insight",      "source_type": "think_tank", "region": HORN_REGION, "country": "Ethiopia", "lat": 9.030, "lng": 38.740,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Independent Ethiopia-focused analysis and commentary site; pieces are signed and carry the authors' views. Use with attribution.", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://www.fanamc.com/english/feed/",                    "source_name": "Fana Media Corporation (Ethiopia)", "source_type": "state_media", "region": HORN_REGION, "country": "Ethiopia", "lat": 9.030, "lng": 38.740,
     "source_tier": 3, "language": "en", "party_source": True, "bias_profile": "Ethiopian state-affiliated broadcaster (operator ruling 2026-10-07: party source). Use for the Ethiopian government's stated positions only; never as an independent source or for facts on the war. Label as party source on every citation.", "requires_attribution": True, **_HORN_FETCH},
    # ── Eritrea ──
    {"url": "https://awate.com/feed/",                                 "source_name": "Awate (Eritrea diaspora)", "source_type": "regional", "region": HORN_REGION, "country": "Eritrea", "lat": 15.323, "lng": 38.925,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "US-based Eritrean diaspora site, editorially critical of the Eritrean government (Wikipedia, Awate). Partisan against the government: not a neutral baseline; pair with official Eritrean framing, which no working feed provides (Shabait is captcha-blocked).", "requires_attribution": True, **_HORN_FETCH},
    # ── Sudan ──
    {"url": "https://www.dabangasudan.org/en/feed",                    "source_name": "Radio Dabanga (EN)",    "source_type": "regional",   "region": HORN_REGION, "country": "Sudan", "lat": 15.500, "lng": 32.560,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Netherlands-based Sudan-focused outlet, independent of the Sudanese government (Wikipedia, Radio Dabanga). Use with attribution.", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://www.dabangasudan.org/ar/feed",                    "source_name": "Radio Dabanga (AR)",    "source_type": "regional",   "region": HORN_REGION, "country": "Sudan", "lat": 15.500, "lng": 32.560, "source_perspective": "arabic",
     "source_tier": 2, "language": "ar", "party_source": False, "bias_profile": "Arabic edition of Radio Dabanga (see English entry).", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://sudantribune.net/feed",                           "source_name": "Sudan Tribune (AR)",    "source_type": "regional",   "region": HORN_REGION, "country": "Sudan", "lat": 15.500, "lng": 32.560, "source_perspective": "arabic",
     "source_tier": 2, "language": "ar", "party_source": False, "bias_profile": "Arabic edition of Sudan Tribune, a Paris-based outlet run by independent journalists; MBFC notes reliance on unattributed sources, so corroborate. (The English feed is Cloudflare-blocked.)", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://www.sudanspost.com/feed/",                        "source_name": "Sudans Post (South Sudan)", "source_type": "regional", "region": HORN_REGION, "country": "South Sudan", "lat": 4.859, "lng": 31.571,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "South Sudan outlet (NOT Sudan). Items only enter when they match a Horn keyword other than 'South Sudan'.", "requires_attribution": True, **_HORN_FETCH},
    # ── Somalia / Somaliland ──
    {"url": "https://www.somaliguardian.com/feed/",                    "source_name": "Somali Guardian",       "source_type": "regional",   "region": HORN_REGION, "country": "Somalia", "lat": 2.046, "lng": 45.318,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Independent Somali news site; ownership not disclosed and often critical of the federal government (MBFC). Use with attribution.", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://hiiraan.com/news.xml",                            "source_name": "Hiiraan Online",        "source_type": "regional",   "region": HORN_REGION, "country": "Somalia", "lat": 2.046, "lng": 45.318,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Somali news portal. Use with attribution.", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://hornobserver.com/assets/rss.php?cid=1",           "source_name": "Horn Observer",         "source_type": "regional",   "region": HORN_REGION, "country": "Somalia", "lat": 2.046, "lng": 45.318,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Horn of Africa news site; this is its cid=1 feed (items seen are Somalia-focused). Ownership not verified.", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://sonna.so/en/rss.xml",                             "source_name": "SONNA (Somali National News Agency)", "source_type": "wire", "region": HORN_REGION, "country": "Somalia", "lat": 2.046, "lng": 45.318,
     "source_tier": 3, "language": "en", "party_source": True, "bias_profile": "Somali federal government news agency. Use for the federal government's stated positions only; never as an independent source. Label as party source on every citation.", "requires_attribution": True, **_HORN_FETCH},
    # ── Regional / international ──
    {"url": "https://www.africanews.com/feed/rss",                     "source_name": "Africanews",            "source_type": "broadcast",  "region": "Africa", "country": None, "lat": None, "lng": None,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Pan-African news channel; whole-Africa feed, so only keyword-matching items are kept.", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://www.crisisgroup.org/rss/9",                       "source_name": "Crisis Group - Horn of Africa", "source_type": "think_tank", "region": HORN_REGION, "country": None, "lat": None, "lng": None,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Independent conflict-prevention NGO; analysis, not breaking news. Its RSS pubDate is non-standard ('Friday, September 18, 2026 - 15:17').", "requires_attribution": False, **_HORN_FETCH},
    {"url": "https://www.crisisgroup.org/rss/116",                     "source_name": "Crisis Group - Ethiopia", "source_type": "think_tank", "region": HORN_REGION, "country": "Ethiopia", "lat": 9.030, "lng": 38.740,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Independent conflict-prevention NGO (see Horn of Africa entry).", "requires_attribution": False, **_HORN_FETCH},
    {"url": "https://www.crisisgroup.org/rss/10",                      "source_name": "Crisis Group - Eritrea", "source_type": "think_tank", "region": HORN_REGION, "country": "Eritrea", "lat": 15.323, "lng": 38.925,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Independent conflict-prevention NGO (see Horn of Africa entry).", "requires_attribution": False, **_HORN_FETCH},
    {"url": "https://www.crisisgroup.org/rss/12",                      "source_name": "Crisis Group - Somalia", "source_type": "think_tank", "region": HORN_REGION, "country": "Somalia", "lat": 2.046, "lng": 45.318,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Independent conflict-prevention NGO (see Horn of Africa entry).", "requires_attribution": False, **_HORN_FETCH},
    {"url": "https://www.crisisgroup.org/rss/14",                      "source_name": "Crisis Group - Sudan",  "source_type": "think_tank", "region": HORN_REGION, "country": "Sudan", "lat": 15.500, "lng": 32.560,
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "Independent conflict-prevention NGO (see Horn of Africa entry).", "requires_attribution": False, **_HORN_FETCH},
    {"url": "https://reliefweb.int/updates/rss.xml?legacy-river=country/eth", "source_name": "ReliefWeb - Ethiopia", "source_type": "official", "region": HORN_REGION, "country": "Ethiopia", "lat": 9.030, "lng": 38.740, "source_perspective": "neutral", "domain_scope": "feed",
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "UN OCHA humanitarian reporting service; republishes UN/NGO/government documents, each with its own author. Humanitarian, not political, framing.", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://reliefweb.int/updates/rss.xml?legacy-river=country/eri", "source_name": "ReliefWeb - Eritrea", "source_type": "official", "region": HORN_REGION, "country": "Eritrea", "lat": 15.323, "lng": 38.925, "source_perspective": "neutral", "domain_scope": "feed",
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "UN OCHA humanitarian reporting service (see Ethiopia entry).", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://reliefweb.int/updates/rss.xml?legacy-river=country/sdn", "source_name": "ReliefWeb - Sudan", "source_type": "official", "region": HORN_REGION, "country": "Sudan", "lat": 15.500, "lng": 32.560, "source_perspective": "neutral", "domain_scope": "feed",
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "UN OCHA humanitarian reporting service (see Ethiopia entry).", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://reliefweb.int/updates/rss.xml?legacy-river=country/som", "source_name": "ReliefWeb - Somalia", "source_type": "official", "region": HORN_REGION, "country": "Somalia", "lat": 2.046, "lng": 45.318, "source_perspective": "neutral", "domain_scope": "feed",
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "UN OCHA humanitarian reporting service (see Ethiopia entry).", "requires_attribution": True, **_HORN_FETCH},
    {"url": "https://reliefweb.int/updates/rss.xml?legacy-river=country/dji", "source_name": "ReliefWeb - Djibouti", "source_type": "official", "region": HORN_REGION, "country": "Djibouti", "lat": 11.588, "lng": 43.145, "source_perspective": "neutral", "domain_scope": "feed",
     "source_tier": 2, "language": "en", "party_source": False, "bias_profile": "UN OCHA humanitarian reporting service (see Ethiopia entry).", "requires_attribution": True, **_HORN_FETCH},
]

# ── TELEGRAM CHANNELS (scraped via t.me/s/{handle}, no RSS) ─────────
# party_source=True = requires independent corroboration before CONFIRMED in disinformation_tracker.
TELEGRAM_CHANNELS = [
    {
        "handle": "rybar",
        "display_name": "Rybar (Russian)",
        "url": "https://t.me/s/rybar",
        "source_perspective": "russian",
        "source_type": "milblog",
        "country": "RU",
        "region": "Russia",
        "language": "ru",
        "party_source": True,
        "party_note": "Pro-Kremlin milblog. US DOJ Oct 2024 flagged as Russian disinfo org. Cited by BBC/NYT/ISW. All claims require independent corroboration.",
        "active": True,
    },
    {
        "handle": "rybar_in_english",
        "display_name": "Rybar (English)",
        "url": "https://t.me/s/rybar_in_english",
        "source_perspective": "russian",
        "source_type": "milblog",
        "country": "RU",
        "region": "Russia",
        "language": "en",
        "party_source": True,
        "party_note": "English mirror of Rybar. Same caveats apply.",
        "active": True,
    },
    {
        "handle": "intelslava",
        "display_name": "Intel Slava",
        "url": "https://t.me/s/intelslava",
        "source_perspective": "russian",
        "source_type": "aggregator",
        "country": "RU",
        "region": "Russia",
        "language": "en",
        "party_source": True,
        "party_note": "Pro-Russian news aggregator. Some databases allege state funding — unverified. Treat as party source.",
        "active": True,
    },
    {
        "handle": "ourwarstoday",
        "display_name": "Our Wars Today",
        "url": "https://t.me/s/ourwarstoday",
        "source_perspective": "neutral",
        "source_type": "aggregator",
        "country": "INTL",
        "region": "Global",
        "language": "en",
        "party_source": False,
        "party_note": None,
        "active": True,
    },
    # الروائي — PENDING OMAR CONFIRMATION OF EXACT HANDLE
    # Uncomment and update handle once confirmed:
    # {"handle": "REPLACE_WITH_REAL_HANDLE", "display_name": "الروائي", "url": "https://t.me/s/REPLACE_WITH_REAL_HANDLE",
    #  "source_perspective": "resistance", "source_type": "milblog", "country": "AR", "region": "MENA", "language": "ar",
    #  "party_source": True, "party_note": "Arabic military/geopolitical analysis. Resistance-axis perspective.", "active": True},
]

# ── CHINESE-PLATFORM RSS SOURCES ────────────────────────────────────
# Weibo/WeChat require auth; use English/RSS versions. source_perspective = 'chinese'. Party sources = CCP-affiliated.
CHINESE_RSS_SOURCES = [
    {"url": "http://www.xinhuanet.com/english/rss/worldrss.xml", "source_name": "Xinhua News (English)", "source_type": "state_media", "region": "China", "country": "China", "lat": 39.904, "lng": 116.407, "source_perspective": "chinese"},
    {"url": "https://newsrss.cgtn.com/news/3d3d514f32677a4d/rss.xml", "source_name": "CGTN (China Global Television)", "source_type": "state_media", "region": "China", "country": "China", "lat": 39.904, "lng": 116.407, "source_perspective": "chinese"},
    {"url": "http://en.people.cn/rss/90002.xml", "source_name": "People's Daily (English)", "source_type": "state_media", "region": "China", "country": "China", "lat": 39.904, "lng": 116.407, "source_perspective": "chinese"},
    {"url": "https://www.guancha.cn/rss.xml", "source_name": "Guancha.cn (Observer Net)", "source_type": "commentary", "region": "China", "country": "China", "lat": 39.904, "lng": 116.407, "source_perspective": "chinese"},
]

# ─────────────────────────────────────────────
# CONFLICT MONITORS & OSINT
# ─────────────────────────────────────────────
CONFLICT_MONITORS = [
    {"url": "https://understandingwar.org/rss.xml",                                                   "source_name": "ISW (Understandingwar)", "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
    {"url": "https://acleddata.com/feed/",                                                            "source_name": "ACLED",                 "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
    {"url": "https://www.crisisgroup.org/feed",                                                       "source_name": "ICG (Crisis Group)",   "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
    {"url": "https://www.cfr.org/rss",                                                                "source_name": "CFR (Council on Foreign Relations)", "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
    {"url": "https://www.csis.org/feed",                                                              "source_name": "CSIS",                  "source_type": "think_tank", "region": "Global", "country": None, "lat": None, "lng": None},
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
# MASTER LIST (RSS feeds; Telegram channels are scraped separately via TELEGRAM_CHANNELS)
# ─────────────────────────────────────────────
ALL_SOURCES = (
    INTERNATIONAL + USA + IRAN + ISRAEL + SAUDI + UAE + KUWAIT_OMAN_BAHRAIN + QATAR
    + IRAQ + YEMEN + LEBANON + TURKEY + EGYPT + JORDAN + SYRIA
    + RUSSIA + CHINA + PAKISTAN + INDIA + CONFLICT_MONITORS
    + CHINESE_RSS_SOURCES + HORN_OF_AFRICA
)

# Named feed groups, for `collect_feeds.py --group NAME`.
FEED_GROUPS = {"horn": HORN_OF_AFRICA}

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

# ── HORN OF AFRICA & RED SEA keywords (theatre added 2026-10-07) ─────────────────────────
# Two lists, because a handful of the requested terms are ordinary words or names elsewhere:
#   afar   "watched from afar"            fano   Italian city / surname     isaias  a given name (and a 2020 storm)
#   rsf    Reporters Without Borders      burhan a common given name        somali  Somali diaspora crime/sport stories
#   عصب    "nerve" (medical)              البرهان  "the proof"
# HORN_KEYWORDS are unambiguous: they are appended to CONFLICT_KEYWORDS and admit an item on
# their own. HORN_AMBIGUOUS_KEYWORDS are NOT in CONFLICT_KEYWORDS: they only count when the
# geography is already established (collect_feeds: the feed is a Horn-of-Africa feed;
# backfill_gdelt_index: GDELT tags a Horn country as a location - same rule as LOOSE_KEYWORDS).
# Matching is whole-word everywhere new (collect_feeds.is_relevant keeps its legacy substring
# test for the legacy keywords above only). Arabic terms accept the usual one-letter proclitics
# (و ف ب ل ك and ال), e.g. والسودان, للسودان, بإثيوبيا.
HORN_KEYWORDS = [
    "ethiopia", "ethiopian", "eritrea", "eritrean", "tigray", "tigrayan", "tplf",
    "abiy", "assab", "massawa", "djibouti", "djiboutian", "somaliland", "berbera", "somalia",
    "al-shabaab", "al shabaab", "al-shabab", "al shabab",
    "sudan", "sudanese", "port sudan", "rapid support forces", "rapid support force",
    "horn of africa", "red sea access",
    "isaias afwerki", "oromo liberation army", "tigray people's liberation front",
    "amhara", "mekelle", "addis ababa", "khartoum", "mogadishu", "asmara",
    # Arabic (the Arabic names of the countries and places above)
    "إثيوبيا", "اثيوبيا", "أثيوبيا", "إريتريا", "اريتريا", "أريتريا",
    "إثيوبي", "اثيوبي", "إريتري", "اريتري",
    "تيغراي", "تيجراي", "الصومال", "السودان", "جيبوتي",
    "أبي أحمد", "ابي احمد", "الدعم السريع", "عبد الفتاح البرهان",
    "أرض الصومال", "ارض الصومال", "الخرطوم", "مقديشو", "أسمرة", "اسمرة", "بورتسودان",
]
HORN_AMBIGUOUS_KEYWORDS = [
    "fano", "isaias", "afar", "rsf", "burhan", "somali",
    "عصب", "البرهان",
]
CONFLICT_KEYWORDS = CONFLICT_KEYWORDS + HORN_KEYWORDS

# Phrases removed from the text BEFORE the Horn keywords are tested.
#   "South Sudan" is a different country (GDELT FIPS OD, not SU) whose stories would otherwise all
#   match "sudan" (Sudans Post is a South Sudan outlet). "from afar" is the English idiom.
HORN_TEXT_EXCLUSIONS = ["south sudan", "south sudanese", "southern sudan", "from afar", "جنوب السودان", "جنوب سودان"]

# ── Whole-word keyword matching helpers (shared by collect_feeds and backfill_gdelt_index) ──
_ARABIC_CHARS = re.compile("[\u0600-\u06FF]")
# One-letter Arabic proclitics (and / so / with / to / like) with or without the article; "لل" is
# ل + ال fused, e.g. للسودان "to Sudan".
_AR_PROCLITICS = ("", "ال", "و", "وال", "ف", "فال", "ب", "بال", "ل", "لل", "ولل", "ك", "كال")
# Latin endings tolerated after a keyword: iran -> iranian, houthi -> houthis, eritrea -> eritrean
LATIN_SUFFIX = r"(?:s|es|i|is|ian|ians|n|'s|’s)?"
# Arabic ending for the nisba / plural: سودان -> سوداني, السودانيين
_AR_SUFFIX = "(?:ي|ين|يين|ون|ية)?"


def keyword_regex(words) -> "re.Pattern":
    """Compile a whole-word, case-insensitive pattern for `words`.

    Latin keywords: word boundaries on both sides, an optional plural/demonym ending, spaces and
    hyphens inside a phrase interchangeable. Arabic keywords: word boundaries plus the optional
    proclitics above (a leading ال in the keyword is treated as the article, not part of the stem).
    """
    latin, arabic = [], []
    for kw in sorted({w.strip().lower() for w in words if w and w.strip()}, key=lambda w: (-len(w), w)):
        if _ARABIC_CHARS.search(kw):
            stem = kw[2:] if kw.startswith("ال") and len(kw.split()[0]) > 3 else kw
            arabic.append(r"\s+".join(re.escape(p) for p in stem.split()))
        else:
            latin.append(r"[\s\-]+".join(re.escape(p) for p in kw.split()))
    parts = []
    if latin:
        parts.append("(?:" + "|".join(latin) + ")" + LATIN_SUFFIX)
    if arabic:
        parts.append("(?:" + "|".join(re.escape(p) for p in sorted(_AR_PROCLITICS, key=len, reverse=True)) + ")"
                     + "(?:" + "|".join(arabic) + ")" + _AR_SUFFIX)
    if not parts:
        return re.compile(r"(?!x)x")  # matches nothing
    return re.compile(r"(?<!\w)(?:" + "|".join(parts) + r")(?!\w)", re.I)


def _exclusion_alt(phrase: str) -> str:
    body = re.escape(phrase)
    return body + (_AR_SUFFIX if _ARABIC_CHARS.search(phrase) else "")


_HORN_EXCLUSION_RE = re.compile(
    "|".join(r"(?<!\w)" + _exclusion_alt(x) + r"(?!\w)" for x in sorted(HORN_TEXT_EXCLUSIONS, key=len, reverse=True)),
    re.I)


# WordPress feeds append "The post <title> appeared first on <Site name>." to every summary, so a
# site called "Sudans Post" would make every one of its items match "sudan".
_FEED_BOILERPLATE_RE = re.compile(r"the post\b.*?\bappeared first on\b[^.\n]*\.?", re.I | re.S)


def strip_horn_exclusions(text: str) -> str:
    """Remove text that contains a Horn keyword without being about the Horn: the phrases in
    HORN_TEXT_EXCLUSIONS ('South Sudan', 'from afar') and WordPress 'appeared first on <site>' tails."""
    return _HORN_EXCLUSION_RE.sub(" ", _FEED_BOILERPLATE_RE.sub(" ", text or ""))


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
