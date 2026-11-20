/**
 * AI preview of a Studio look on a model: Gemini's image model (on Vertex AI) dresses one fixed
 * Saleeqa model in exactly the pieces the player chose, before they publish to the Runway.
 *
 * - The same model photo is used for every women's look (and one for men's), made once and kept,
 *   so previews never show a brand's own model.
 * - The same player + same pieces gives the same image: a look is never generated twice.
 * - New images per player are limited per day; each one is logged as a `preview` event.
 * - Code never trusts the model with products: it only receives the pieces the server checked.
 */
import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { config } from '../config.js';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import type { Design, Gender, PreviewImage, Product, Slot } from '../types.js';
import { genderOf } from './game.js';
import { uid } from './looks.js';

export const previewEnabled = () => Boolean(config.preview.project || config.preview.apiKey);

const DAY = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 120_000;

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

/** What each slot's photo is, in the words the model gets. */
const PIECE: Record<Slot, string> = {
  main: 'the outfit',
  bottom: 'the trousers / bottom',
  dupatta: 'the dupatta / scarf',
  footwear: 'the shoes',
  bag: 'the bag (held in one hand or on the shoulder)',
  jewelry: 'the jewellery',
  waistcoat: 'the waistcoat (worn over the outfit)',
  accessory: 'the accessory',
};

/**
 * Our models: several women and men with different faces, skin tones, hair and smiles, so the
 * Runway is not one face in every look. Each is made once (on first use) and kept, so a model
 * looks the same in every look she or he wears.
 */
interface ModelSpec {
  /** Who they are: face, skin, hair */
  person: string;
  /** Expression and pose, kept when they are dressed */
  mood: string;
}

const MODELS: Record<Gender, ModelSpec[]> = {
  female: [
    { person: 'a South Asian woman in her mid-20s with a warm wheatish complexion, oval face, long dark brown hair in a soft low bun', mood: 'a warm, natural smile, one hand lightly resting at her side' },
    { person: 'a South Asian woman in her late 20s with a fair complexion, round face, shoulder-length wavy black hair worn open', mood: 'a bright, happy smile showing a little of her teeth, relaxed posture' },
    { person: 'a South Asian woman in her early 30s with a medium brown complexion, high cheekbones, straight black hair in a sleek side braid', mood: 'a confident, gentle closed-mouth smile, standing tall, one hand near her waist' },
    { person: 'a South Asian woman in her early 20s with a dusky complexion, heart-shaped face, curly dark hair tied in a half-up style', mood: 'a cheerful, friendly smile, head tilted very slightly' },
    { person: 'a South Asian woman in her mid-30s with a light olive complexion, soft square jaw, dark chestnut hair in a neat middle-parted low bun', mood: 'a serene, elegant soft smile, hands relaxed' },
    { person: 'a South Asian woman in her late 20s with a deep brown complexion, almond eyes, long straight black hair over one shoulder', mood: 'a joyful, open smile, natural relaxed stance' },
  ],
  male: [
    { person: 'a South Asian man in his late 20s with a wheatish complexion, neatly trimmed short beard, short black hair styled back', mood: 'a warm, easy smile, standing relaxed' },
    { person: 'a South Asian man in his mid-30s with a medium brown complexion, clean-shaven, short side-parted hair', mood: 'a confident closed-mouth smile, hands relaxed at his sides' },
    { person: 'a South Asian man in his early 20s with a fair complexion, light stubble, thick wavy dark hair', mood: 'a friendly, bright smile, natural stance' },
    { person: 'a South Asian man in his early 40s with a dusky complexion, full neatly groomed beard, short greying black hair', mood: 'a calm, dignified gentle smile, standing tall' },
  ],
};

export const modelCount = (g: Gender) => MODELS[g].length;

function basePrompt(gender: Gender, m: ModelSpec): string {
  const they = gender === 'male' ? 'He' : 'She';
  return (
    `A full-length, head-to-toe studio fashion photograph of ${m.person}, standing and facing the camera with ${m.mood}. ` +
    `Lively, natural and approachable, like a real fashion campaign: eyes bright, expression genuine, never blank or stiff. ` +
    `${they} wears a plain, fitted, light grey full-length kurta with matching plain trousers, and is barefoot. ` +
    'No jewellery, no rings, no watch, no accessories. Plain light grey seamless background, soft flattering studio light. ' +
    'Portrait 3:4, whole body visible with space above the head and below the feet.'
  );
}

function lookPrompt(gender: Gender, mood: string, slots: Slot[], included: { bottom: boolean; dupatta: boolean }): string {
  const who = gender === 'male' ? 'man' : 'woman';
  const notes = [
    included.bottom && 'The outfit photo includes its own trousers/bottom: use those.',
    included.dupatta && 'The outfit photo includes its own dupatta: drape that one over the shoulders.',
    slots.includes('dupatta') && 'Drape the dupatta over the shoulders.',
    !slots.includes('jewelry') && gender === 'female' && 'She wears no jewellery at all.',
    !slots.includes('bag') && gender === 'female' && 'She carries no bag.',
  ].filter(Boolean);
  return [
    `The first image is our model. Dress this exact ${who} — same face, hair, body, expression, pose, background and lighting — in exactly the pieces shown in the other images, worn together as one complete look.`,
    'Replace all of the model’s current clothing. Use the product photos only for the garments and accessories: ignore any other person, face, pose or background in them.',
    'Keep every piece true to its photo: the same colours, prints, embroidery, borders, lace and cut.',
    ...notes,
    'Do not add anything that is not shown: no rings, bangles, watches, extra jewellery, bags or layers.',
    `Keep the model's ${mood}: a lively, genuine expression, never blank. Full-length, head to toe visible, front view, modest natural pose. Output only the photograph.`,
  ].join(' ');
}

async function callGemini(parts: unknown[]): Promise<{ mime: string; data: string }> {
  const { project, location, model, apiKey } = config.preview;
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  let url: string;
  let headers: Record<string, string>;
  if (apiKey) {
    // An API key carries its own project (and billing), so no gcloud sign-in is needed on this computer.
    url = `https://${host}/v1/publishers/google/models/${model}:generateContent`;
    headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
  } else {
    let token: string | null | undefined;
    try {
      token = await auth.getAccessToken();
    } catch (e) {
      console.warn('AI preview: Google sign-in failed (set GOOGLE_API_KEY in server/.env, or run gcloud auth application-default login):', (e as Error).message);
      throw new AppError(503, 'The preview is not available right now.');
    }
    url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
    headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': project };
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4', imageSize: '1K' } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e: Error) => {
    console.warn('AI preview: request failed:', e.message);
    throw new AppError(504, 'The preview took too long. Please try again.');
  });
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    console.warn('AI preview: Gemini error', res.status, JSON.stringify(body?.error ?? body).slice(0, 500));
    throw new AppError(res.status === 429 ? 429 : 502, res.status === 429 ? 'The preview is busy. Please try again in a minute.' : 'The preview could not be made. Please try again.');
  }
  const img = body?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data)?.inlineData;
  if (!img) {
    console.warn('AI preview: no image returned', JSON.stringify(body?.candidates?.[0]?.finishReason ?? body).slice(0, 300));
    throw new AppError(502, 'The preview could not be made for this look. Please try again.');
  }
  return { mime: img.mimeType ?? 'image/png', data: img.data };
}

/** A product photo, small enough to send (Shopify serves resized images on request). */
async function productPhoto(p: Product): Promise<{ mimeType: string; data: string }> {
  const src = p.images?.[0];
  if (!src) throw new AppError(400, `${p.title} has no photo to preview`);
  const url = /cdn\.shopify\.com/.test(src) ? `${src}${src.includes('?') ? '&' : '?'}width=768` : src;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) throw new AppError(502, `Could not load the photo of ${p.title}. Please try again.`);
  const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  return { mimeType: /^image\//.test(mimeType) ? mimeType : 'image/jpeg', data: Buffer.from(await res.arrayBuffer()).toString('base64') };
}

/** One of our model photos: made on first use, then kept. */
async function baseModel(repos: Repos, gender: Gender, variant: number): Promise<PreviewImage> {
  const id = `base-${gender}-${variant}`;
  const existing = await repos.previews.findOne({ id });
  if (existing) return existing;
  const img = await callGemini([{ text: basePrompt(gender, MODELS[gender][variant]) }]);
  return repos.previews.upsert({ id, key: id, mime: img.mime, data: img.data, at: new Date().toISOString() });
}

/** Which model wears a look first: spread over all of them, and the same for the same look. */
function firstModel(userId: string, items: Design['items'], n: number): number {
  const h = createHash('sha256').update([userId, ...items.map((i) => i.productId).sort()].join('|')).digest();
  return h.readUInt32BE(0) % n;
}

/**
 * Makes (or reuses) the preview of a player's draft look and attaches it to the draft.
 * Products come from the catalogue by the design's ids, so only checked pieces are sent.
 */
export async function previewDesign(repos: Repos, userId: string, designId: string, opts: { anotherModel?: boolean } = {}): Promise<Design> {
  if (!previewEnabled()) throw new AppError(404, 'The preview is not switched on');
  const d = await repos.designs.findOne({ id: designId, userId });
  if (!d) throw new AppError(404, 'Design not found');
  const challenge = await repos.challenges.findOne({ id: d.challengeId });
  const gender = genderOf(challenge ?? {});

  // Each look gets one of our models; "another model" moves on to the next one.
  const n = modelCount(gender);
  const shown = opts.anotherModel && d.previewId ? await repos.previews.findOne({ id: d.previewId }) : null;
  const variant = shown?.variant !== undefined ? (shown.variant + 1) % n : firstModel(userId, d.items, n);

  const key = createHash('sha256')
    .update([userId, gender, config.preview.model, `model=${variant}`, ...d.items.map((i) => `${i.slot}=${i.productId}`).sort()].join('|'))
    .digest('hex');
  const cached = await repos.previews.findOne({ key });
  if (cached) return (await repos.designs.update({ id: d.id }, { previewId: cached.id }))!;

  const since = new Date(Date.now() - DAY).toISOString();
  const today = (await repos.events.find({ userId, type: 'preview' })).filter((e) => e.at > since).length;
  if (today >= config.preview.dailyLimit) {
    throw new AppError(429, `You have used today’s ${config.preview.dailyLimit} previews. You can still publish your look, or preview again tomorrow.`);
  }

  const products = await repos.products.find({ id: { $in: d.items.map((i) => i.productId) } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const pieces = d.items.map((i) => ({ slot: i.slot, product: byId.get(i.productId) })).filter((x): x is { slot: Slot; product: Product } => Boolean(x.product));
  const main = pieces.find((x) => x.slot === 'main')?.product;
  if (!main) throw new AppError(400, 'Choose an outfit first');

  const [base, photos] = await Promise.all([baseModel(repos, gender, variant), Promise.all(pieces.map((x) => productPhoto(x.product)))]);
  const parts: unknown[] = [{ text: 'Our model:' }, { inlineData: { mimeType: base.mime, data: base.data } }];
  pieces.forEach((x, i) => {
    parts.push({ text: `Piece ${i + 1} — ${PIECE[x.slot]}: ${x.product.title}` });
    parts.push({ inlineData: photos[i] });
  });
  parts.push({
    text: lookPrompt(
      gender,
      MODELS[gender][variant].mood,
      pieces.map((x) => x.slot),
      { bottom: Boolean(main.includesBottom), dupatta: Boolean(main.includesDupatta) },
    ),
  });

  const img = await callGemini(parts);
  const at = new Date().toISOString();
  const saved = await repos.previews.insert({ id: uid(), userId, key, variant, mime: img.mime, data: img.data, at });
  await repos.events.insert({ id: uid(), userId, type: 'preview', lookId: d.id, at });
  return (await repos.designs.update({ id: d.id }, { previewId: saved.id }))!;
}

/** Part of "delete my data". */
export async function deletePreviews(repos: Repos, userId: string) {
  await repos.previews.delete({ userId });
}
