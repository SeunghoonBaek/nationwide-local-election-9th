# Work log

Chronological record of what was built and the key decisions/findings.

## 1. Feasibility research

- Confirmed the data is available from NEC Open API on data.go.kr (free,
  dev-account auto-approved): candidate info, pledges, code info, winners.
- Confirmed `sgId = 20260603` and the `sgTypecode` set for the 9th local election.
- Determined "controversies/traits" are **not** in any official API → must be
  supplemented via curated JSON (sourced, neutral, with links).

## 2. Initial build

- Scaffolded Next.js 16 + TS + Tailwind v4.
- `lib/nec.ts` (server-only) API client; `lib/constants.ts` shared codes.
- API proxy routes `sido / gusigun / sgg / candidates` to protect the key.
- `page.tsx`: cascading selectors + candidate comparison table.
- `controversies.json` + matcher; key-missing banner; sources/disclaimer footer.
- Added README, `.env.local.example`, `scripts/check-nec.mjs`, Makefile,
  `.vscode/launch.json`.

## 3. Decisions captured along the way

- Controversies: no automated news scraping (legal/neutrality); JSON + sources.
- Region scope: all 17 provinces, cascading selection.
- Rejected scraping info.nec.go.kr / policy.nec.go.kr as a **primary** data path
  (ViewState, fragile) — Open API preferred where available.
- Language: on-screen UI Korean; code/docs/tooling/console English.

## 4. Live key integration & bug fixes

After the NEC API key activated, several issues were fixed:

1. **Response shape** – `response.body.items.item`; legacy fallback in `parsePage()`.
2. **Pagination** – gateway caps at 100 rows/page; `callNec()` loops until `totalCount`.
3. **Candidate operation** – preliminary → registered candidate API (`getPofelcdd…`).
4. **Province list** – full gu/si/gun code list → all 17 provinces (incl. 전라남도).
5. **District consistency** – gusigun + sgg from same code list (`wiwName` / `sggName`).
6. **No-data codes** – `INFO-03` → empty result, not an error.
7. **Endpoints** – HTTPS base URL and operation names aligned with data.go.kr.

Validated: types 3, 4, 5, 11 with live Seoul / Suwon examples.

## 5. Candidate photos

- Open API has **no photo field**.
- Implemented `lib/candidate-photo.ts`: fetch `info.nec.go.kr` candidate detail HTML,
  parse `cdn.nec.go.kr/photo_{sgId}/…/thumbnail.{huboid}.JPG`.
- Strip `?ver=` query for `next/image` compatibility.
- `next.config.ts`: `remotePatterns` for `cdn.nec.go.kr`.
- UI: thumbnail beside candidate name.

## 6. Responsive layout

- Removed narrow `max-w-6xl` cap; container up to 1920px.
- Mobile/tablet: candidate **cards**; desktop: proportional **table**.
- Selectors and search button full-width on small screens.
- `layout.tsx`: explicit viewport meta.

## 7. Deployment & repository

- Pushed to [SeunghoonBaek/nationwide-local-election-9th](https://github.com/SeunghoonBaek/nationwide-local-election-9th).
- **Vercel** production deploy; auto-build on `main` push.
- **GitHub Pages not used** — requires server API routes + secret key (see `deployment.md`).

## 8. Controversies & tags data pipeline

- Added `scripts/build-controversies.mjs` (`npm run build-controversies`).
- **Tags:** parsed from NEC `job` / `career1` / `career2`.
- **Namuwiki controversies:** topic list from wiki “비판·논란” subpages — only for
  sgType **3 / 4 / 11** (governors, major mayors, superintendents); ~33 hits.
- **Council expansion (sgType 5 / 6):** bulk NEC fetch (~6,264 candidates);
  **tags only** (~5,950 JSON rows); Namuwiki skipped at this scale.
- UI: hide 논란·이슈 section when empty.

## 9. Supplementary pledge sources

### Manual fallback (`pledges-manual.json`)

**Problem:** For `sgTypecode=6`, the pledge Open API often returns `INFO-03` for
every candidate even when election bulletins exist on policy.nec.go.kr.

**Solution:** Same pattern as controversies — `src/lib/pledges-manual.ts` matches
`src/data/pledges-manual.json` by `sido` / `sgg` / `name` when API pledges are empty.

**Build** (`make pledges` → `scripts/build-pledges-manual.mjs`):

1. List Suwon type-6 candidates via Open API; skip rows with API pledges.
2. Scrape `council.suwon.go.kr/member/{id}/promise.do` for incumbents (IDs in
   `scripts/suwon-council-member-ids.txt`).
3. Parse only `<div class="promisebox">` (fixed early bug that ingested JS from HTML).
4. Merge `scripts/pledges-news-supplements.json` for challengers (news interviews).
5. Emit JSON with `pledgeSource` for UI attribution.

**Coverage (May 2026):** 19/51 Suwon local-council candidates; **수원시마선거구 6/6**.

Utility scripts: `scan-missing-pledges.mjs`, `verify-pledges.mjs`.

### Policy-site bulletin links (`policy-nec.ts`)

**Goal:** Link every candidate to the official 공약마당 선거공보, not only when
structured pledge text is missing.

**Discovery:** `policy.nec.go.kr` commiment UI uses same-origin POST JSON
(`initUCACommimentRegion/Sgg/List.do`). Works with Referer header; `menuId=CNDDT25`
(9th local election). Direct `CNDDT20` URLs return “비정상적 접근”.

**Implementation:**

- Map `sgTypecode` → `subSgId` (e.g. `6` → `620260603`).
- Resolve province → district → candidate list; match `huboid` to `cnddtId`.
- Parse `fileinfo` → `https://cdn.nec.go.kr/policy_pdf/{path}`.
- District deep link with `psggid`, `psidoId`, `psubSgId`, `psgId`.
- Cache per `{sgType}:{sido}:{sgg}`; attach `pledgePolicy` to **all** candidates.

**UI:** `CandidatePledges` shows structured pledges when available, plus
**「공약 포스터(선거공보) 보기」** and **「공약마당」** for every candidate with
policy data.

### `/api/candidates` merge order

1. NEC Open API pledges  
2. Manual fallback if empty  
3. Policy bulletin link (always, per district lookup)

## Open items

- Hide party/ballot cell for superintendent (교육감) rows.
- Friendlier HTTP 401 vs 403 error copy.
- Broader manual pledge coverage outside Suwon (~32 Suwon challengers still without manual text).
- Policy commiment list: paginate `pageIndex` if a district exceeds one page.
- Open API pledge body field typo (`prmsCont1`) — content parsing follow-up.
- Optional Namuwiki pass for notable council incumbents only (not full 6k scrape).
