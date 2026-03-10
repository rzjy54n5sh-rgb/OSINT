"""
collect_disinfo.py — Bug #12 fix: spread_estimate now uses multi-signal estimator
"""

import os, hashlib, datetime, feedparser, requests
from dateutil import parser as dateparser

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEADERS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}

KEYWORDS = ["iran","irgc","israel","houthi","hezbollah","hormuz","oil","middle east","war","nuclear","missile","drone","saudi","yemen","iraq","us military",
    "مصر","إيران","إسرائيل","حوثي","حزب الله","سوريا","لبنان","غزة","فلسطين","داعش","العراق"]
HIGH_VIRALITY_KEYWORDS = ["nuclear","b-2","b2","stealth","khamenei","hormuz","fallout","radiation","shot down","destroyed","killed","dead","explosion","chemical","biological","ceasefire","world war","nato"]
SOURCE_BASELINE = {
    "Reuters Fact Check": (800000, 3000000),
    "AP Fact Check": (600000, 2000000),
    "BBC Reality Check": (500000, 2500000),
    "AFP Fact Check": (400000, 1500000),
    "Snopes": (200000, 800000),
    "PolitiFact": (500000, 2000000),
    "FactCheck.org": (400000, 1500000),
    "Washington Post Fact Checker": (600000, 2500000),
    "Full Fact": (300000, 1200000),
    "Lead Stories": (200000, 900000),
    "USA Today Fact Check": (400000, 1800000),
    "Poynter": (300000, 1000000),
    "Science Feedback": (150000, 600000),
    "Maldita": (100000, 500000),
    "Correctiv": (200000, 800000),
    "FactcheckAr": (80000, 350000),
}
DEFAULT_BASELINE = (100000, 400000)
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

def url_to_id(url):
    h = hashlib.md5(url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

def guess_verdict(title, summary):
    text = (title + " " + (summary or "")).lower()
    if any(w in text for w in ["false","fake","debunk","no evidence","wrong"]): return "FALSE"
    if any(w in text for w in ["misleading","out of context","partly","missing context"]): return "MISLEADING"
    if any(w in text for w in ["true","confirmed","accurate","verified"]): return "TRUE"
    return "UNVERIFIED"

def is_relevant(title, summary):
    return any(kw in (title + " " + (summary or "")).lower() for kw in KEYWORDS)

def estimate_spread(title, summary, source, pub_dt, verdict):
    text = (title + " " + (summary or "")).lower()
    low, high = SOURCE_BASELINE.get(source, DEFAULT_BASELINE)
    hits = sum(1 for kw in HIGH_VIRALITY_KEYWORDS if kw in text)
    if hits >= 3: low, high = int(low*2.5), int(high*4.0)
    elif hits == 2: low, high = int(low*1.8), int(high*2.5)
    elif hits == 1: low, high = int(low*1.3), int(high*1.7)
    if pub_dt:
        age = (datetime.datetime.utcnow() - pub_dt.replace(tzinfo=None)).total_seconds() / 3600
        if age < 24: low, high = int(low*1.5), int(high*1.5)
        elif age < 48: low, high = int(low*1.2), int(high*1.2)
    if verdict == "FALSE": low, high = int(low*1.4), int(high*1.4)
    elif verdict == "MISLEADING": low, high = int(low*1.2), int(high*1.2)
    def fmt(n): return f"{n/1000000:.1f}M" if n>=1000000 else f"{n/1000:.0f}K" if n>=1000 else str(n)
    return f"~{fmt(low)}-{fmt(high)} impressions (est.)"

def fetch_disinfo():
    records, seen_ids = [], set()
    for feed_cfg in FACT_CHECK_FEEDS:
        try:
            for entry in feedparser.parse(feed_cfg["url"]).entries:
                title = entry.get("title",""); summary = entry.get("summary","") or entry.get("description","")
                url = entry.get("link","")
                if not url or not is_relevant(title, summary): continue
                rid = url_to_id(url)
                if rid in seen_ids: continue
                seen_ids.add(rid)
                pub_str = entry.get("published","") or entry.get("updated","")
                try: pub_dt = dateparser.parse(pub_str) if pub_str else datetime.datetime.utcnow()
                except: pub_dt = datetime.datetime.utcnow()
                verdict = guess_verdict(title, summary)
                spread = estimate_spread(title, summary, feed_cfg["source"], pub_dt, verdict)
                records.append({"id":rid,"claim_text":title[:500],"verdict":verdict,"source_url":url,"debunk_url":url,"spread_estimate":spread,"published_at":pub_dt.isoformat(),"created_at":datetime.datetime.utcnow().isoformat()})
                print(f"  [{feed_cfg['source']}] {verdict} | {spread} | {title[:70]}")
        except Exception as e: print(f"  ERROR {feed_cfg['source']}: {e}")
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
