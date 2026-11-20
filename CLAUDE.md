# Saleeqa (سلیقہ): rules for every Claude Code session

## What it is
A styling game for Pakistani fashion. In **Studio**, players build a full look (outfit, layer, dupatta, shoes, bag,
jewellery, accessories) from real, in-stock products of 20+ Pakistani brands for a challenge, optionally see it on a
model (AI preview, Gemini on Vertex AI), and publish it. On **Runway**, published looks get likes, comments and share
pages. The stylist chat, quiz and ranking rounds still exist in code, but the stylist is hidden from the menu.

Stack: Express + TypeScript API (`server/`), Next.js web app (`web/`), MongoDB. Deployed on Render (`render.yaml`).

## How to run
- `docker start saleeqa-mongo-1` (local MongoDB; start it if the server gets ECONNREFUSED 27017)
- `npm run dev:server` (API on http://localhost:4000), `npm run dev:web` (site on http://localhost:3000)
- `npm test` (server suite, vitest). `npm --prefix server run typecheck`, `npm --prefix web run typecheck`
- Production builds need `NODE_ENV=production` (the owner's shell sets `development`, which breaks `next build`).
- `web/next-env.d.ts` changes after a build: restore it with `git checkout -- web/next-env.d.ts`, never commit it.
- Without an email provider, account emails (verify, reset) are printed in the server terminal.

## Code style
- No Prettier config. If formatting, use `--single-quote --print-width 200`.
- LF line endings (`.gitattributes`). No ESLint is configured.
- Follow the patterns already in the file you edit; keep comments short and useful.

## UI rules
- Small text is never lighter than `text-ink/65` (5:1 contrast).
- Tap targets at least 24px (chips and main buttons 40px+).
- Messages to players use the global `toast()` from `web/components/Toaster.tsx`.
- The phone `TabBar` stays outside the blurred header (fixed positioning breaks inside it).
- Check every screen at 360px width: nothing cut off, nothing scrolls sideways.
- Plain, friendly English for players. Design: ivory, plum and gold.

## Product rules
- Rings are jewellery, never outfits. Bottoms (culottes, trousers, shalwar) are never main outfits.
- Never invent products, prices or stock. The AI only ever sees pieces the server has checked.
- AI previews cost real money (about $0.13 each): never make real preview calls in tests or checks
  unless the owner asks; intercept or mock them.

## Every task
- Keep `npm test` green. Add tests for new server logic.
- Never commit `.env` files, keys, passwords, real emails or database usernames.
- Delete any test accounts you create (`DELETE /api/me`).
- Never push, and never merge into `main`, unless the owner says so.

## The owner is not a developer (IMPORTANT)
- Explain in plain, non-technical words. Avoid jargon; when a term is needed, say what it means.
- Finish every task with a short **"How to check it on localhost"** list: what to open
  (e.g. http://localhost:3000/studio), what to click, and what should appear.
- Do not commit until the owner says "looks good". Then commit on the current branch with a clear message
  (small logical commits; server and web separately when both change).
- If something is unclear or risky, ask first instead of guessing.
