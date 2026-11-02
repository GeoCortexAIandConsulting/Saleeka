# Saleeqa (سلیقہ)

AI personal stylist for Pakistani fashion: a taste quiz, ranking rounds that teach the system what you like,
then a chat stylist that returns three complete head-to-toe looks (outfit, dupatta/scarf, shoes, bag, jewellery)
built from real products, with a hard modesty setting and PKR budgets.

**Stack:** MongoDB · Express (TypeScript) · React via Next.js (responsive website, no app-store app) · Node.

> Status: working MVP. The demo catalog in `server/src/data/seed.ts` is placeholder data. A **prototype-only**
> importer loads real women's catalogs from the brands' official sites (see "Real catalogs" below); real catalogs
> need written brand permission before any public launch (see the partnership plan).

## Run it

```bash
npm run install:all
cp server/.env.example server/.env        # optional: works without it
npm run dev:server                        # API on :4000 (in-memory demo store if MONGODB_URI is empty)
npm run dev:web                           # site on :3000, proxies /api to :4000
```

Open http://localhost:3000, sign up, take the quiz, rank 4 rounds, then chat.

**With a real MongoDB:** `docker compose up -d`, set `MONGODB_URI=mongodb://localhost:27017` in `server/.env`,
restart the server (demo data is seeded on first run), and run `npm --prefix server run test:mongo`
to check the Mongo adapter against your database.

## How recommendations work

1. **Quiz** → structured profile (coverage 1–5, colours, cuts, fabrics, budget, brands...) + a taste vector.
2. **Ranking rounds** → each rank, quick tag and free-text note updates the taste vector (`services/rounds.ts`).
3. **Chat** → the language layer turns the message into constraints (occasion, colours, brands, budget).
4. **Composer** (`services/composer.ts`) is plain code: hard filters (coverage, avoided colours/brands, stock,
   occasion, budget) → score → assemble each slot → fit budget → choose 3 distinct looks. If fewer than 3 fit it
   relaxes brands, then colours, then budget by ~25%, and **tells the shopper what it relaxed**.
5. The model never picks products and never writes prices; it only parses text and phrases explanations from facts.

## Language model

`LLM_PROVIDER=rules` (default) needs no model. Set `LLM_PROVIDER=openai` with `LLM_BASE_URL`, `LLM_MODEL`
(Ollama, vLLM, Groq, OpenRouter...) to use a model for request parsing, feedback parsing and explanations.
Model output is validated; on any failure it falls back to the rules provider.

## Tests

`npm test` runs 33 tests: modesty rules, composer hard-rule guarantees, LLM parsing and fallbacks, and a full
API journey (signup → quiz → 4 rounds → chat → swap → save → click-out → partner report → data deletion).

## Real catalogs (prototype only)

> **Prototype use only.** Women's products, photos, prices and stock are read from the brands' official websites for
> development and demos. Photos are shown from the brand's own site (never copied), every item links to its official
> page, and each look credits the brands. **Before any public launch, get each brand's written permission or remove
> this data** (`npm --prefix server run catalog:import` replaces the demo catalog; restoring the demo means dropping
> the `products` and `brands` collections so the demo seed runs again).

```bash
npm --prefix server run catalog:fetch            # read all brands (polite: 1 request/1.5 s per site, honours robots.txt)
npm --prefix server run catalog:import -- --dry-run   # tag and report, write nothing
npm --prefix server run catalog:import           # load into MongoDB (needs MONGODB_URI)
```

| Source | Brands |
|---|---|
| Shopify public product feed (`/products.json`) | Maria B, Gul Ahmed, Alkaram Studio, Sana Safinaz, Outfitters, Ethnic, Limelight, Beechtree, J., Nishat Linen, Asim Jofa, Generation |
| Product pages listed in the brand's sitemap | Sapphire, Bareeze (capped at 450 pages per run; `--max-pages=`) |
| Not imported | **Khaadi**: its product listings load from `/on/demandware.store/`, which its robots.txt disallows, and its sitemap has no product pages |

`server/src/catalog/normalize.ts` tags each item by rules (slot, silhouette, colour mapped to the palette, fabric,
sleeve/length/neckline, embellishment, occasions, sizes in stock). Items it cannot colour or price, and anything that
is not women's clothing or a women's accessory, are dropped and counted in the report. Stock is as of the last
fetch: re-run both steps to refresh (products that disappear are kept but marked out of stock).

## 3D avatar and try-on

Account → "Your 3D avatar" builds the shopper's body from height, weight and body shape, with their face and skin
tone from one selfie (see Privacy). Every look card has **Try it on me**: the avatar wears the look's pieces, cut
from the product data (silhouette, length, sleeve, neckline, colours, fabric, embellishment) in
`web/lib/outfit.ts` and `web/lib/humanBody.ts`. Hijab-wearing shoppers see the scarf or dupatta worn as a hijab.
Prints and embroidery are illustrated, not the real product images. `web/lib/palette.ts` mirrors the server
palette (a test keeps them in sync).

## Not built yet (planned)

Phone OTP login · real brand feeds and the tagging pipeline (vision model + embeddings) · admin panel ·
brand dashboard · Urdu UI · virtual try-on · hosted deployment.

## Privacy

Gender, age range, height, weight, body shape and a profile photo are optional. A profile photo is only stored if the user
uploads one (resized to 320 px, shown only to them, removable any time). The optional complexion
check reads a selfie in the browser only and saves just the undertone and depth (which the shopper can edit).

**3D avatar (Account page, optional).** The body is built from height, weight and body shape. For the face, one
front-facing selfie is analysed **in the browser** with MediaPipe Face Landmarker (WASM runtime and model are served
from `web/public/mediapipe`, so no image goes to Google). What is stored: 468 face-mesh points (front-on, in cm), where
each point sits on the face image, a small face image (320 px JPEG, edges faded to skin colour) and the skin colour.
It is shown only to the user, removable any time (`DELETE /api/me/avatar`) and deleted with the account. A face
image and face geometry are biometric-style data: cover them explicitly in the privacy notice and the lawyer review.

`DELETE /api/me` (Account → Delete) removes all user data. Review with a Pakistani lawyer before launch.

Third-party: MediaPipe Face Landmarker model and canonical face mesh (`web/lib/faceMeshData.ts`) are Apache-2.0
(google-ai-edge/mediapipe).
