# ekam.ink — web app

The Next.js 16 app behind **[ekam.ink](https://ekam.ink)** — a collaborative 24×24-tile canvas
where strangers each hand-paint one square, with an AI moderator screening every tile.

## Run

```bash
npm install
npm run dev      # needs web/.env.local — copy the names from .env.local.example
```

`npm run build` to build · `npm run lint` to lint.

## Where things are

- **Full engineering log + every decision (read this first):** [`../HANDOFF.md`](../HANDOFF.md)
- **Project overview:** [`../README.md`](../README.md)
- App routes in `app/`, UI in `components/`, server + domain logic in `lib/`, SQL in `../supabase/`.

Stack: Next.js (App Router) · React 19 · TypeScript · Supabase · Vercel · Claude API (AI moderation).
