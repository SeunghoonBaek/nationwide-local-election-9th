# Overview

**9th Nationwide Local Election – Candidate & Pledge Comparison** (election day 2026-06-03).

A web app where a user selects their region and compares the candidates of that
electoral district: **photo, party, pledges, traits (career/job/education), tags,
and controversies**.

- **Live data:** National Election Commission (NEC) Open API on data.go.kr (`sgId = 20260603`).
- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4.
- **Repo:** [github.com/SeunghoonBaek/nationwide-local-election-9th](https://github.com/SeunghoonBaek/nationwide-local-election-9th)
- **Deploy:** Vercel (auto-deploy on push to `main`). See [deployment.md](./deployment.md).
- **Language:** on-screen UI **Korean**; code, docs, and tooling **English**.

## Status

End-to-end against live NEC data. Validated election types:

| Type code | Election | Validated example |
|-----------|----------|-------------------|
| 3 | Metropolitan/Provincial mayor (시·도지사) | Seoul mayor (정원오, 오세훈) + pledges |
| 5 | Provincial council (시·도의원) | Gyeonggi Suwon District 1 (최상규, 이필근) |
| 4 | Local head (구·시·군의 장) | Suwon mayor (이재준) + pledges |
| 6 | Local council (구·시·군의원) | Suwon Ma district (6/6 manual + bulletin links) |
| 11 | Superintendent of education (교육감) | Seoul (김영배 et al.) + pledges |

### Feature summary

| Feature | Source |
|---------|--------|
| Region / candidate / pledge (API) | data.go.kr Open API |
| Candidate photo | info.nec.go.kr → cdn.nec.go.kr |
| Tags & controversies | `controversies.json` (see [data-curation.md](./data-curation.md)) |
| Pledge fallback | `pledges-manual.json` (Suwon council + news supplements) |
| Pledge poster / bulletin link | policy.nec.go.kr → `cdn.nec.go.kr/policy_pdf/…` (all candidates) |
| Responsive UI | Card layout (mobile/tablet), table (desktop ≥1024px) |

### Pledge data (three layers)

| Layer | Source | When used |
|-------|--------|-----------|
| 1. Structured text | NEC Open API (`getCnddtElecPrmsInfoInqire`) | Primary; works for mayor/governor/superintendent; often `INFO-03` for type 6 |
| 2. Manual fallback | `pledges-manual.json` | When layer 1 is empty; Suwon council + news (see [data-curation.md](./data-curation.md)) |
| 3. Bulletin link | `policy-nec.ts` → policy.nec.go.kr / CDN PDF | **Every candidate** in a district when the policy site has published a 선거공보 |

The UI shows structured pledges when available, manual source attribution when applicable, and **「공약 포스터(선거공보) 보기」** for all candidates with a published bulletin.

## Quick start

```bash
make setup   # install deps + create .env.local (set NEC_SERVICE_KEY)
make check   # verify the key / API connectivity
make dev     # http://localhost:3000
```

Optional data rebuilds:

```bash
npm run build-controversies   # regenerate controversies.json from NEC + Namuwiki
make pledges                  # rebuild Suwon manual pledge fallback
```

## Documentation map

| Doc | Contents |
|-----|----------|
| [architecture.md](./architecture.md) | Code layout, data flow, pledge pipeline |
| [nec-api.md](./nec-api.md) | Open API + policy.nec.go.kr supplement |
| [data-curation.md](./data-curation.md) | Photos, controversies, manual pledges, bulletin links |
| [deployment.md](./deployment.md) | Vercel, GitHub, Pages limitations |
| [worklog.md](./worklog.md) | Chronological build record |

## Known follow-ups

- Superintendent (교육감): no party/ballot number — party cell could be hidden for type 11.
- Friendlier HTTP 401 (bad key) vs 403 (gateway pending) messages.
- Expand manual pledge coverage beyond Suwon (~19/51 Suwon type-6 candidates as of last `make pledges` run).
- Namuwiki controversy topics only for major races; council members have **tags only**.
- Policy commiment list API: only `pageIndex=1` fetched today — paginate if a district exceeds one page.
- Open API pledge body field may use `prmsCont1` typo in some responses — titles work; content parsing may need a follow-up.
