#!/usr/bin/env python3
"""Stage 1 — Perplexity Fetch. Stub: writes minimal intel JSON for downstream stages."""
import argparse
import json
import os

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=True)
    args = ap.parse_args()
    path = f"/tmp/intel_day_{args.day}.json"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump({"conflict_day": args.day, "articles": []}, f, indent=0)
    print(f"Stage 1 stub: wrote {path}")

if __name__ == "__main__":
    main()
