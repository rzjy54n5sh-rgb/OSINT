# Home hero: corridor relief

The one 3D touch (System artboard): a tilted relief of the Gulf → Strait of Hormuz → Arabian Sea →
Gulf of Aden → Bab al-Mandeb → Red Sea → Suez corridor behind the home first screen. Each of the three
lanes is drawn in its current status colour. It replaces the earlier particle field, so three.js is no
longer loaded on any page. Nothing else imports `three`, so a human can remove it from package.json.

## What a visitor gets

| Visitor | Backdrop |
|---|---|
| Everyone, from first paint | CSS gradient (`.hero-scene`, server-rendered) |
| After load, on screen and idle, except Save-Data | Static SVG relief (coastline, 5° graticule, lane lines) |
| Also: no reduced motion, viewport ≥ 768 px, ≥ 4 cores, ≥ 4 GB device memory (or unknown), hardware WebGL | Raw-WebGL relief over the SVG, cross-faded in |

- **Gate:** `lib/hero-3d.ts`, using `heroSceneMode`, which is built on `hero3DDecision` and `heroReliefMode`. Software rasterisers (SwiftShader, llvmpipe and others) are still rejected by renderer string. Headless Chromium, and therefore Lighthouse and PageSpeed, gets the SVG.
- **Motion:** the camera drifts about 5° over at most 5 s and settles on exactly the SVG's view. Then the loop stops for good. The drift clock pauses while the tab is hidden or the hero is off-screen (IntersectionObserver). With reduced motion there is no WebGL, and the SVG appears without a fade.
- **Layout:** everything is absolutely positioned inside the fixed-height `.hero-scene` box, so its CLS contribution is 0. The LCP element is unchanged: inline SVG and canvas are not LCP candidates, and both mount after load.
- **Accessibility:** `aria-hidden`, with no text inside. The CorridorStrip prints every status as text.
- **RTL:** the map is never mirrored. It uses `direction: ltr`, has no transforms, and east stays on the right.

## Lane colours

- **One view per render:** `app/page.tsx` computes the corridors view once with `getCorridors(new Date())` from `lib/corridors.ts` over `data/chokepoints/latest.json`.
- **Shared:** that same view goes to the CorridorStrip (`view=`) and, through `reliefLaneStyles(view)`, to HomeDashboard → HeroScene → ReliefLayer as plain props.
- **No client-side status:** the browser never reads the corridor file or the visitor's clock. The relief and the strip therefore cannot disagree. `tests/unit/hero-relief.check.ts` renders both from the same view and compares them lane by lane.
- **Mapping:** a lane takes the token `--status-<status>`, the same token as `StatusChip`.
- **Stale or withheld view:** every lane is `UNKNOWN`, drawn in `--status-unknown` and dashed, exactly as the CorridorStrip prints it.
- **Connector:** the Arabian Sea / Gulf of Aden connector is not a status lane, so it is always `--muted` and dotted.
- **Top fade:** the relief wrapper is transparent for its first 72 px and fully drawn from 128 px. No line crosses the ticker row, and text contrast there matches main.

## Geometry: source and licence

- **Data:** ETOPO1 1 arc-minute global relief model, ice surface, grid-registered. By NOAA NGDC (now NCEI); Amante, C. and B. W. Eakins (2009), *ETOPO1 1 Arc-Minute Global Relief Model: Procedures, Data Sources and Analysis*, NOAA Technical Memorandum NESDIS NGDC-24, doi:10.7289/V5C8276M.
- **Licence:** public domain, because it is a work of the US federal government (17 U.S.C. §105) and NOAA publishes it without restriction. NOAA's ERDDAP serves it with: "The data may be used and redistributed for free but is not intended for legal use, since it may contain inaccuracies."
- **Deprecated source:** NOAA has deprecated ETOPO1 and superseded it with ETOPO 2022 (15 arc-second). At 0.15° the difference is not visible. If the relief is regenerated, switching to ETOPO 2022 means a new subset URL in the generator.
- **Retrieved from:** NOAA ERDDAP dataset `etopo180` (`https://upwell.pfeg.noaa.gov/erddap/griddap/etopo180`), every 9th sample (0.15°) over 31–61.9°E × 9–31.95°N, giving 207 × 154 points.
- **Coastline:** the 0 m contour of the same grid. Ground below sea level that does not connect to the open sea (the Dead Sea, the Danakil depression) counts as land.
- **Lane lines:** schematic route lines through the usual sea lanes (`RELIEF_LANES` in `model.ts`), not traffic data. The generator fails if a non-canal point is not over open sea. At this resolution the Suez Canal (about 300 m wide) is on land, so its points are marked `canal`.

Nothing is fetched from a third party at runtime. The committed assets are:

| File | What | Size |
|---|---|---|
| `public/relief/corridor-relief.v1.bin` | Heightfield: `CR\x01`, uint16 LE width and height, then one byte per point with per-row delta coding, gzip-compressed | 19,304 B |
| `components/home/relief/poster.generated.ts` | SVG path data (rest camera, 1440 × 440 viewBox) | 3,974 B (1,943 B gzip) |

### Regenerate

```sh
NODE_USE_ENV_PROXY=1 npx --yes tsx@4.23.13 data/relief/build-relief.ts   # downloads the subset
npx --yes tsx@4.23.13 data/relief/build-relief.ts saved.csv              # or reads a saved copy
```

The output is byte-identical for the same input, because the gzip mtime is zeroed. If you change
`GRID`, the camera or the lanes in `model.ts`, regenerate both files together.

## Budget

At most 60 KB gzip in total for the relief, on top of the home page: every chunk reachable from HeroScene's lazy import, plus the heightfield.

`tests/unit/hero-relief.check.ts` measures this from `.next`:
- It follows the `react-loadable-manifest.json` chain from `components/home/HeroScene` recursively (HeroScene → ReliefLayer → relief-gl, and any import added later).
- It then follows every webpack chunk those files load (`.e(<id>)`), mapped through the webpack runtime.
- It fails if a relief chunk is in the home page's initial load.
- It counts every file in `public/relief/` (all of it, as served), not only the heightfield.

**Browser test.** `tests/e2e/hero-relief.spec.ts` runs against a running server (`PW_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/hero-relief.spec.ts`). It checks three things:
- Under reduced motion, on a simulated capable GPU, the relief stays a static poster: no fade, no canvas, and `data-relief-motion="reduced"`.
- Without reduced motion, WebGL starts.
- The relief lanes match the strip's chips.

**The budget is not enforced in CI yet.** PR CI runs unit tests before `next build`, so the check skips there. Enforcing it needs a human to add a step after the build in `.github/workflows/pr-ci.yml`, which is a human-only path:

```sh
RELIEF_REQUIRE_BUILD=1 npx --yes tsx@4.23.13 tests/unit/hero-relief.check.ts
```

Measured on this branch (see the commit message for the current figures):

| Asset | Gzip size |
|---|---|
| Layer and poster chunk | about 3 KB |
| WebGL chunk | about 3.6 KB |
| Heightfield | 19.3 KB |
| **Total** | **about 26 KB** |

The corridor status is computed on the server, so `lib/corridors` and the JSON files are no longer in any relief chunk.

## Files

- `app/page.tsx`: computes the one corridors view (strip and relief)
- `components/home/HeroScene.tsx`: gate (`heroSceneMode` in `lib/hero-3d.ts`) and mount
- `components/home/relief/model.ts`: grid, encoding, camera, lanes, status mapping (pure)
- `components/home/relief/ReliefLayer.tsx`: poster, top fade, WebGL loader
- `components/home/relief/ReliefPoster.tsx`: the static SVG
- `components/home/relief/relief-gl.ts`: raw WebGL 1 renderer (`laneDrawParams` and `driftStep` are pure and tested)
- `components/home/relief/poster.generated.ts`: generated
- `data/relief/build-relief.ts`: generator
- `public/relief/corridor-relief.v1.bin`: generated
- `tests/unit/hero-relief.check.ts` and `tests/unit/hero-3d.check.ts`: tests
