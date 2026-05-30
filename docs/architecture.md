# Architecture

## File layout

```
src/
  lib/
    constants.ts        # sgId, election type codes & groupings (shared by client + server)
    nec.ts              # NEC Open API client (server-only): fetch, pagination, parsing
    candidate-photo.ts  # Portrait URL from info.nec.go.kr → cdn.nec.go.kr
    controversies.ts    # Match tags/controversies from controversies.json
    pledges-manual.ts   # Manual pledge fallback when NEC API returns empty
    policy-nec.ts       # policy.nec.go.kr pledge bulletin links per district
  data/
    controversies.json  # Tags + Namuwiki controversy index (built; see data-curation.md)
    pledges-manual.json # Curated pledges (e.g. Suwon council)
  app/
    api/
      sido/route.ts       # GET → province list
      gusigun/route.ts    # GET ?sgType&sido → district list
      sgg/route.ts        # GET ?sgType&sido&gusigun → electoral-district list
      candidates/route.ts # GET ?sgType&sido&sgg → full candidate view
    page.tsx              # Client UI: selectors + responsive results
    layout.tsx            # Metadata, viewport, fonts
    globals.css
scripts/
  check-nec.mjs              # NEC key / connectivity check
  build-controversies.mjs    # Regenerate controversies.json
  build-pledges-manual.mjs   # Scrape Suwon council pledges + merge supplements
  scan-missing-pledges.mjs   # Audit districts missing NEC pledges
  verify-pledges.mjs         # Verify manual pledge data
next.config.ts               # next/image remotePatterns for cdn.nec.go.kr
```

## Why API routes (server proxy)

The NEC service key must not reach the browser. All NEC calls and secondary
fetches (info.nec.go.kr, policy.nec.go.kr) run in server route handlers under
`src/app/api/*`. The client only calls `/api/*`.

## Data flow

```
Browser (page.tsx)
  → /api/sido
  → /api/gusigun?sgType&sido
  → /api/sgg?sgType&sido&gusigun
  → /api/candidates?sgType&sido&sgg
       ├ getCandidates()           (NEC Open API)
       ├ getPledges() / candidate  (NEC; else pledges-manual.json)
       ├ getPolicyPledgeLinks()    (policy.nec.go.kr)
       ├ getCandidatePhotoUrl()    (info.nec.go.kr → CDN)
       └ getCandidateExtra()       (controversies.json)
```

## Cascading region selection (page.tsx)

1. **시·도** – `getSidoList()` (17 provinces).
2. **선거 종류** – `SELECTABLE_SG_TYPES` = 3, 11, 4, 5, 6.
3. **구·시·군** – skipped for province-wide types (`TYPES_SIDO_WIDE` = 3, 8, 11).
4. **선거구** – then fetch candidates.

District and electoral-district dropdowns share the same NEC code list (`wiwName` /
`sggName`) so labels stay consistent (e.g. `수원시장안구` not `수원시` for type 5).

### Location → 시·도 (시·도지사 / 교육감)

- `GET /api/location?address=…` — heuristic parse of the address prefix (no third-party key).
- `GET /api/location?lat=&lng=` — reverse geocode via Nominatim (server-side `User-Agent`).
- `src/lib/sido-names.ts` normalizes aliases (e.g. `서울` → `서울특별시`) against the NEC sido list.
- `src/lib/gusigun-names.ts` maps address/geocoder output to NEC admin `wiwName` (e.g. `수원시 장안구` → `수원시장안구`) via `getAdminGusigunList`.
- When the user picks an election type, `matchGusigunToElectionList` aligns the admin label with that type’s dropdown (type 4 may list one gu per split city).
- UI quick actions set `sgType` 3 or 11 and `sgg = sido` (province-wide races).

## UI layout

| Viewport | Candidate results |
|----------|-------------------|
| `< lg` (< 1024px) | Stacked **cards** per candidate |
| `≥ lg` | Full-width **table** with fixed column ratios |

- Page container: up to **1920px** wide with responsive padding.
- Candidate photo: 54×72px thumbnail (`next/image`).
- Empty **논란·이슈** blocks are not rendered.

## Key client/server split

`constants.ts` is safe on the client. Modules importing `server-only` (`nec.ts`,
`candidate-photo.ts`, `policy-nec.ts`) never ship to the browser.

JSON under `src/data/` is imported at build time into API routes / server helpers.
