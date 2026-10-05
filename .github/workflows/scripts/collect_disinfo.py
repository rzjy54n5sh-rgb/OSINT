"""
collect_disinfo.py — fact-check feed collector (deterministic, no AI).

For each fact-check feed item about the conflict:
  - verdict comes ONLY from the fact-checker's own rating: the schema.org
    ClaimReview JSON-LD on the item's page (reviewRating.alternateName, falling
    back to ratingValue relative to bestRating/worstRating), mapped through an
    explicit lookup table. No rating found -> UNVERIFIED (the claim and its
    debunk_url are still recorded; we never assert a verdict the source did not give).
  - spread_estimate is always NULL. The previous per-outlet baseline x keyword
    multiplier "estimate" was invented, which the platform rule forbids.
  - relevance uses CONFLICT_KEYWORDS from sources_registry.py (word-start match,
    accent-folded so "Irán" matches "iran").
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import re, json, hashlib, datetime, unicodedata, feedparser, requests
from dateutil import parser as dateparser

from sources_registry import CONFLICT_KEYWORDS

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}

USER_AGENT = "Mozilla/5.0 (MENA-Intel-Desk collector)"
FETCH_TIMEOUT = 15          # seconds, for feeds and item pages alike
MAX_PAGE_FETCHES = 60       # item pages fetched per run; keeps the job far under its 10-min timeout

ALLOWED_VERDICTS = ("FALSE", "MISLEADING", "TRUE", "UNVERIFIED")

FACT_CHECK_FEEDS = [
    # Major wire / agency
    {"url": "https://www.reuters.com/fact-check/rss", "source": "Reuters Fact Check"},
    {"url": "https://factcheck.afp.com/list/all/feed", "source": "AFP Fact Check"},
    {"url": "https://apnews.com/hub/ap-fact-check/feed", "source": "AP Fact Check"},
    # US fact-checkers
    {"url": "https://www.snopes.com/feed/", "source": "Snopes"},
    {"url": "https://www.politifact.com/rss/all/", "source": "PolitiFact"},
    {"url": "https://www.factcheck.org/feed/", "source": "FactCheck.org"},
    {"url": "http://voices.washingtonpost.com/fact-checker/atom.xml", "source": "Washington Post Fact Checker"},
    {"url": "https://www.usatoday.com/news/factcheck/feed/", "source": "USA Today Fact Check"},
    {"url": "https://leadstories.com/feed/", "source": "Lead Stories"},
    # UK / international
    {"url": "https://www.bbc.co.uk/news/reality_check/rss.xml", "source": "BBC Reality Check"},
    {"url": "https://fullfact.org/feed/", "source": "Full Fact"},
    {"url": "https://www.poynter.org/feed/", "source": "Poynter"},
    {"url": "https://sciencefeedback.co/feed/", "source": "Science Feedback"},
    {"url": "https://maldita.es/feed/", "source": "Maldita"},
    {"url": "https://correctiv.org/feed/", "source": "Correctiv"},
    # Arab / MENA fact-checkers
    {"url": "https://factcheckar.com/feed/", "source": "FactcheckAr"},
]

# ─────────────────────────────────────────────
# RATING -> VERDICT (exact match on the whole normalised rating string; no substrings,
# so "not true" can never hit "true" and "unverified" can never hit "verified")
# ─────────────────────────────────────────────
RATING_TABLE = {
    "FALSE": [
        "false", "fake", "not true", "untrue", "pants on fire", "incorrect", "inaccurate",
        "wrong", "fabricated", "hoax", "scam", "baseless", "debunked", "misattributed",
        "fake news", "fake video", "fake image", "altered", "manipulated", "doctored",
        "totally false", "completely false", "entirely false",
        # es / de / fr / ar
        "falso", "bulo", "no es cierto", "no es verdad", "falsch", "frei erfunden",
        "faux", "زائف", "كاذب", "خطأ", "غير صحيح", "مزيف", "ملفق",
    ],
    "MISLEADING": [
        "misleading", "missing context", "lacks context", "needs context", "out of context",
        "partly false", "partially false", "partly true", "partially true", "half true",
        "mostly false", "mixture", "mixed", "miscaptioned", "exaggerated", "distorted",
        "cherry picks", "spins the facts",
        # es / de / fr / ar
        "enganoso", "falta contexto", "sin contexto", "verdad a medias", "irrefuhrend",
        "fehlender kontext", "teilweise falsch", "trompeur", "مضلل", "صحيح جزئيا", "خارج السياق",
    ],
    "TRUE": [
        "true", "correct", "accurate", "mostly true", "correct attribution", "legit",
        # es / de / fr / ar
        "verdadero", "cierto", "verdad", "richtig", "wahr", "vrai", "صحيح",
    ],
    "UNVERIFIED": [
        "unproven", "unverified", "unsupported", "unfounded", "no evidence", "research in progress",
        "unconfirmed", "satire", "labeled satire", "outdated",
        "sin pruebas", "no verificado", "unbelegt", "invérifiable", "غير مؤكد",
    ],
}


def normalise_rating(text) -> str:
    """Lower-case, strip accents (Arabic letters are untouched), collapse whitespace
    hyphens and trailing punctuation, so 'Pants-on-Fire!' == 'pants on fire', 'Engañoso' == 'enganoso'."""
    if not isinstance(text, str):
        return ""
    t = unicodedata.normalize("NFKD", text)
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[-_‐–—]+", " ", t.lower())
    t = re.sub(r"\s+", " ", t).strip()
    t = t.strip(" .!?:;,\"'“”‘’«»()[]")
    return t


RATING_LOOKUP = {}
for _verdict, _phrases in RATING_TABLE.items():
    for _p in _phrases:
        _k = normalise_rating(_p)
        assert _k not in RATING_LOOKUP or RATING_LOOKUP[_k] == _verdict, f"rating table conflict: {_p}"
        RATING_LOOKUP[_k] = _verdict


def verdict_from_rating_text(text):
    """Mapped verdict for a textual rating, or None if the phrase is not in the table."""
    return RATING_LOOKUP.get(normalise_rating(text))


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def verdict_from_numeric(rating: dict):
    """ratingValue relative to explicit bestRating/worstRating, or None if not usable.

    Position f in [0,1]: f < 0.25 -> FALSE, f >= 0.75 -> TRUE, otherwise MISLEADING.
    On a 1..5 scale: 1 FALSE, 2-3 MISLEADING, 4-5 TRUE (consistent with the text table:
    'mostly false' -> MISLEADING, 'mostly true' -> TRUE). Out-of-range values (e.g. -1
    "not rated") and missing best/worst -> None (no default scale is assumed).
    """
    r, best, worst = _num(rating.get("ratingValue")), _num(rating.get("bestRating")), _num(rating.get("worstRating"))
    if r is None or best is None or worst is None or best == worst:
        return None
    f = (r - worst) / (best - worst)
    if f < 0 or f > 1:
        return None
    if f < 0.25:
        return "FALSE"
    if f >= 0.75:
        return "TRUE"
    return "MISLEADING"


def verdict_from_review_rating(rating) -> str:
    if isinstance(rating, list):
        rating = next((r for r in rating if isinstance(r, dict)), None)
    if not isinstance(rating, dict):
        return "UNVERIFIED"
    return (verdict_from_rating_text(rating.get("alternateName"))
            or verdict_from_numeric(rating)
            or "UNVERIFIED")


# ─────────────────────────────────────────────
# ClaimReview JSON-LD extraction
# ─────────────────────────────────────────────
_LD_JSON_RE = re.compile(
    r"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.I | re.S)


def _walk_jsonld(node):
    if isinstance(node, list):
        for n in node:
            yield from _walk_jsonld(n)
    elif isinstance(node, dict):
        yield node
        for key in ("@graph", "mainEntity", "hasPart", "review"):
            if key in node:
                yield from _walk_jsonld(node[key])


def _is_claim_review(node) -> bool:
    t = node.get("@type")
    types = t if isinstance(t, list) else [t]
    return any(isinstance(x, str) and x.split("/")[-1] == "ClaimReview" for x in types)


def extract_claim_reviews(html: str) -> list:
    """All schema.org ClaimReview objects in the page's JSON-LD blocks (document order)."""
    found = []
    for block in _LD_JSON_RE.findall(html or ""):
        try:
            data = json.loads(block.strip(), strict=False)
        except ValueError:
            continue
        found.extend(n for n in _walk_jsonld(data) if _is_claim_review(n))
    return found


def rate_page(html: str):
    """(verdict, claim_reviewed) from the first ClaimReview with a reviewRating; UNVERIFIED if none."""
    for cr in extract_claim_reviews(html):
        if "reviewRating" in cr:
            claim = cr.get("claimReviewed")
            return verdict_from_review_rating(cr["reviewRating"]), (claim.strip() if isinstance(claim, str) else None)
    return "UNVERIFIED", None


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def url_to_id(url):
    h = hashlib.md5(url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _fold(text: str) -> str:
    t = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in t if not unicodedata.combining(c)).lower()


# Word-START match: "iran" matches "Iranian"/"Irán", but list entries can no longer
# hit the middle of unrelated words (the old list's "war" matched "award"/"toward").
_RELEVANCE_RE = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(_fold(k)) for k in CONFLICT_KEYWORDS) + r")")


def is_relevant(title, summary):
    return bool(_RELEVANCE_RE.search(_fold((title or "") + " " + (summary or ""))))


def fetch_page(url):
    resp = requests.get(url, timeout=FETCH_TIMEOUT, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    return resp.text


def existing_rated_ids(ids):
    """IDs already stored with a definite verdict (not UNVERIFIED) — skipped so the page cap
    goes to new or still-unrated items. On any error, returns an empty set (cap still applies)."""
    rated = set()
    ids = list(ids)
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        try:
            resp = requests.get(f"{SUPABASE_URL}/rest/v1/disinfo_claims",
                                params={"select": "id,verdict", "id": f"in.({','.join(chunk)})"},
                                headers=HEADERS, timeout=FETCH_TIMEOUT)
            resp.raise_for_status()
            rated.update(r["id"] for r in resp.json() if r.get("verdict") and r["verdict"] != "UNVERIFIED")
        except Exception as e:
            print(f"  WARN existing-row lookup failed ({e}); not skipping any stored rows")
            return set()
    return rated


# ─────────────────────────────────────────────
# COLLECT
# ─────────────────────────────────────────────
def fetch_disinfo():
    candidates, seen_ids = [], set()
    off_topic = 0
    for feed_cfg in FACT_CHECK_FEEDS:
        try:
            # feedparser.parse(url) has no network timeout: one unresponsive feed
            # hung the whole job until GitHub cancelled it at 10 minutes. Fetch
            # with an explicit timeout and hand feedparser the bytes instead.
            resp = requests.get(feed_cfg["url"], timeout=FETCH_TIMEOUT,
                                headers={"User-Agent": USER_AGENT})
            resp.raise_for_status()
            for entry in feedparser.parse(resp.content).entries:
                title = entry.get("title",""); summary = entry.get("summary","") or entry.get("description","")
                url = entry.get("link","")
                if not url: continue
                if not is_relevant(title, summary):
                    off_topic += 1
                    continue
                rid = url_to_id(url)
                if rid in seen_ids: continue
                seen_ids.add(rid)
                pub_str = entry.get("published","") or entry.get("updated","")
                try: pub_dt = dateparser.parse(pub_str) if pub_str else datetime.datetime.utcnow()
                except Exception: pub_dt = datetime.datetime.utcnow()
                candidates.append({"rid": rid, "title": title, "url": url, "pub_dt": pub_dt, "source": feed_cfg["source"]})
        except Exception as e: print(f"  ERROR {feed_cfg['source']}: {e}")

    already_rated = existing_rated_ids(c["rid"] for c in candidates)
    todo = [c for c in candidates if c["rid"] not in already_rated]

    # Newest first, so the per-run page cap goes to the freshest claims.
    def _sort_key(c):
        dt = c["pub_dt"]
        if dt.tzinfo is not None:
            dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        return dt
    todo.sort(key=_sort_key, reverse=True)

    records, fetched, fetch_failed, no_review = [], 0, 0, 0
    over_cap = todo[MAX_PAGE_FETCHES:]
    for c in todo[:MAX_PAGE_FETCHES]:
        fetched += 1
        try:
            verdict, claim_reviewed = rate_page(fetch_page(c["url"]))
        except Exception as e:
            fetch_failed += 1
            print(f"  WARN page fetch failed [{c['source']}] {c['url']}: {e}")
            verdict, claim_reviewed = "UNVERIFIED", None
        else:
            if claim_reviewed is None and verdict == "UNVERIFIED":
                no_review += 1
        assert verdict in ALLOWED_VERDICTS
        claim_text = (claim_reviewed or c["title"])[:500]
        records.append({"id": c["rid"], "claim_text": claim_text, "verdict": verdict,
                        "source_url": c["url"], "debunk_url": c["url"], "spread_estimate": None,
                        "published_at": c["pub_dt"].isoformat(),
                        "created_at": datetime.datetime.utcnow().isoformat()})
        print(f"  [{c['source']}] {verdict} | {claim_text[:70]}")

    print(f"[collect_disinfo] {len(candidates)} relevant items, {off_topic} off-topic dropped, "
          f"{len(already_rated)} already rated (skipped), {fetched} pages fetched "
          f"({fetch_failed} failed, {no_review} without ClaimReview), "
          f"{len(over_cap)} over the {MAX_PAGE_FETCHES}-page cap (skipped, retried next run)")
    return records


def upsert_disinfo(records):
    if not records: return 0
    resp = requests.post(f"{SUPABASE_URL}/rest/v1/disinfo_claims", headers={**HEADERS,"Prefer":"resolution=merge-duplicates,return=minimal"}, json=records, timeout=30)
    if resp.status_code not in (200,201): print(f"  Supabase error: {resp.status_code} -- {resp.text[:300]}"); return 0
    return len(records)


def main():
    print(f"[collect_disinfo] Starting -- {datetime.datetime.utcnow().isoformat()}Z")
    records = fetch_disinfo()
    inserted = upsert_disinfo(records)
    print(f"[collect_disinfo] Done -- {inserted} disinfo claims written")

if __name__ == "__main__":
    main()
