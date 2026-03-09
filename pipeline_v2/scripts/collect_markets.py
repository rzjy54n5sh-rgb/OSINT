"""
collect_markets.py
Fetches real market data and writes to Supabase market_data table.
Runs every 15 minutes via GitHub Actions.
Sources: Yahoo Finance (yfinance), EIA, exchangerate.host
"""

import os
import json
import datetime
import requests

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

CONFLICT_START = datetime.date(2026, 2, 28)

def conflict_day():
    return max(1, (datetime.date.today() - CONFLICT_START).days + 1)

def fetch_yfinance(symbols):
    """Fetch quotes from Yahoo Finance unofficial API."""
    results = {}
    for symbol, label in symbols.items():
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=2d"
            r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            data = r.json()
            meta = data["chart"]["result"][0]["meta"]
            price = meta.get("regularMarketPrice") or meta.get("previousClose")
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            change_pct = round(((price - prev) / prev) * 100, 2) if prev and price else 0
            results[label] = {"value": round(price, 2), "change_pct": change_pct}
        except Exception as e:
            print(f"  yfinance error for {symbol}: {e}")
    return results

def fetch_exchange_rates():
    """Fetch USD exchange rates."""
    try:
        r = requests.get(
            "https://api.exchangerate-api.com/v4/latest/USD",
            timeout=10,
        )
        data = r.json()
        return data.get("rates", {})
    except Exception as e:
        print(f"  Exchange rate error: {e}")
        return {}

def build_records(day):
    records = []
    now = datetime.datetime.utcnow().isoformat()

    # Oil, gold, US stocks, energy ETFs
    symbols = {
        "CL=F": "WTI Crude Oil",
        "BZ=F": "Brent Crude Oil",
        "GC=F": "Gold",
        "NG=F": "Natural Gas",
        "^GSPC": "S&P 500",
        "^DJI": "Dow Jones",
        "XLE": "Energy ETF (XLE)",
        "USO": "Oil ETF (USO)",
        "^VIX": "VIX (Fear Index)",
        "EURUSD=X": "EUR/USD",
    }

    yf_data = fetch_yfinance(symbols)

    unit_map = {
        "WTI Crude Oil": "USD/bbl",
        "Brent Crude Oil": "USD/bbl",
        "Gold": "USD/oz",
        "Natural Gas": "USD/MMBtu",
        "S&P 500": "points",
        "Dow Jones": "points",
        "Energy ETF (XLE)": "USD",
        "Oil ETF (USO)": "USD",
        "VIX (Fear Index)": "index",
        "EUR/USD": "rate",
    }

    for indicator, vals in yf_data.items():
        records.append({
            "indicator": indicator,
            "value": vals["value"],
            "change_pct": vals["change_pct"],
            "unit": unit_map.get(indicator, ""),
            "source": "Yahoo Finance",
            "conflict_day": day,
            "created_at": now,
        })

    # Exchange rates
    rates = fetch_exchange_rates()
    key_pairs = {
        "IRR": ("USD/IRR", "Exchange rate - Sanction proxy"),
        "SAR": ("USD/SAR", "Saudi Riyal"),
        "AED": ("USD/AED", "UAE Dirham"),
        "IQD": ("USD/IQD", "Iraqi Dinar"),
    }
    for code, (label, _) in key_pairs.items():
        if code in rates:
            records.append({
                "indicator": label,
                "value": round(rates[code], 2),
                "change_pct": 0,
                "unit": "rate",
                "source": "ExchangeRate-API",
                "conflict_day": day,
                "created_at": now,
            })

    return records

def insert_records(records):
    if not records:
        return 0
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/market_data",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=records,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"  Supabase error: {resp.status_code} — {resp.text[:300]}")
        return 0
    return len(records)

def main():
    day = conflict_day()
    print(f"[collect_markets] Day {day} — {datetime.datetime.utcnow().isoformat()}Z")
    records = build_records(day)
    inserted = insert_records(records)
    print(f"[collect_markets] Done — {inserted} market indicators written")
    for r in records:
        print(f"  {r['indicator']}: {r['value']} {r['unit']} ({r['change_pct']:+.2f}%)")

if __name__ == "__main__":
    main()
