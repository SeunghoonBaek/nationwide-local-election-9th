# Work log

Chronological record of what was built and the key decisions/findings.

## 1. Feasibility research

- Confirmed the data is available from NEC Open API on data.go.kr (free,
  dev-account auto-approved): candidate info, pledges, code info, winners.
- Confirmed `sgId = 20260603` and the `sgTypecode` set for the 9th local election.
- Determined "controversies/traits" are **not** in any official API → must be
  manually curated (decided: sourced JSON, neutral, with links).

## 2. Initial build

- Scaffolded Next.js 16 + TS + Tailwind v4.
- `lib/nec.ts` (server-only) API client; `lib/constants.ts` shared codes.
- API proxy routes `sido / gusigun / sgg / candidates` to protect the key.
- `page.tsx`: cascading selectors + candidate comparison table.
- `controversies.json` + matcher; key-missing banner; sources/disclaimer footer.
- Added README, `.env.local.example`, `scripts/check-nec.mjs`, Makefile,
  `.vscode/launch.json`.

## 3. Decisions captured along the way

- Controversies: manual curation only (no auto news scraping) for legal/neutrality.
- Region scope: all 17 provinces, cascading selection.
- Considered scraping NEC web sites (policy.nec.go.kr / info.nec.go.kr) to avoid a
  key — rejected: session/ViewState/anti-bot protected, undocumented, fragile.
  The Open API is the same data via a stable, documented path.
- Language: on-screen UI Korean; code/docs/tooling/console English.

## 4. Live key integration & bug fixes

After the user applied for the 3 APIs and the key activated, real calls revealed
several issues, all fixed:

1. **Response shape** – actual payload is
   `response.body.items.item`; the parser assumed a different shape. Rewrote
   `parsePage()` to handle the standard data.go.kr structure (+ legacy fallback).
2. **Pagination** – gateway caps page size at 100 regardless of `numOfRows`
   (e.g. type 5 has `totalCount=795`). Added page loop in `callNec()`. This was
   the most impactful fix; without it, large regions silently lost data.
3. **Candidate operation** – switched from the preliminary-candidate op
   (`getPoelpcdd...`, unavailable after registration) to the registered-candidate
   op (`getPofelcdd...`).
4. **Province list** – governor (type 3) districts return 16 with a merged
   `전남광주통합특별시`. Switched the province list source to the complete
   gu/si/gun code list → all 17 provinces (incl. 전라남도).
5. **District consistency** – district (gusigun) and electoral-district (sgg)
   options are now both derived from the same election-type code list, matching on
   `wiwName` / `sggName` (fixes the `수원시` vs `수원시장안구` mismatch).
6. **No-data codes** – `INFO-03` now returns an empty result instead of throwing.
7. **Endpoints** – aligned to the user-provided `https://` base and exact
   operation names.

### Validation (live data)

| Type | Example | Result |
|------|---------|--------|
| 3 | Seoul mayor | 정원오, 오세훈 + pledges |
| 5 | Gyeonggi Suwon Dist.1 | 최상규, 이필근 |
| 4 | Suwon mayor | 이재준 + pledges |
| 11 | Seoul superintendent | 김영배 et al. + pledges |

Build is clean; `/` serves 200; `/api/*` return correct live data.

## Open items

- Populate `controversies.json` (per region, when chosen).
- Optional: hide party/ballot cell for superintendent (교육감) rows.
- Optional: friendlier message for HTTP 401 (invalid key) vs 403 (pending).
