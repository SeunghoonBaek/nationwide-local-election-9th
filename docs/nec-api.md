# NEC Open API integration notes

Provider code `9760000` on data.go.kr. Base: `https://apis.data.go.kr/9760000`.
All calls include `serviceKey`, `resultType=json`, `numOfRows`, `pageNo`, `sgId`.

## Election identifiers

- `sgId = 20260603` – 9th nationwide local election (2026-06-03).
- `sgTypecode` (election type):

| Code | Election | Region granularity |
|------|----------|--------------------|
| 3 | 시·도지사 (governor/mayor) | province-wide |
| 4 | 구·시·군의 장 (local head) | per gu/si/gun |
| 5 | 시·도의원 (provincial council) | within gu/si/gun |
| 6 | 구·시·군의원 (local council) | within gu/si/gun |
| 8 | 비례대표 광역의원 (proportional, metro) | province-wide |
| 9 | 비례대표 기초의원 (proportional, basic) | within gu/si/gun |
| 11 | 교육감 (superintendent) | province-wide |

Proportional types (7/8/9) are party votes; the UI excludes them from the
district flow (`SELECTABLE_SG_TYPES = [3, 11, 4, 5, 6]`).

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
