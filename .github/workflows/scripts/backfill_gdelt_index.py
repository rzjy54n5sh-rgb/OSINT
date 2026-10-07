"""
backfill_gdelt_index.py - rebuild the lost news-link index (conflict Days 1-220) from GDELT 2.0 GKG files.

Why: the 90-day cleanup job deleted the Mar-Aug `articles` history (CLAUDE.md, Gotchas). GDELT's raw
Global Knowledge Graph files hold title + URL + outlet + time + mentioned places for every article
GDELT saw, in one 15-minute file per slot, free and keyless:
    https://data.gdeltproject.org/gdeltv2/YYYYMMDDHHMMSS.gkg.csv.zip              (English)
    https://data.gdeltproject.org/gdeltv2/YYYYMMDDHHMMSS.translation.gkg.csv.zip  (machine-translated)
Terms: free reuse with a citation of The GDELT Project and a link to https://www.gdeltproject.org/
(the Feed page carries that credit). Only headline metadata is stored, never article text.

Deterministic, no model / AI API anywhere. Writes to the existing `articles` table:
  * id            = collect_feeds.url_to_id(url)  (md5 of the raw URL), so a URL the live collector
                    already stored is skipped by `Prefer: resolution=ignore-duplicates`
  * title         = <PAGE_TITLE> verbatim (HTML entities decoded)
  * source_name   = outlet domain as GDELT gives it; source_type = 'gdelt-gkg'; summary = NULL
  * published_at  = <PAGE_PRECISEPUBTIMESTAMP> (UTC) when present and not later than first-seen,
                    else the 15-minute first-seen slot; content_json.time records which
  * conflict_day  = (UTC date - 2026-02-28) + 1, never a future day, never a Day-1 fallback
  * region/country= registry entry for registry outlets (collect_feeds convention), else the
                    outlet's country-code TLD for the countries the registry knows, else NULL
  * is_retrospective = true (operator ruling 2026-09-17: gap-day backfill is labelled retrospective)

Day ownership: Day D reads every slot of its UTC date plus the first --lookahead-hours of D+1, and
keeps only rows whose published_at falls on D. A row therefore belongs to exactly one day's run,
and re-runs select the same rows (stable sort keys everywhere, independent of download order).

Caps per conflict day (keeps the 500 MB free DB tier safe): <= 500 English + <= 100 non-English.
Horn of Africa & Red Sea theatre (ruling 2026-10-07): ET, ER, SU (Sudan), SO, DJ are regional
locations and the Horn keywords are in scope, but Horn rows may take at most HORN_SHARE (25%) of a
day's cap, so the Iran-war rows are never crowded out of a capped day; unused room is filled by
leftover Horn rows, so the cap itself never grows.
Selection: in-scope rows from registry outlets first (one per normalised title), then other
outlets, one row per normalised title, ranked by how many distinct outlets carried that title.

Usage:
  python backfill_gdelt_index.py --start-day 30 --end-day 30            # dry run (default)
  python backfill_gdelt_index.py --start-day 1 --end-day 10 --write     # needs SUPABASE_URL / SUPABASE_SERVICE_KEY
  python backfill_gdelt_index.py --start-day 1 --end-day 220 --plan 10  # print the Actions matrix
"""

import argparse
import collections
import concurrent.futures
import dataclasses
import datetime
import hashlib
import html
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sources_registry import (  # noqa: E402
    ALL_SOURCES, CONFLICT_KEYWORDS, HORN_AMBIGUOUS_KEYWORDS, HORN_KEYWORDS, NITTER_INSTANCES,
    keyword_regex, strip_horn_exclusions,
)

CONFLICT_START = datetime.date(2026, 2, 28)
GDELT_BASE = "https://data.gdeltproject.org/gdeltv2"
FEED_EN = "gkg.csv"
FEED_TR = "translation.gkg.csv"
USER_AGENT = "mena-intel-desk-backfill/1.0 (+https://github.com/rzjy54n5sh-rgb/OSINT)"
SOURCE_TYPE = "gdelt-gkg"
EN_CAP = 500
NONEN_CAP = 100
BATCH_SIZE = 500
TITLE_MAX = 400
MIN_TITLE_LEN = 12

# Our 20 tracked countries (daily_analysis.COUNTRIES) in GDELT's FIPS 10-4 codes, plus the
# conflict theatre outside that list. Only the regional members define scope: the great powers in
# the 20 (US, RU, CN, GB, FR, DE, IN) appear in most world news and would admit everything.
TRACKED_20_FIPS = {"IR", "US", "IS", "SA", "AE", "IZ", "LE", "YM", "JO", "EG",
                   "TU", "RS", "CH", "UK", "FR", "GM", "QA", "KU", "IN", "PK"}
# Horn of Africa & Red Sea theatre (5 more tracked countries, 25 in all). GDELT uses FIPS 10-4,
# where SUDAN IS "SU" (the ISO code SD is not a FIPS country) and South Sudan is "OD" - left out on
# purpose, it is not one of the five.
HORN_FIPS = {"ET", "ER", "SU", "SO", "DJ"}
REGIONAL_FIPS = {"IR", "IS", "SA", "AE", "IZ", "LE", "YM", "JO", "EG", "TU", "QA", "KU", "PK",
                 "SY", "BA", "MU", "GZ", "WE"} | HORN_FIPS
HORN_SHARE = 0.25  # max fraction of a day's cap that Horn-of-Africa rows may take
# GKG V2Themes tokens that mark conflict / security / energy-shock coverage (substring match).
# KILL and REFUGEES were dropped after the live dry run: with a tracked-country mention they admit
# floods, accidents and local crime (e.g. Punjab flood evacuations, a mountaineer's body).
CONFLICT_THEMES = ("ARMEDCONFLICT", "MILITARY", "TERROR", "CONFLICT_AND_VIOLENCE", "ECON_OILPRICE",
                   "SANCTIONS", "CEASEFIRE", "NUCLEAR", "WMD", "BLOCKADE", "SEIGE", "TAX_WEAPONS")
# CONFLICT_KEYWORDS that are about the war only when the article also mentions the region
# (they hit Ukraine / Taiwan / Korea / markets stories on their own). Every other keyword,
# including any added to the registry later, is "strong" and admits a title by itself.
LOOSE_KEYWORDS = {"oil price", "crude oil", "brent", "wti", "strait", "tanker", "shipping lane",
                  "ceasefire", "escalation", "missile", "drone strike", "nuclear", "enrichment",
                  "ballistic", "world war", "regional war", "us navy", "us military", "pentagon"}
# Horn terms that are ordinary words/names elsewhere (afar, fano, isaias, rsf, burhan, somali, عصب,
# البرهان): loose too - they only count when GDELT tags a Horn/regional location.
LOOSE_KEYWORDS |= {k.strip().lower() for k in HORN_AMBIGUOUS_KEYWORDS}

# FIPS / theme -> tag, using the vocabulary collect_feeds.extract_tags already writes.
FIPS_TAGS = {"IR": "Iran", "IS": "Israel", "YM": "Yemen", "LE": "Lebanon", "SA": "Saudi Arabia",
             "AE": "UAE", "IZ": "Iraq", "RS": "Russia", "CH": "China", "US": "USA",
             "ET": "Ethiopia", "ER": "Eritrea", "SU": "Sudan", "SO": "Somalia", "DJ": "Djibouti"}
THEME_TAGS = (("ECON_OILPRICE", "Energy"), ("NUCLEAR", "Nuclear"), ("WMD", "Nuclear"))

SECOND_LEVEL = {"co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "co.in", "com.cn", "com.sa",
                "net.sa", "org.sa", "gov.sa", "co.ae", "gov.ae", "net.kw", "com.kw", "com.bh",
                "com.om", "com.qa", "com.lb", "com.jo", "com.iq", "com.ye", "com.sy", "com.eg",
                "org.eg", "gov.eg", "com.pk", "com.tr", "org.tr", "gov.tr", "co.il", "org.il",
                "gov.il", "co.ir", "ac.ir", "org.ir", "gov.ir", "com.ru", "com.tw", "co.jp",
                "com.et", "gov.et", "org.et", "com.sd", "gov.sd", "com.so", "gov.so"}
TLD_COUNTRY = {"ir": "Iran", "il": "Israel", "sa": "Saudi Arabia", "ae": "UAE", "kw": "Kuwait",
               "qa": "Qatar", "bh": "Bahrain", "om": "Oman", "iq": "Iraq", "ye": "Yemen",
               "lb": "Lebanon", "tr": "Turkey", "eg": "Egypt", "jo": "Jordan", "sy": "Syria",
               "ru": "Russia", "cn": "China", "pk": "Pakistan", "in": "India",
               "et": "Ethiopia", "er": "Eritrea", "sd": "Sudan", "so": "Somalia", "dj": "Djibouti"}
AGGREGATOR_HOSTS = {"rsshub.app", "t.me", "news.google.com", "feeds.feedburner.com"}
DOMAIN_ALIASES = {"bbci.co.uk": ("bbc.co.uk", "bbc.com"),  # feed host != article host
                  "fanamc.com": ("fanamc.com", "fanabc.com")}  # Fana moved domains; fanabc.com redirects

_TITLE_RE = re.compile(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", re.S)
_PUB_RE = re.compile(r"<PAGE_PRECISEPUBTIMESTAMP>(\d{14})</PAGE_PRECISEPUBTIMESTAMP>")
_LANG_RE = re.compile(r"srclc:([a-z]{2,3})")


# ─────────────────────────────────────────────
# PURE HELPERS
# ─────────────────────────────────────────────

def utc_today() -> datetime.date:
    return datetime.datetime.now(datetime.timezone.utc).date()


def url_to_id(url: str) -> str:
    """Byte-for-byte the same as collect_feeds.url_to_id (tests enforce parity)."""
    h = hashlib.md5(url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def day_date(day: int) -> datetime.date:
    return CONFLICT_START + datetime.timedelta(days=day - 1)


def conflict_day_of(dt: datetime.datetime, today: datetime.date) -> int | None:
    """Conflict day of a naive-UTC datetime. None before the conflict (never Day 1) and None for
    any day after today's UTC day (never a future day)."""
    n = (dt.date() - CONFLICT_START).days + 1
    if n < 1 or n > (today - CONFLICT_START).days + 1:
        return None
    return n


def parse14(s: str) -> datetime.datetime | None:
    try:
        return datetime.datetime.strptime(s.strip(), "%Y%m%d%H%M%S")
    except (ValueError, AttributeError):
        return None


def registered_domain(host: str) -> str:
    h = (host or "").strip().lower().strip(".").split(":")[0]
    if h.startswith("www."):
        h = h[4:]
    parts = h.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in SECOND_LEVEL:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _kw_pattern(words) -> re.Pattern:
    """Whole words, allowing plural / demonym endings: iran->iranian, israel->israeli, houthi->houthis.
    Shared with collect_feeds (sources_registry.keyword_regex), which also handles the Arabic
    Horn keywords (one-letter proclitics such as و ب ل)."""
    return keyword_regex(words)


_KW = [k.strip().lower() for k in list(CONFLICT_KEYWORDS) + list(HORN_AMBIGUOUS_KEYWORDS) if k.strip()]
_STRONG_RE = _kw_pattern([k for k in _KW if k not in LOOSE_KEYWORDS])
_LOOSE_RE = _kw_pattern([k for k in _KW if k in LOOSE_KEYWORDS])
_HORN_SET = {k.strip().lower() for k in HORN_KEYWORDS}
_HORN_RE = _kw_pattern(sorted(_HORN_SET))
# Strong keywords of the Iran/Gulf theatre only (no Horn terms, no loose ones): a title that has
# one of these is counted as that theatre, not as Horn, for the HORN_SHARE quota.
_LEGACY_STRONG_RE = _kw_pattern([k for k in _KW if k not in LOOSE_KEYWORDS and k not in _HORN_SET])


def keyword_hit(text: str) -> str | None:
    """'strong' / 'loose' / None. Word-boundary version of collect_feeds.is_relevant, which uses
    plain substrings ('idf' matches 'midfielder', 'brent' matches 'Brentford')."""
    if not text:
        return None
    text = strip_horn_exclusions(text)  # "South Sudan", "from afar", "appeared first on ..."
    if _STRONG_RE.search(text):
        return "strong"
    if _LOOSE_RE.search(text):
        return "loose"
    return None


def is_horn_rec(rec: "Rec") -> bool:
    """A Horn-of-Africa row for the HORN_SHARE quota: its title names the Horn (or GDELT locates it
    only in the Horn) and it does not also name the Iran/Gulf theatre."""
    text = strip_horn_exclusions(scope_text(rec))
    if _LEGACY_STRONG_RE.search(text):
        return False
    if _HORN_RE.search(text):
        return True
    return bool(rec.fips & HORN_FIPS) and not (rec.fips & (REGIONAL_FIPS - HORN_FIPS))


def normalise_title(title: str) -> str:
    t = html.unescape(title or "")
    if " | " in t:  # "Headline | Outlet name"
        head = t.rsplit(" | ", 1)[0]
        if head.strip():
            t = head
    return re.sub(r"[\W_]+", " ", t.lower()).strip()


def url_slug_text(url: str) -> str:
    path = urllib.parse.urlsplit(url).path
    return re.sub(r"[-_/.+]+", " ", urllib.parse.unquote(path))


# ─────────────────────────────────────────────
# REGISTRY
# ─────────────────────────────────────────────

def _source_domains(src: dict) -> list[str]:
    if src.get("domain_scope") == "feed":  # one country slice of a multi-country site (ReliefWeb)
        return []
    url = src.get("url") or ""
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    if host == "news.google.com":
        m = re.search(r"site:([\w.\-]+)", urllib.parse.unquote(url))
        return [registered_domain(m.group(1))] if m else []
    if host == "feeds.feedburner.com":
        return ["ndtv.com"] if "ndtv" in url else []
    if host in AGGREGATOR_HOSTS or any(i in url for i in NITTER_INSTANCES):
        return []
    rd = registered_domain(host)
    return list(DOMAIN_ALIASES.get(rd, (rd,)))


def build_registry(sources=None) -> dict:
    """Outlet domain -> registry metadata (first registry entry for that domain wins)."""
    reg = {}
    for src in sources if sources is not None else ALL_SOURCES:
        for d in _source_domains(src):
            if d and d not in reg:
                reg[d] = {k: src.get(k) for k in ("source_name", "region", "country", "source_perspective")}
    return reg


def _region_for_country(sources=None) -> dict:
    """Country name -> its most common region label in the registry (ties: first seen)."""
    counts: dict[str, collections.Counter] = {}
    order: dict[str, list] = {}
    for src in sources if sources is not None else ALL_SOURCES:
        c, r = src.get("country"), src.get("region")
        if c and r:
            counts.setdefault(c, collections.Counter())[r] += 1
            order.setdefault(c, [])
            if r not in order[c]:
                order[c].append(r)
    return {c: max(order[c], key=lambda r: (counts[c][r], -order[c].index(r))) for c in counts}


REGION_FOR_COUNTRY = _region_for_country()


def outlet_origin(domain_key: str, registry: dict) -> tuple:
    meta = registry.get(domain_key)
    if meta:
        return meta.get("region"), meta.get("country")
    country = TLD_COUNTRY.get(domain_key.rsplit(".", 1)[-1])
    if country:
        return REGION_FOR_COUNTRY.get(country), country
    return None, None


# ─────────────────────────────────────────────
# GKG PARSING
# ─────────────────────────────────────────────

@dataclasses.dataclass(frozen=True)
class Rec:
    gkg_id: str
    first_seen: datetime.datetime
    domain: str          # SourceCommonName, as GDELT gives it
    reg_key: str         # registered domain, for registry matching
    url: str
    title: str
    page_pub: datetime.datetime | None
    lang: str
    fips: frozenset
    themes: str
    feed: str            # 'en' | 'translation'


def parse_gkg_line(line: str, feed: str) -> Rec | None:
    r = line.rstrip("\r\n").split("\t")
    if len(r) < 27:
        return None
    url = r[4].strip()
    first_seen = parse14(r[1])
    if not url.startswith(("http://", "https://")) or first_seen is None:
        return None
    extras = r[26]
    m = _TITLE_RE.search(extras)
    title = html.unescape(m.group(1)).strip() if m else ""
    pm = _PUB_RE.search(extras)
    lm = _LANG_RE.search(r[25])
    domain = (r[3].strip().lower() or (urllib.parse.urlsplit(url).hostname or "")).removeprefix("www.")
    fips = frozenset(p[2] for p in (loc.split("#") for loc in r[9].split(";")) if len(p) >= 3 and p[2])
    return Rec(gkg_id=r[0], first_seen=first_seen, domain=domain, reg_key=registered_domain(domain),
               url=url, title=title, page_pub=parse14(pm.group(1)) if pm else None,
               lang=lm.group(1) if lm else "eng", fips=fips, themes=r[8], feed=feed)


def resolve_published(rec: Rec) -> tuple:
    """(published_at naive UTC, basis). The page's own timestamp when it has one, but never later
    than the moment GDELT first saw the page (later values are local wall-clock labelled UTC)."""
    if rec.page_pub is None:
        return rec.first_seen, "gkg_first_seen"
    if rec.page_pub > rec.first_seen:
        return rec.first_seen, "page_pubtime_clamped"
    return rec.page_pub, "page_pubtime"


def scope_text(rec: Rec) -> str:
    # translation titles are native script: also read the (usually Latin) URL slug
    return rec.title if rec.feed == "en" else f"{rec.title} {url_slug_text(rec.url)}"


def in_scope(rec: Rec, registry: dict, registry_unfiltered: bool = False) -> bool:
    if len(rec.title) < MIN_TITLE_LEN:
        return False
    if registry_unfiltered and rec.reg_key in registry:
        return True
    kw = keyword_hit(scope_text(rec))
    regional = bool(rec.fips & REGIONAL_FIPS)
    if kw == "strong":
        return True
    if kw == "loose" and regional:  # "tanker" alone also matches road accidents
        return True
    # A regional outlet mentions its own country in nearly every story (jpost -> Israel on a
    # hair-clinic advert), so a location alone never qualifies: it needs a conflict theme too.
    return regional and any(t in rec.themes for t in CONFLICT_THEMES)


def iter_zip_lines(blob: bytes):
    """Stream lines out of one GKG zip (one ~3-10 MB file at a time, never a whole day)."""
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        names = z.namelist()
        if not names:
            return
        with z.open(names[0]) as fh:
            for line in io.TextIOWrapper(fh, encoding="utf-8", errors="replace", newline="\n"):
                if line.strip():
                    yield line


# ─────────────────────────────────────────────
# SELECTION
# ─────────────────────────────────────────────

@dataclasses.dataclass
class Selected:
    rec: Rec
    published_at: datetime.datetime
    basis: str
    norm: str
    cluster: int = 1
    registry: bool = False
    relevance: int = 0   # 2 strong keyword, 1 loose keyword, 0 location + theme only
    rid: str = ""

    @property
    def key(self):  # "earliest" order: picks one row per URL and one per title
        return (self.published_at, self.rec.first_seen, self.rec.url, self.rec.gkg_id)

    @property
    def rank(self):
        # most widely carried title first; ties: stronger keyword, then the md5 id - stable across
        # re-runs and spread evenly over the day (a time tie-break would favour the small hours)
        return (-self.cluster, -self.relevance, self.rid)


def select_for_day(recs, registry: dict, cap: int, strict_registry: bool = False,
                   horn_share: float = HORN_SHARE) -> list:
    """Deterministic per-day pick of at most `cap` rows.

    1. Registry-outlet rows that hit a project keyword, one per normalised title (earliest wins).
       With strict_registry, every in-scope registry row is in this tier.
    2. Everything else - other outlets, and registry rows admitted only by location + theme (on
       live data those are the weakest rows: floods, court cases, local crime in a tracked
       country) - one row per normalised title: titles with a keyword before body-only matches,
       then by how many distinct outlets carried the title.
    Ties: stronger keyword first, then the md5 id (stable, and spread evenly over the day).

    Horn quota: at most ceil(horn_share * cap) Horn-of-Africa rows (is_horn_rec) are taken in the
    ranking order above; the room they leave is given to the next-best non-Horn rows, and if there
    are not enough of those, leftover Horn rows fill it (the cap is never exceeded). horn_share=1
    switches the quota off. With no Horn row among the candidates the result is the plain ranking.
    """
    best: dict[str, Selected] = {}
    for rec in recs:
        pub, basis = resolve_published(rec)
        rid = url_to_id(rec.url)
        kw = keyword_hit(scope_text(rec))
        s = Selected(rec, pub, basis, normalise_title(rec.title), registry=rec.reg_key in registry,
                     relevance={"strong": 2, "loose": 1}.get(kw, 0), rid=rid)
        if not s.norm:
            continue
        if rid not in best or s.key < best[rid].key:
            best[rid] = s
    items = sorted(best.values(), key=lambda s: s.key)
    outlets: dict[str, set] = collections.defaultdict(set)
    for s in items:
        outlets[s.norm].add(s.rec.domain)
    for s in items:
        s.cluster = len(outlets[s.norm])

    def priority(s):
        return s.registry and (strict_registry or s.relevance > 0)

    chosen, seen_norm = [], set()
    for s in items:  # key-sorted, so the first row per title is the earliest
        if priority(s) and s.norm not in seen_norm:
            seen_norm.add(s.norm)
            chosen.append(s)
    chosen.sort(key=lambda s: s.rank)
    chosen_full = chosen
    chosen = chosen_full[:cap]
    taken = {s.norm for s in chosen}

    reps: dict[str, Selected] = {}
    for s in items:
        if not priority(s) and s.norm not in taken and s.norm not in reps:
            reps[s.norm] = s
    # titles that name the conflict outrank wire copy that only mentions it in the body
    others = sorted(reps.values(), key=lambda s: (s.relevance == 0,) + s.rank)
    room = max(0, cap - len(chosen))
    picked = chosen + others[:room]
    if horn_share >= 1 or not any(is_horn_rec(s.rec) for s in picked):
        return picked
    # Horn quota. Candidates beyond the cap, in ranking order, are the substitutes.
    max_horn = max(1, math.ceil(horn_share * cap))
    out, skipped, n_horn = [], [], 0
    for s in picked + chosen_full[cap:] + others[room:]:
        if len(out) >= cap:
            break
        if is_horn_rec(s.rec):
            if n_horn < max_horn:
                out.append(s)
                n_horn += 1
            else:
                skipped.append(s)
        else:
            out.append(s)
    if len(out) < cap:
        out += skipped[:cap - len(out)]
    return out


HORN_TAGS = {FIPS_TAGS[f] for f in HORN_FIPS}


def tags_for(rec: Rec) -> list:
    tags = {FIPS_TAGS[f] for f in rec.fips if f in FIPS_TAGS}
    tags |= {tag for theme, tag in THEME_TAGS if theme in rec.themes}
    # Horn tags only take the slots the original tags leave free, so GDELT's location noise (a
    # Red Sea story geocoded to Eritrea) can never push UAE / Yemen / ... out of the 6.
    base = sorted(tags - HORN_TAGS)[:6]
    return base + sorted(tags & HORN_TAGS)[:6 - len(base)]


def build_row(s: Selected, day: int, registry: dict, fetched_at: str) -> dict:
    rec = s.rec
    region, country = outlet_origin(rec.reg_key, registry)
    title = rec.title if len(rec.title) <= TITLE_MAX else rec.title[:TITLE_MAX] + "…"
    row = {
        "id": url_to_id(rec.url),
        "title": title,
        "summary": None,
        "url": rec.url,
        "source_name": rec.domain,
        "source_type": SOURCE_TYPE,
        "published_at": s.published_at.strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "fetched_at": fetched_at,
        "conflict_day": day,
        "region": region,
        "country": country,
        "tags": tags_for(rec),
        "is_retrospective": True,
        "content_json": {"src": "gdelt-gkg", "gkg": rec.gkg_id, "time": s.basis, "lang": rec.lang,
                         "outlets": s.cluster, "reg": s.registry},
    }
    meta = registry.get(rec.reg_key)
    if meta and meta.get("source_perspective") is not None:
        row["source_perspective"] = meta["source_perspective"]
    return row


# ─────────────────────────────────────────────
# NETWORK
# ─────────────────────────────────────────────

class FetchError(Exception):
    pass


def http_fetch(url: str) -> bytes | None:
    """One GKG zip. None = 404 (GDELT has no file for that slot). Raises FetchError after retries."""
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=90) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
            time.sleep(10 if e.code == 429 else 3 * (attempt + 1))
        except Exception as e:  # timeouts, resets
            last = e
            time.sleep(3 * (attempt + 1))
    raise FetchError(f"{url}: {last}")


def group_by_signature(rows: list) -> list:
    groups: dict[tuple, list] = {}
    for r in rows:
        groups.setdefault(tuple(sorted(r.keys())), []).append(r)
    return list(groups.values())


def upsert_rows(rows: list, base_url: str, key: str) -> tuple:
    """Insert in <=500-row batches, one key signature per request (PGRST102), ignoring rows whose
    id already exists. Returns (rows_written, batches_failed)."""
    written = failed = 0
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
               "Prefer": "resolution=ignore-duplicates,return=minimal"}
    for group in group_by_signature(rows):
        for i in range(0, len(group), BATCH_SIZE):
            batch = group[i:i + BATCH_SIZE]
            body = json.dumps(batch, ensure_ascii=False).encode("utf-8")
            ok = False
            for attempt in range(2):
                req = urllib.request.Request(f"{base_url.rstrip('/')}/rest/v1/articles", data=body,
                                             headers=headers, method="POST")
                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:
                        ok = 200 <= resp.status < 300
                    break
                except urllib.error.HTTPError as e:
                    detail = e.read()[:300].decode("utf-8", "replace")
                    print(f"  ! Supabase insert error {e.code}: {detail}")
                    if e.code < 500 and e.code != 429:
                        break
                except Exception as e:
                    print(f"  ! Supabase insert error: {e}")
                time.sleep(5)
            if ok:
                written += len(batch)
            else:
                failed += 1
    return written, failed


# ─────────────────────────────────────────────
# ONE DAY
# ─────────────────────────────────────────────

@dataclasses.dataclass
class Options:
    en_cap: int = EN_CAP
    nonen_cap: int = NONEN_CAP
    translation: bool = True
    lookahead_hours: int = 6
    workers: int = 4
    registry_unfiltered: bool = False
    strict_registry: bool = False
    horn_share: float = HORN_SHARE
    today: datetime.date | None = None


@dataclasses.dataclass
class DayResult:
    day: int
    rows: list
    stats: dict


def slot_names(day: int, lookahead_hours: int) -> list:
    start = datetime.datetime.combine(day_date(day), datetime.time())
    n = 96 + max(0, lookahead_hours) * 4
    return [(start + datetime.timedelta(minutes=15 * k)).strftime("%Y%m%d%H%M%S") for k in range(n)]


def process_day(day: int, opts: Options, fetch=None, registry: dict | None = None) -> DayResult:
    fetch = fetch or http_fetch
    registry = registry if registry is not None else build_registry()
    today = opts.today or utc_today()
    feeds = [FEED_EN] + ([FEED_TR] if opts.translation else [])
    jobs = [(ts, feed) for feed in feeds for ts in slot_names(day, opts.lookahead_hours)]
    t0 = time.time()

    def work(job):
        ts, feed = job
        url = f"{GDELT_BASE}/{ts}.{feed}.zip"
        out = {"job": job, "status": "ok", "bytes": 0, "scanned": 0, "in_scope": 0, "other_day": 0,
               "cands": []}
        try:
            blob = fetch(url)
        except FetchError as e:
            out["status"] = "error"
            out["error"] = str(e)
            return out
        if blob is None:
            out["status"] = "missing"
            return out
        out["bytes"] = len(blob)
        tag = "en" if feed == FEED_EN else "translation"
        try:
            for line in iter_zip_lines(blob):
                rec = parse_gkg_line(line, tag)
                if rec is None:
                    continue
                out["scanned"] += 1
                if not in_scope(rec, registry, opts.registry_unfiltered):
                    continue
                out["in_scope"] += 1
                pub, _ = resolve_published(rec)
                if conflict_day_of(pub, today) != day:
                    out["other_day"] += 1
                    continue
                out["cands"].append(rec)
        except (zipfile.BadZipFile, OSError) as e:
            out["status"] = "error"
            out["error"] = f"{url}: {e}"
            out["cands"] = []
        return out

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, opts.workers)) as ex:
        for res in ex.map(work, jobs):
            results.append(res)

    stats = {"day": day, "date": day_date(day).isoformat(), "files_read": 0, "files_missing": [],
             "files_failed": [], "MB": 0.0, "rows_scanned": 0, "in_scope_all_days": 0,
             "in_scope_other_day": 0, "matched": 0}
    en, tr = [], []
    for res in results:
        ts, feed = res["job"]
        name = f"{ts}.{feed}"
        if res["status"] == "missing":
            stats["files_missing"].append(name)
            continue
        if res["status"] == "error":
            stats["files_failed"].append(res.get("error", name))
            continue
        stats["files_read"] += 1
        stats["MB"] += res["bytes"] / 1e6
        stats["rows_scanned"] += res["scanned"]
        stats["in_scope_all_days"] += res["in_scope"]
        stats["in_scope_other_day"] += res["other_day"]
        stats["matched"] += len(res["cands"])
        (en if feed == FEED_EN else tr).extend(res["cands"])

    fetched_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    sel = (select_for_day(en, registry, opts.en_cap, opts.strict_registry, opts.horn_share)
           + select_for_day(tr, registry, opts.nonen_cap, opts.strict_registry, opts.horn_share))
    rows = [build_row(s, day, registry, fetched_at) for s in sel]

    n_en = sum(1 for r in rows if r["content_json"]["lang"] == "eng")
    reg_n = sum(1 for r in rows if r["content_json"]["reg"])
    payload = len(json.dumps(rows, ensure_ascii=False).encode("utf-8"))
    stats.update({
        "MB": round(stats["MB"], 1),
        "secs": round(time.time() - t0, 1),
        "candidates_unique": len({url_to_id(r.url) for r in en + tr}),
        "kept": len(rows), "kept_en": n_en, "kept_non_en": len(rows) - n_en,
        "registry_rows": reg_n,
        "registry_share": round(reg_n / len(rows), 3) if rows else 0.0,
        "time_basis": dict(collections.Counter(r["content_json"]["time"] for r in rows)),
        "languages": dict(collections.Counter(r["content_json"]["lang"] for r in rows).most_common(8)),
        "top_outlets": collections.Counter(r["source_name"] for r in rows).most_common(10),
        "payload_bytes": payload,
    })
    return DayResult(day, rows, stats)


# ─────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────

def shard_plan(start: int, end: int, size: int) -> list:
    size = max(1, size)
    return [{"start": a, "end": min(a + size - 1, end)} for a in range(start, end + 1, size)]


def _print_day(stats: dict):
    s = dict(stats)
    missing, failed = s.pop("files_missing"), s.pop("files_failed")
    s["files_missing_n"], s["files_failed_n"] = len(missing), len(failed)
    print(f"DAY {s['day']} " + json.dumps(s, ensure_ascii=False))
    if missing:
        print(f"  missing slots ({len(missing)}): {', '.join(missing[:12])}{' ...' if len(missing) > 12 else ''}")
    for f in failed[:5]:
        print(f"  FAILED: {f}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        try:
            with open(summary, "a", encoding="utf-8") as fh:
                top = ", ".join(f"{d} {n}" for d, n in s["top_outlets"][:5])
                fh.write(f"| {s['day']} | {s['date']} | {s['files_read']} | {len(missing)} | {len(failed)} | "
                         f"{s['rows_scanned']} | {s['matched']} | {s['kept']} | {s['registry_share']} | "
                         f"{s['secs']} | {top} |\n")
        except OSError:
            pass


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--start-day", type=int, required=True)
    ap.add_argument("--end-day", type=int, required=True)
    ap.add_argument("--write", action="store_true", help="insert into Supabase (default: dry run)")
    ap.add_argument("--no-translation", action="store_true", help="skip the machine-translated feed")
    ap.add_argument("--en-cap", type=int, default=EN_CAP)
    ap.add_argument("--nonen-cap", type=int, default=NONEN_CAP)
    ap.add_argument("--workers", type=int, default=4, help="parallel downloads (be polite to GDELT)")
    ap.add_argument("--lookahead-hours", type=int, default=6)
    ap.add_argument("--registry-unfiltered", action="store_true",
                    help="keep every registry-outlet row, even off-topic ones (not recommended)")
    ap.add_argument("--strict-registry-priority", action="store_true",
                    help="put every in-scope registry row ahead of other outlets, even rows admitted "
                         "only by location + theme (default: only registry rows with a keyword)")
    ap.add_argument("--horn-share", type=float, default=HORN_SHARE, metavar="FRACTION",
                    help="max fraction of each day's cap that Horn-of-Africa rows may take "
                         f"(default {HORN_SHARE}; 1 = no quota)")
    ap.add_argument("--dump-jsonl", metavar="PATH",
                    help="also write every selected row to this JSONL file (review before --write)")
    ap.add_argument("--plan", type=int, metavar="DAYS_PER_SHARD",
                    help="print a GitHub Actions matrix for the range and exit")
    a = ap.parse_args(argv)

    today = utc_today()
    last_closed = (today - CONFLICT_START).days  # yesterday's conflict day: today's is incomplete
    if not (1 <= a.start_day <= a.end_day <= last_closed):
        print(f"error: need 1 <= start_day <= end_day <= {last_closed} (last complete UTC day); "
              f"got {a.start_day}..{a.end_day}")
        return 2
    if not (0 < a.en_cap <= EN_CAP and 0 <= a.nonen_cap <= NONEN_CAP):
        print(f"error: caps must be within 1..{EN_CAP} English and 0..{NONEN_CAP} non-English")
        return 2
    if not (0 < a.horn_share <= 1):
        print("error: --horn-share must be in (0, 1]")
        return 2
    if a.plan:
        print(json.dumps({"include": shard_plan(a.start_day, a.end_day, a.plan)}))
        return 0
    base = key = None
    if a.write:
        base, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
        if not base or not key:
            print("error: --write needs SUPABASE_URL and SUPABASE_SERVICE_KEY")
            return 2

    opts = Options(en_cap=a.en_cap, nonen_cap=a.nonen_cap, translation=not a.no_translation,
                   lookahead_hours=a.lookahead_hours, workers=a.workers,
                   registry_unfiltered=a.registry_unfiltered,
                   strict_registry=a.strict_registry_priority, horn_share=a.horn_share, today=today)
    registry = build_registry()
    mode = "WRITE" if a.write else "DRY RUN (nothing is written)"
    print(f"[backfill_gdelt_index] Days {a.start_day}-{a.end_day} | {mode} | translation="
          f"{opts.translation} | caps {opts.en_cap}+{opts.nonen_cap}/day | workers={opts.workers} | "
          f"registry domains={len(registry)}")
    print("[backfill_gdelt_index] Source: The GDELT Project (https://www.gdeltproject.org/)")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        try:
            with open(summary, "a", encoding="utf-8") as fh:
                fh.write(f"### GDELT backfill Days {a.start_day}-{a.end_day} ({mode})\n\n"
                         "| day | date | files | missing | failed | scanned | matched | kept | registry share "
                         "| secs | top outlets |\n|---|---|---|---|---|---|---|---|---|---|---|\n")
        except OSError:
            pass

    t0 = time.time()
    files_read = written = failed_batches = 0
    incomplete_days, kept_total, payload_total = [], 0, 0
    for day in range(a.start_day, a.end_day + 1):
        res = process_day(day, opts, registry=registry)
        _print_day(res.stats)
        if a.dump_jsonl:
            with open(a.dump_jsonl, "a", encoding="utf-8") as fh:
                for r in res.rows:
                    fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        files_read += res.stats["files_read"]
        kept_total += len(res.rows)
        payload_total += res.stats["payload_bytes"]
        if res.stats["files_failed"]:
            # A partial file set would select a different (and then permanent) row set: skip the
            # day and let a re-run, which is idempotent, do it properly.
            incomplete_days.append(day)
            print(f"  ! Day {day}: {len(res.stats['files_failed'])} file(s) failed to download, day NOT written")
            continue
        if a.write and res.rows:
            w, f = upsert_rows(res.rows, base, key)
            written += w
            failed_batches += f
            print(f"  -> Day {day}: {w} rows sent, {f} failed batch(es)")

    print(f"\n[backfill_gdelt_index] files read {files_read} | rows kept {kept_total} | "
          f"payload {payload_total / 1e6:.2f} MB JSON | written {written} | failed batches {failed_batches} | "
          f"incomplete days {incomplete_days or 'none'} | {time.time() - t0:.0f}s")
    if files_read == 0:
        print("[backfill_gdelt_index] x no GKG file could be read")
        return 1
    if incomplete_days or failed_batches:
        return 1
    if a.write and written == 0:
        print("[backfill_gdelt_index] x files were parsed but nothing was written")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
