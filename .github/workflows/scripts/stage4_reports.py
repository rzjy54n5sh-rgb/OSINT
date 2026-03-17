#!/usr/bin/env python3
"""Stage 4 — Report Generation. Stub: creates /tmp/reports/ for artifact upload."""
import argparse
import os

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=True)
    args = ap.parse_args()
    d = "/tmp/reports"
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, f"day_{args.day}.txt"), "w") as f:
        f.write(f"Reports placeholder day {args.day}\n")
    print(f"Stage 4 stub: wrote {d}/day_{args.day}.txt")

if __name__ == "__main__":
    main()
