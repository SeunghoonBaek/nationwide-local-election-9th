# Deployment

## Repository

- GitHub: [SeunghoonBaek/nationwide-local-election-9th](https://github.com/SeunghoonBaek/nationwide-local-election-9th)
- Default branch: `main`

## Vercel (recommended)

The app needs **server-side API routes** and a **secret env var** (`NEC_SERVICE_KEY`), so it is deployed on [Vercel](https://vercel.com) rather than static hosting.

1. Import the GitHub repo in Vercel.
2. Add **Environment Variable**: `NEC_SERVICE_KEY` = your data.go.kr decoding key.
3. Deploy.

**Auto-deploy:** every push to `main` triggers a production deployment (default Vercel Git integration).

`.env.local` is gitignored and is **not** copied to Vercel — set the key in the Vercel project settings.

## Why not GitHub Pages

GitHub Pages serves static files only. This project requires:

- `/api/*` route handlers (NEC proxy, photo URL resolution, policy links)
- Server-only modules (`nec.ts`, `candidate-photo.ts`, `policy-nec.ts`)
- `NEC_SERVICE_KEY` kept off the client

A static export would break region lookup and candidate search unless a separate backend is hosted elsewhere.

## next/image remote host

Candidate photos come from `cdn.nec.go.kr`. `next.config.ts` whitelists:

```ts
images.remotePatterns: [{ protocol: "https", hostname: "cdn.nec.go.kr", pathname: "/photo_*/**" }]
```

Photo URLs strip the `?ver=` cache-buster query so `next/image` accepts them.
