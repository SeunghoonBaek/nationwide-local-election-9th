# Data curation (non-API sources)

Official NEC Open API covers candidates, pledges (when registered), and region codes. Everything below is **supplementary** and lives in JSON or is resolved at request time from other NEC web properties.

## Candidate photos

| Item | Detail |
|------|--------|
| Source | `info.nec.go.kr` candidate detail page → `cdn.nec.go.kr/photo_{sgId}/…` |
| Module | `src/lib/candidate-photo.ts` |
| When | On each `/api/candidates` request (cached in-memory + Next fetch cache) |
| UI | Thumbnail next to the candidate name (`next/image`) |

Photos are **not** in the Open API. The detail page HTML is fetched server-side; the CDN thumbnail URL is parsed and returned as `photoUrl`.

## Controversies & tags (`controversies.json`)

| Item | Detail |
|------|--------|
| File | `src/data/controversies.json` (~1.6 MB, committed) |
| Matcher | `src/lib/controversies.ts` → merged in `/api/candidates` |
| Rebuild | `npm run build-controversies` (`scripts/build-controversies.mjs`) |

### Scope (as of 2026-05-30)

| sgType | Election | Records | Tags | Namuwiki controversies |
|--------|----------|---------|------|------------------------|
| 3 | 시·도지사 | 49 | NEC careers | Yes |
| 11 | 교육감 | 54 | NEC careers | Yes |
| 4 | 구·시·군의 장 (major cities) | 103 | NEC careers | Yes |
| 5 | 시·도의원 | 1,657 | NEC careers | No |
| 6 | 구·시·군의원 | 4,401 | NEC careers | No |

- **6,264** candidates indexed; **5,950** JSON rows (rows with neither tags nor controversies are omitted).
- **33** candidates have Namuwiki controversy topic lists (governors / superintendents / major mayors with a wiki “비판·논란” subpage).

### Tag extraction

Parsed from NEC API `job`, `career1`, `career2` — e.g. `(현)경기도의회 의원`, `국회의원 경력`, `변호사`.

### Namuwiki controversies

For sgType **3 / 4 / 11** only (scale + low wiki coverage for council races):

1. Fetch `https://namu.wiki/w/{name}`
2. Find subpages whose title matches `논란|비판|사건|…`
3. Parse numbered topic list from the subpage
4. Store topic title + link as `source` / `sourceName: "나무위키"`

Entries are **topic indexes**, not full article text. Users follow the link for detail.

### Manual edits

You can still append items by hand. Required shape:

```json
{
  "match": { "sido": "서울특별시", "sgg": "서울특별시", "name": "홍길동" },
  "tags": ["3선 도전"],
  "controversies": [
    {
      "summary": "Neutral one-line summary",
      "date": "2026-05",
      "source": "https://…",
      "sourceName": "Source label"
    }
  ]
}
```

`match.name` is required. Re-run `npm run build-controversies` to regenerate from NEC + Namuwiki (overwrites the file).

### UI behaviour

- Tags appear under **특징**.
- **논란·이슈** column/section is hidden when `controversies` is empty (common for council members).

## Manual pledges (`pledges-manual.json`)

When the NEC pledge API returns nothing (typical for many **구·시·군의원** races), the app falls back to curated pledge text.

| Item | Detail |
|------|--------|
| File | `src/data/pledges-manual.json` |
| Module | `src/lib/pledges-manual.ts` |
| Rebuild | `make pledges` → `scripts/build-pledges-manual.mjs` |
| Member IDs | `scripts/suwon-council-member-ids.txt` (incumbent councillors) |
| Supplements | `scripts/pledges-news-supplements.json` (challenger news/interviews) |
| Utilities | `scripts/scan-missing-pledges.mjs`, `scripts/verify-pledges.mjs` |

### Build pipeline (`make pledges`)

1. Fetch all Suwon `sgType 6` candidates via Open API.
2. Skip candidates who already have API pledges.
3. Scrape `council.suwon.go.kr/member/{id}/promise.do` — parse only `<div class="promisebox">` (avoids JS noise in raw HTML).
4. Merge news supplements for challengers without council pages.
5. Write `src/data/pledges-manual.json` with `pledgeSource` for UI attribution.

### Coverage (May 2026)

- **19 / 51** Suwon local-council candidates with manual pledge text.
- **수원시마선거구 6 / 6** complete (incumbents from council site; challengers from press).

Matching rules: same as controversies — partial `sido` / `sgg` / `name` match; `name` required.

## Policy-site pledge links (`policy-nec.ts`)

Official election bulletins (선거공보) and the policy·pledge portal for **every candidate** in a district — not only when structured pledges are missing.

| Item | Detail |
|------|--------|
| Site | [policy.nec.go.kr](https://policy.nec.go.kr) commiment JSON API |
| Module | `src/lib/policy-nec.ts` |
| When | Once per district on `/api/candidates` (in-memory cache, 6 h revalidate) |
| Output | `pledgePolicy.pageUrl` (district deep link), `pledgePolicy.bulletinUrl` (CDN PDF when published) |

### How it works

1. `POST initUCACommimentRegion.do` — province name → `wiwid` (e.g. 경기도 → `4100`).
2. `POST initUCACommimentSgg.do` — list electoral districts; match app `sgg` name.
3. `POST initUCACommimentList.do` — candidates with `huboid` + `fileinfo`.
4. Parse `fileinfo` (e.g. `선거공보||20260603/PDF/PBINFO/4102/003_{huboid}_….pdf||…`) →  
   `https://cdn.nec.go.kr/policy_pdf/{path}`.

`subSgId` for the 9th local election maps from `sgTypecode` (e.g. `6` → `620260603`, `menuId=CNDDT25`). Full parameter table: [nec-api.md](./nec-api.md#policy-site-supplement-policynecgo.kr).

### UI

Under the pledge column (`CandidatePledges` in `page.tsx`):

- Structured pledge list when API or manual data exists.
- **「공약 포스터(선거공보) 보기」** → bulletin PDF (when published).
- **「공약마당」** → district page on policy.nec.go.kr.

If no PDF yet, only the policy-site link is shown.
