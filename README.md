# 9th Nationwide Local Election - Candidate & Pledge Comparison (2026-06-03)

A web app that lets a user pick their region and compare the **candidates** of that electoral district by **party (affiliation), pledges, traits (career/job/education), and controversies** in a table.

- Data: National Election Commission (NEC) Open API on data.go.kr (election id `20260603`)
- Stack: Next.js (App Router) + TypeScript + Tailwind CSS
- Note: the on-screen UI is in Korean (targeted at Korean voters); code, docs, and tooling are in English.

## 1. Get an NEC API service key

1. Sign up / log in at [data.go.kr](https://www.data.go.kr)
2. Search for and **apply for use ("활용신청")** of these APIs (dev accounts are auto-approved, 10,000 calls/day):
   - Candidate info (`15000908`)
   - Election pledges (`ElecPrmsInfoInqireService`)
   - Code info (`15000897`)
3. In My Page, copy the **decoding key (일반 인증키(Decoding))**

> Newly approved keys can take ~30-60 minutes to propagate to the gateway. During that window calls may return HTTP 403.

## 2. Run

```bash
make setup     # install deps + create .env.local (then set NEC_SERVICE_KEY)
make check     # verify the key / API connectivity
make dev       # start dev server at http://localhost:3000
```

In the app: Province -> Election type -> (District) -> Electoral district, then "후보자 조회".

For **시·도지사** and **교육감**, use **「내 지역 찾기」**: enter an address or tap **현재 위치** to set your **시·도·구·시·군**, then **시·도지사 후보 조회** / **교육감 후보 조회** (no extra API key; GPS uses OpenStreetMap Nominatim server-side). For other election types, pick **선거 종류** and **선거구** after location lookup.

> Candidate/pledge data appears in the API only after candidate registration closes (about two weeks before election day).

When the NEC pledge API returns empty (common for local council races), the app falls back to `src/data/pledges-manual.json`. Rebuild it for all Suwon districts:

```bash
make pledges   # scrapes council.suwon.go.kr + merges scripts/pledges-news-supplements.json
```

Add challenger pledges from news interviews in `scripts/pledges-news-supplements.json`.

**All candidates** also get a link to the official election bulletin (선거공보 PDF) from [policy.nec.go.kr](https://policy.nec.go.kr) when published — see `docs/architecture.md` and `docs/nec-api.md`.

## 3. Controversies data (manual curation)

This qualitative info is not in the official API, so add it (with sources) in `src/data/controversies.json`.

```json
{
  "items": [
    {
      "match": { "sido": "서울특별시", "sgg": "서울특별시", "name": "홍길동" },
      "tags": ["3선 도전"],
      "controversies": [
        {
          "summary": "neutral 1-2 sentence factual summary",
          "date": "2025-11",
          "source": "https://...",
          "sourceName": "Some News"
        }
      ]
    }
  ]
}
```

- `match.name` is required (prevents broad matching by region alone). `sido`/`sgg` use partial matching.
- There is defamation / neutrality risk, so record only facts with verified sources.

## 4. Structure

```
src/
  lib/
    constants.ts        # election id, election type codes (shared with client)
    nec.ts              # NEC Open API client (server-only)
    pledges-manual.ts   # manual pledge fallback matcher
    policy-nec.ts       # policy.nec.go.kr bulletin PDF + page URLs
    candidate-photo.ts  # portrait URLs from info.nec.go.kr
    controversies.ts    # controversy data matching
  data/
    controversies.json
    pledges-manual.json
  app/
    api/sido|gusigun|sgg|candidates/route.ts   # API proxy (protects the key)
    page.tsx            # region selectors + candidate comparison table UI
scripts/
  check-nec.mjs           # key / connectivity check
  build-pledges-manual.mjs
  pledges-news-supplements.json
```

Details: [`docs/architecture.md`](docs/architecture.md), [`docs/nec-api.md`](docs/nec-api.md).

## 5. Limitations / notes

- Assets, military service, and criminal records are not in this API. If needed, collect them separately from the NEC policy site (policy.nec.go.kr) election bulletins.
- Proportional representation (metro/basic) is party-vote, so it is excluded from the district selection flow.
- This service is informational and does not endorse or oppose any candidate.
