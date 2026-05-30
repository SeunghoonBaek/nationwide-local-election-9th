# Architecture

## File layout

```
src/
  lib/
    constants.ts        # sgId, election type codes & groupings (shared by client + server)
    nec.ts              # NEC Open API client (server-only): fetch, pagination, parsing
    controversies.ts    # match manual controversy data to a candidate
  data/
    controversies.json  # manually curated controversy/trait data (with sources)
  app/
    api/
      sido/route.ts       # GET -> province list
      gusigun/route.ts    # GET ?sgType&sido -> district (gu/si/gun) list
      sgg/route.ts        # GET ?sgType&sido&gusigun -> electoral-district list
      candidates/route.ts # GET ?sgType&sido&sgg -> candidates + pledges + controversies
    page.tsx            # client UI: cascading selectors + comparison table
    layout.tsx          # metadata (Korean)
scripts/
  check-nec.mjs         # standalone key / connectivity checker (npm run check-nec)
```

## Why API routes (a server proxy)

The NEC service key must not reach the browser. All NEC calls happen in
server-side route handlers under `src/app/api/*`, which also avoids CORS and lets
us cache responses. The client only talks to our own `/api/*` endpoints.

## Data flow

```
Browser (page.tsx)
  -> /api/sido                         -> getSidoList()
  -> /api/gusigun?sgType&sido          -> getGusigunList()
  -> /api/sgg?sgType&sido&gusigun      -> getSggList()
  -> /api/candidates?sgType&sido&sgg   -> getCandidates() + getPledges()/candidate
                                          + getCandidateExtra() (controversies)
```

## Cascading region selection (page.tsx)

1. **시·도 (province)** – from `getSidoList()` (complete list, 17).
2. **선거 종류 (election type)** – from `SELECTABLE_SG_TYPES`.
3. **구·시·군 (district)** – skipped for province-wide types (`TYPES_SIDO_WIDE`
   = 3, 8, 11); for those, the electoral district equals the province name.
4. **선거구 (electoral district)** – chosen, then candidates are fetched.

District (gusigun) and electoral-district (sgg) options are **both derived from
the same election-type code list** (`getCommonSggCodeList` for that `sgTypecode`),
using `wiwName` for the district level and `sggName` for the electoral district.
This keeps the two dropdowns consistent (e.g. provincial-council districts live
under general-gu names like `수원시장안구`, not `수원시`).

## Key client/server split

`constants.ts` holds values needed on both sides (election type labels, code
groupings). `nec.ts` imports `server-only`, so it can never be bundled into the
client; the client imports election labels from `constants.ts` instead.
