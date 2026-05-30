# Overview

**9th Nationwide Local Election – Candidate & Pledge Comparison** (election day 2026-06-03).

A web app where a user selects their region and compares the candidates of that
electoral district in a table: **party (affiliation), pledges, traits
(career/job/education), and controversies**.

- Data source: National Election Commission (NEC) Open API on data.go.kr
  (election id `sgId = 20260603`).
- Stack: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4.
- Language policy: the **on-screen UI is Korean** (Korean voters are the audience);
  **code, docs, tooling, and console output are English**. User-facing error
  strings that surface in the browser are intentionally kept in Korean.

## Status

End-to-end working against live NEC data. Validated election types:

| Type code | Election | Validated example |
|-----------|----------|-------------------|
| 3 | Metropolitan/Provincial mayor (시·도지사) | Seoul mayor (정원오, 오세훈) + pledges |
| 5 | Provincial council (시·도의원) | Gyeonggi Suwon District 1 (최상규, 이필근) |
| 4 | Local head (구·시·군의 장) | Suwon mayor (이재준) + pledges |
| 11 | Superintendent of education (교육감) | Seoul (김영배 et al.) + pledges |

## Quick start

```bash
make setup   # install deps + create .env.local (set NEC_SERVICE_KEY)
make check   # verify the key / API connectivity
make dev     # http://localhost:3000
```

See `docs/nec-api.md` for the API integration details and `docs/architecture.md`
for the code layout. `docs/worklog.md` records the key findings and decisions.

## Known follow-ups

- `controversies` data is empty; it is manually curated in
  `src/data/controversies.json` (not available from any official API).
- Superintendent (교육감) candidates have no party/ballot number; the UI currently
  shows the party cell as "무소속" — could be hidden for that type.
- Assets / military service / criminal records are not in this API (would require
  separate collection from NEC election bulletins on policy.nec.go.kr).
