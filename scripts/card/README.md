# Daily card

Renders the free shop-window product: one image a day that people forward on WhatsApp, Telegram and LinkedIn.

| File | Size | Use |
|---|---|---|
| `out/card-en-1080x1350.png` | 1080×1350 (4:5) | WhatsApp / Telegram / Instagram / LinkedIn feed |
| `out/card-en-1200x630.png` | 1200×630 | Link preview (og:image), LinkedIn link post |
| `out/card-en-alt.txt` | text | Alt text with the numbers in words |
| `out/card-en-caption.txt` | text (≤1024 chars) | Telegram caption carrying the source links |
| `out/card-en-manifest.json` | JSON | Per-block as-of, sources, ranges, gate notes |

No model or AI API is involved and nothing is written to the database.

## What is on the card (and where each number comes from)

1. **Chokepoints (hero).** Suez Canal, Bab al-Mandeb (Red Sea), Strait of Hormuz: status word, traffic as % of the Jan–Oct 2023 weekly average, weekly transits and week-on-week change. Source: `data/chokepoints/latest.json`, written weekly from the Chokepoint Weekly. Figures are **IMF PortWatch only** (licence_check row 4, USE-PROVISIONAL). Lloyd's List Intelligence, Straits.live, Windward and Drewry data must never appear. Status follows weekly_spec v1 §3: traffic band <50% Disrupted, 50–90% Elevated, ≥90% Normal, never Closed from traffic alone. The gate re-computes index and band from the counts.
2. **What changed.** Up to 3 lines from the day's General brief (`daily_briefings`, `report_type = 'general'`). Rule, in code (`lib/model.mjs` `selectChanges`): analysis sections in brief order, one item per subsection, first paragraph with an outlet name and an http(s) URL, no AVOID-listed outlet, a source dated within 2 days, and not a negative finding. The line is the paragraph's first sentence verbatim (≤160 characters) or else the subsection heading; the outlet and date are printed on the line. If nothing qualifies the card says **"No sourced change today"**.
3. **Scenario odds strip** (`scenarios` + published `scenario_daily`, method market-anchored-v1). A, C and D are the stored market-implied event probabilities (`probability_raw`). They can co-occur, so B ("none of them") is drawn as a **range**, the Fréchet bounds `[100 − (A+C+D), 100 − max(A,C,D)]` (Day 222: 48.5–74.5%). The published B equals the lower bound. E is printed separately (independent; "unmeasured" when no market passes the floor). Footnote: market prices, not this desk's forecast.
4. **Honesty lines.** "Automated edition" unless `CARD_REVIEWED=true` **and** `CARD_REVIEWED_FOR` equals the render's UTC date (`YYYY-MM-DD`), then "AI-assisted, analyst-reviewed". A flag left on from an earlier day is ignored. Each block carries its own as-of and source credit. Site URL in the footer.

## Gates (exit codes)

| Exit | Meaning |
|---|---|
| 0 | Rendered |
| 1 | Configuration / network error, Arabic requested without review |
| 2 | Data-quality gate refused (`lib/gates.mjs`) |
| 3 | Layout refused: an element overflows the card, text is clipped, or the Plex fonts did not load |

Data-quality gates: a block older than its allowed age (chokepoints 8 days, scenarios 2 days, brief 1 day; whole UTC days; and a chokepoint data week ending more than 13 days ago), a brief whose quality is not `full`, licence-AVOID outlets or figures (source names, URLs and the line's own text), lanes on different weeks or listed twice, baselines that differ from the frozen weekly_spec values, a security-band status without a printed driver and source URL, an E value without a sourced market input, any missing source URL (lane, used market input, change line), a malformed scenario value or range (outside 0–100, A+C+D > 100, published B outside its range, missing A–D row, mixed days, unpublished row, wrong method), and chokepoint numbers that do not follow from their counts and thresholds. `--allow-stale` renders a stale block greyed with "Not updated · as of …" instead of refusing; it never overrides a missing URL or a malformed value.

## Run locally

```bash
cd scripts/card
npm ci
npm test                                   # gate unit tests, no network
SUPABASE_URL=https://<project>.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key> node render-card.mjs --out out
node render-card.mjs --fixture test/fixtures/day223.json --now 2026-10-08T12:30:00Z   # offline
node render-card.mjs --fixture test/fixtures/malformed.json                            # shows the gate refusing
```

The script refuses a `service_role` JWT or an `sb_secret_` key: it reads public data only. Chromium: `CARD_CHROME_CHANNEL=chrome` (CI uses the runner's Google Chrome) or `CARD_CHROME_PATH=/path/to/chrome`; otherwise playwright-core uses `PLAYWRIGHT_BROWSERS_PATH`. Nothing here runs `playwright install`.

## Arabic

The RTL layout and a draft string set exist (`lib/i18n.mjs`, `name_ar` in the chokepoint file), but `--lang ar` exits 1 until a native Arabic editor has reviewed them; then set `CARD_AR_REVIEWED=true`. `CARD_AR_PREVIEW=true` renders a watermarked proof ("NOT FOR PUBLICATION") for that reviewer. Scenario `name_ar` and brief `sections_ar` are still NULL in the database, so an Arabic card would today show English scenario names and "no sourced change".

## Workflow and publishing

`.github/workflows/daily-card.yml` runs at 04:30 UTC daily and on demand. It always uploads the PNGs as a workflow artifact (30 days). Publishing steps run only when their secrets exist (and on the schedule, or on a manual run with `publish` ticked):

| Target | Secrets | What it does |
|---|---|---|
| Cloudflare R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Uploads to `daily/YYYY-MM-DD/` and `latest/` (S3 API, free tier: 10 GB, no egress fees) |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` | `sendPhoto` of the 1080×1350 card with the source-link caption; the bot must be an admin of the channel |

Repository variables `CARD_REVIEWED=true` plus `CARD_REVIEWED_FOR=YYYY-MM-DD` (that day's UTC date) switch the honesty line for that day only.

Timing note: the scenario job runs at 05:20 UTC, after this card. At 04:30 the odds block normally shows the previous day's reading, labelled with its own day. Move the cron after 05:20 if same-day odds matter more than an early post.

## Weekly input: `data/chokepoints/latest.json`

Schema `chokepoints/v1`. Per lane: `lane` (`suez` · `bam_redsea` · `hormuz`), `name`, `status`, `status_band` (`traffic` or `security`), `status_driver`, `index_pct_of_2023`, `transits_week`, `transits_prev_week`, `baseline_week`, `week_start`, `week_end`, `as_of` (when the figures were pulled), `source_url`; optional `analyst_override` (written reason, printed per weekly_spec §3.5). Issue #1 values: PortWatch `Daily_Chokepoints_Data`, week 28 Sep–4 Oct 2026, baselines 515.4 / 522.1 / 669.4 per week, re-queried 8 Oct 2026.
