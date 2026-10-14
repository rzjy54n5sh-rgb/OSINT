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

- **Gate:** `lib/hero-3d.ts`, using `hero3DDecision` and `heroReliefMode`. Software rasterisers (SwiftShader, llvmpipe and others) are still rejected by renderer string. Headless Chromium, and therefore Lighthouse and PageSpeed, gets the SVG.
- **Motion:** the camera drifts about 5° over at most 5 s and settles on exactly the SVG's view. Then the loop stops for good. The drift clock pauses while the tab is hidden or the hero is off-screen (IntersectionObserver). With reduced motion there is no WebGL, and the SVG appears without a fade.
- **Layout:** everything is absolutely positioned inside the fixed-height `.hero-scene` box, so its CLS contribution is 0. The LCP element is unchanged: inline SVG and canvas are not LCP candidates, and both mount after load.
- **Accessibility:** `aria-hidden`, with no text inside. The CorridorStrip prints every status as text.
- **RTL:** the map is never mirrored. It uses `direction: ltr`, has no transforms, and east stays on the right.

## Lane colours

- **Source of truth:** `lib/corridors.ts` over `data/chokepoints/latest.json`, evaluated in the browser when the relief mounts.
- **Mapping:** `reliefLaneStyles` in `components/home/relief/model.ts`. A lane takes its status token `--status-<status>`, the same token as `StatusChip`.
- **Stale or withheld view:** every lane is `UNKNOWN`. It is drawn in `--status-unknown`, dashed, exactly as the CorridorStrip treats stale data.
- **Connector:** the Arabian Sea / Gulf of Aden connector is not a status lane, so it is always `--muted` and dotted.
- **Visitor clock:** a wrong clock can only push the view to stale or withheld, which is neutral. It never pushes it to a status the strip does not show.

## Geometry: source and licence

- **Data:** ETOPO1 1 arc-minute global relief model, ice surface, grid-registered. By NOAA NGDC (now NCEI); Amante, C. and B. W. Eakins (2009), *ETOPO1 1 Arc-Minute Global Relief Model: Procedures, Data Sources and Analysis*, NOAA Technical Memorandum NESDIS NGDC-24, doi:10.7289/V5C8276M.
- **Licence:** a US Government work, in the public domain. NOAA's ERDDAP serves it with: "The data may be used and redistributed for free but is not intended for legal use, since it may contain inaccuracies."
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

At most 60 KB gzip in total for the relief, on top of the home page: the lazy chunks plus the heightfield.

`tests/unit/hero-relief.check.ts` measures this from `.next` and fails if any relief chunk is in the
home page's initial load. It skips without a build. CI runs unit tests before `next build`, so set
`RELIEF_REQUIRE_BUILD=1` after a build to enforce it.

Measured on this branch:

| Asset | Gzip size |
|---|---|
| Layer, poster and `lib/corridors` chunk | 11.7 KB |
| WebGL chunk | 3.4 KB |
| Heightfield | 19.3 KB |
| **Total** | **34.4 KB** |
| Home page chunk (HeroScene changes) | +0.26 KB |

## Files

- `components/home/HeroScene.tsx`: gate and mount
- `components/home/relief/model.ts`: grid, encoding, camera, lanes, status mapping (pure)
- `components/home/relief/ReliefLayer.tsx`: status, poster, WebGL loader
- `components/home/relief/ReliefPoster.tsx`: the static SVG
- `components/home/relief/relief-gl.ts`: raw WebGL 1 renderer
- `components/home/relief/poster.generated.ts`: generated
- `data/relief/build-relief.ts`: generator
- `public/relief/corridor-relief.v1.bin`: generated
- `tests/unit/hero-relief.check.ts` and `tests/unit/hero-3d.check.ts`: tests
