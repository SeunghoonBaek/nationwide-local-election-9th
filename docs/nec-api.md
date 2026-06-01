# NEC Open API integration notes

Provider code `9760000` on data.go.kr. Base: `https://apis.data.go.kr/9760000`.
All calls include `serviceKey`, `resultType=json`, `numOfRows`, `pageNo`, `sgId`.

## Election identifiers

- `sgId = 20260603` – 9th nationwide local election (2026-06-03). The
  **국회의원 재·보궐선거** (National Assembly by-election) held the same day shares
  this `sgId`; it is distinguished only by `sgTypecode = 2`.
- `sgTypecode` (election type):

| Code | Election | Region granularity |
|------|----------|--------------------|
| 2 | 국회의원 재·보궐선거 (National Assembly by-election) | within gu/si/gun (constituency) |
| 3 | 시·도지사 (governor/mayor) | province-wide |
| 4 | 구·시·군의 장 (local head) | per gu/si/gun |
| 5 | 시·도의원 (provincial council) | within gu/si/gun |
| 6 | 구·시·군의원 (local council) | within gu/si/gun |
| 8 | 비례대표 광역의원 (proportional, metro) | province-wide |
| 9 | 비례대표 기초의원 (proportional, basic) | within gu/si/gun |
| 11 | 교육감 (superintendent) | province-wide |

Proportional types (7/8/9) are party votes; the UI excludes them from the
district flow (`SELECTABLE_SG_TYPES = [3, 11, 4, 5, 6, 2]`).

### 국회의원 재·보궐선거 (sgTypecode 2)

Only the **14 constituencies** where a seat fell vacant by 2026-04-30 appear for
`sgId=20260603&sgTypecode=2` (the rest of the country has no by-election). Because
`getCommonSggCodeList`/candidate calls are filtered by this `sgId`, the live API
returns only those seats — no hardcoded district list is needed.

| Province (시·도) | Constituency (선거구) | Type |
|------------------|-----------------------|------|
| 부산광역시 | 북구갑 | 보궐 |
| 대구광역시 | 달성군 | 보궐 |
| 인천광역시 | 연수구갑 | 보궐 |
| 인천광역시 | 계양구을 | 보궐 |
| 광주광역시 | 광산구을 | 보궐 |
| 울산광역시 | 남구갑 | 보궐 |
| 경기도 | 평택시을 | 재선거 |
| 경기도 | 안산시갑 | 재선거 |
| 경기도 | 하남시갑 | 보궐 |
| 충청남도 | 공주시·부여군·청양군 | 보궐 |
| 충청남도 | 아산시을 | 보궐 |
| 전라북도 | 군산시·김제시·부안군갑 | 재선거 |
| 전라북도 | 군산시·김제시·부안군을 | 보궐 |
| 제주특별자치도 | 서귀포시 | 보궐 |

Multi-county constituencies (공주·부여·청양, 군산·김제·부안) are returned once per
member `wiwName`, so the gu/si/gun → 선거구 narrowing in the UI works the same as
for local-council races. Mayoral by-elections (시장·군수·구청장 보궐) are **not** a
separate type — they are part of `sgTypecode = 4` (구·시·군의 장) and show up
automatically in those districts.

> The policy-site bulletin link map (`policy-nec.ts`, `SUB_SG_ID`) does not yet
> include `sgTypecode 2`, so by-election candidates show NEC API pledges/photos
> but no 공약 포스터 deep link. Add a `subSgId` for type 2 if/when the
> policy.nec.go.kr menu for the by-election is confirmed.

## Endpoints used

| Purpose | Service / operation | Required params |
|---------|---------------------|-----------------|
| Province / district codes | `CommonCodeService/getCommonGusigunCodeList` | `sgId` (`sdName` optional) |
| Electoral district codes | `CommonCodeService/getCommonSggCodeList` | `sgId`, `sgTypecode` |
| Candidates (registered) | `PofelcddInfoInqireService/getPofelcddRegistSttusInfoInqire` | `sgId`, `sgTypecode` (+ `sdName`, `sggName`) |
| Pledges | `ElecPrmsInfoInqireService/getCnddtElecPrmsInfoInqire` | `sgId`, `sgTypecode`, `cnddtId` |

> Candidate API gotcha: `getPo**el**pcddRegistSttusInfoInqire` is the
> **preliminary** candidate operation (not available once registration opens).
> Use `getPo**fe**lcddRegistSttusInfoInqire` for registered candidates.

## Response shape (JSON)

```jsonc
{
  "response": {
    "header": { "resultCode": "INFO-00", "resultMsg": "NORMAL SERVICE" },
    "body": {
      "items": { "item": [ { /* row */ } ] },  // object (not array) if a single row
      "numOfRows": 100, "pageNo": 1, "totalCount": 795
    }
  }
}
```

- Success: `resultCode == "INFO-00"`.
- No data: `INFO-03` (and `INFO-200`) – treat as empty result, **not** an error.
- **Local council (type 6):** as of May 2026, most candidates return `INFO-03`
  even when election bulletins are published on policy.nec.go.kr. The app uses
  manual fallback + policy-site bulletin links for those cases.
- Unregistered/invalid key: plain-text `Unauthorized` (HTTP 401), or an
  `OpenAPI_ServiceResponse.cmmMsgHeader` envelope.
- A single result may come back as an object instead of an array — normalize.

## Pagination (important)

The gateway **caps page size at 100** regardless of the requested `numOfRows`.
`getCommonSggCodeList` for `sgTypecode=5` returns `totalCount=795` but only 100
rows per page. `nec.ts#callNec` therefore loops `pageNo` until all
`totalCount` rows are collected (`PAGE_SIZE = 100`, `MAX_PAGES = 200` guard).

## Field mapping

Candidate (`getPofelcdd...`): `huboid`→cnddtId, `giho`, `jdName`→party,
`name`, `hanjaName`, `gender`, `birthday`, `age`, `job`, `edu`,
`career1`, `career2`, `status`, `sggName`, `sdName`.

Pledge (`getCnddtElecPrms...`): `prmsCnt`, then per index `i`:
`prmsOrd{i}`, `prmsRealmName{i}`→realm, `prmsTitle{i}`→title,
`prmsCont{i}`/`prmsMainTitle{i}`→content.

## Auth quirks observed

- New key returned HTTP 401 `Unauthorized` for all APIs before approvals existed.
- After applying for the APIs, calls returned HTTP **403 `Forbidden`** for a
  while — approval registered but **not yet propagated to the gateway**
  (typically clears in ~30–60 min). `check-nec.mjs` labels 403 as "PENDING".
- Egress IP must be reachable to data.go.kr; a bogus key (401) vs real key (403)
  comparison distinguishes IP/WAF blocks from key-state issues.

## Data quirk: merged Gwangju–Jeonnam

For 2026 the governor (type 3) district list returns **16** entries, where the
Gwangju/Jeonnam region appears as `전남광주통합특별시` under `sdName=광주광역시`.
Because of this, the province dropdown is built from the (complete)
gu/si/gun code list instead of governor districts, so all 17 provinces —
including `전라남도` — are selectable.

## Policy site supplement (policy.nec.go.kr)

Not part of data.go.kr, but used by `src/lib/policy-nec.ts` to attach **election
bulletin (선거공보) PDF links** to every candidate. The official commiment UI
loads data via same-origin POST JSON endpoints; we call those server-side with a
Referer header (no session cookie required for read-only list calls).

| Step | Endpoint | Purpose |
|------|----------|---------|
| Bootstrap | `GET /plc/commiment/initUCACommiment.do?menuId=CNDDT25` | warm path (optional) |
| Province | `POST initUCACommimentRegion.do` | `sgId`, `subSgId` → region list |
| Districts | `POST initUCACommimentSgg.do` | `wiwsidocode` → `sgglist[]` |
| Candidates | `POST initUCACommimentList.do` | `hRegionId`, `hSggId`, `sgTypecode` → rows |

**`subSgId` (policy menu election id)** maps from our `sgTypecode`:

| sgTypecode | subSgId | Election |
|------------|---------|----------|
| 3 | `320260603` | 시·도지사 |
| 4 | `420260603` | 구·시·군의 장 |
| 5 | `520260603` | 시·도의원 |
| 6 | `620260603` | 구·시·군의원 |
| 8 | `820260603` | 광역 비례 |
| 9 | `920260603` | 기초 비례 |
| 11 | `1120260603` | 교육감 |

**Row fields used:** `huboid` (matches Open API `cnddtId`), `fileinfo` (comma-
separated `label||pdfPath||…` segments). Bulletin URL:

```
https://cdn.nec.go.kr/policy_pdf/{pdfPath}
```

**District page URL** (deep link, opens commiment UI for that electoral district):

```
https://policy.nec.go.kr/plc/commiment/initUCACommiment.do
  ?menuId=CNDDT25&psgId=20260603&psubSgId={subSgId}&psidoId={wiwid}&psggid={sggid}
```

**Caching:** in-memory per `{sgType}:{sido}:{sgg}` for 6 hours (`next.revalidate`
on fetch). One list call covers all candidates in the district.

**Limitations:**

- Undocumented; could change without notice (same risk noted in worklog for
  scraping — mitigated by using the same JSON API the official site calls).
- Direct navigation to some commiment URLs without query params returns “비정상적
  접근”; always use the full parameter set above.
- List pagination: current code requests `pageIndex=1` only; very large districts
  may need paging if `totalCnt > page size` (not yet observed as a problem).
- Thumbnail in policy UI (`photo_{sgId}/{filename}`) is the **candidate portrait**,
  not the pledge poster; the bulletin PDF is the authoritative pledge document link.

## Manual pledge fallback (not NEC API)

When `getCnddtElecPrmsInfoInqire` is empty, `src/lib/pledges-manual.ts` matches
`src/data/pledges-manual.json` by `sido` / `sgg` / `name`. Rebuild for Suwon:

```bash
make pledges
```

Sources: Suwon city council `/member/{id}/promise.do` (incumbents), plus news
interviews in `scripts/pledges-news-supplements.json` (challengers).
