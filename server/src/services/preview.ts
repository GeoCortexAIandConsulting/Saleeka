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
import sharp from 'sharp';
import { config } from '../config.js';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import type { Design, Gender, Occasion, PreviewImage, Product, Slot } from '../types.js';
import { genderOf } from './game.js';
import { uid } from './looks.js';
import { settings } from './settings.js';

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
  accessory: 'the accessory (a watch, sunglasses, a belt, cufflinks or similar)',
  layer: 'the coat / jacket / sweater (worn open or closed over the outfit)',
};

/**
 * Our models: several beautiful, fair-complexioned women and handsome men with different faces, hair
 * and smiles, so the Runway is not one face in every look. Each is made once per body size (on
 * first use) and kept, so a model looks the same in every look she or he wears.
 */
interface ModelSpec {
  /** Who they are: face, skin, hair */
  person: string;
  /** Expression and pose, kept when they are dressed */
  mood: string;
}

const MODELS: Record<Gender, ModelSpec[]> = {
  female: [
    { person: 'a beautiful South Asian woman in her mid-20s with a fair, glowing complexion, soft oval face, large dark eyes, long dark brown hair in a soft low bun', mood: 'a warm, natural smile, one hand lightly resting at her side' },
    { person: 'a beautiful South Asian woman in her late 20s with a fair complexion, round face, defined brows, shoulder-length glossy black waves worn open', mood: 'a bright, happy smile showing a little of her teeth, relaxed posture' },
    { person: 'a beautiful South Asian woman in her early 30s with a fair complexion, high cheekbones, almond eyes, straight black hair in a sleek side braid', mood: 'a confident, gentle closed-mouth smile, standing tall, one hand near her waist' },
    { person: 'a beautiful South Asian woman in her early 20s with a fair, rosy complexion, heart-shaped face, soft curly dark hair in a half-up style', mood: 'a cheerful, friendly smile, head tilted very slightly' },
    { person: 'a beautiful South Asian woman in her mid-30s with a fair, peachy complexion, elegant features, dark chestnut hair in a neat middle-parted low bun', mood: 'a serene, elegant soft smile, hands relaxed' },
    { person: 'a beautiful South Asian woman in her late 20s with a fair complexion, light brown eyes, long straight black hair over one shoulder', mood: 'a joyful, open smile, natural relaxed stance' },
  ],
  male: [
    { person: 'a handsome South Asian man in his late 20s with a fair complexion, neatly trimmed short beard, short black hair styled back', mood: 'a warm, easy smile, standing relaxed' },
    { person: 'a handsome South Asian man in his mid-30s with a fair complexion, clean-shaven, strong jaw, short side-parted hair', mood: 'a confident closed-mouth smile, hands relaxed at his sides' },
    { person: 'a handsome South Asian man in his early 20s with a fair complexion, light stubble, thick wavy dark hair', mood: 'a friendly, bright smile, natural stance' },
    { person: 'a handsome South Asian man in his early 40s with a fair complexion, full neatly groomed beard, short black hair greying at the temples', mood: 'a calm, dignified gentle smile, standing tall' },
  ],
};

/** The body size the player wants to see the look on. */
export const BODY_SIZES = ['small', 'medium', 'large', 'plus'] as const;
export type BodySize = (typeof BODY_SIZES)[number];

const BUILD: Record<Gender, Record<BodySize, string>> = {
  female: {
    small: 'a slim, petite build (around UK size 6 to 8)',
    medium: 'a healthy average build (around UK size 10 to 12)',
    large: 'a fuller, curvy build with a soft tummy and fuller hips and arms (around UK size 14 to 16)',
    plus: 'a plus-size, full-figured build with a fuller bust, tummy, hips and arms (around UK size 18 to 22)',
  },
  male: {
    small: 'a slim, lean build (chest around 36 inches)',
    medium: 'a fit average build (chest around 40 inches)',
    large: 'a broad, heavier build with a fuller middle (chest around 44 inches)',
    plus: 'a big, plus-size build with a full chest and belly (chest around 48 inches or more)',
  },
};

/** The occasion in the words the image model gets. */
const OCCASION_WORDS: Record<Occasion, string> = {
  casual: 'a relaxed everyday outing',
  university: 'a day at university',
  office: 'the office',
  eid: 'Eid',
  mehndi: 'a mehndi',
  baraat: 'a baraat',
  walima: 'a walima',
  party: 'an evening party',
};

/** Model photos are versioned: a new cast gets new photos and new previews instead of reusing old ones. */
const CAST = 'v2';

export const modelCount = (g: Gender) => MODELS[g].length;

function basePrompt(gender: Gender, m: ModelSpec, size: BodySize): string {
  const they = gender === 'male' ? 'He' : 'She';
  const full = size === 'large' || size === 'plus';
  return (
    `A full-length, head-to-toe studio fashion photograph of ${m.person}, with ${BUILD[gender][size]}, standing and facing the camera with ${m.mood}. ` +
    `Beautiful and camera-ready like a real fashion campaign: flawless natural skin, ${gender === 'male' ? 'neat grooming' : 'soft polished makeup'}, eyes bright, expression genuine, never blank or stiff. ` +
    (full ? `${they} looks confident and attractive at this size; the body is shown honestly and flatteringly, not slimmed. ` : '') +
    `${they} wears a plain, fitted, light grey full-length kurta with matching plain trousers, and is barefoot. ` +
    'No jewellery, no rings, no watch, no accessories. Plain light grey seamless background, soft flattering studio light. ' +
    'Portrait 3:4, whole body visible with space above the head and below the feet.'
  );
}

/** How a stylist would put the pieces together, slot by slot. */
const STYLING: Partial<Record<Slot, string>> = {
  dupatta: 'Drape the dupatta gracefully, over one shoulder or both, falling neatly, never bunched.',
  layer: 'Wear the coat or sweater over the outfit, open or neatly closed, with the outfit still visible underneath; the sleeves sit naturally.',
  waistcoat: 'Wear the waistcoat buttoned over the kurta, the kurta hem showing below it.',
  bag: 'Carry the bag naturally in one hand or on the shoulder, in view.',
  jewelry: 'Wear every jewellery piece shown where it belongs (earrings on the ears, a necklace at the neck, a ring on a finger, bangles on the wrist), clearly visible.',
  footwear: 'The shoes are fully visible on the feet.',
  accessory: 'Show every accessory worn the way it is meant to be (a watch on the wrist, sunglasses on the face or held, a belt at the waist, cufflinks at the cuffs, a shawl on the shoulders).',
};

/** How menswear is worn: crisp and well fitted, the way a groom's stylist would send him out. */
const MENSWEAR = [
  'The kurta or shirt is crisp and pressed, the collar and cuffs neat; a kurta falls straight to its own length over the shalwar or trousers.',
  'A western shirt is neatly tucked in; trousers sit at the waist with a clean break over the shoes.',
  'A sherwani or prince coat is fully buttoned to the collar.',
  'He wears no watch, ring, chain or cap unless one is shown, and his hair and beard are neatly groomed.',
];

function lookPrompt(gender: Gender, mood: string, slots: Slot[], included: { bottom: boolean; dupatta: boolean }, size: BodySize, occasion?: string): string {
  const who = gender === 'male' ? 'man' : 'woman';
  const their = gender === 'male' ? 'his' : 'her';
  const notes = [
    included.bottom && 'The outfit photo includes its own trousers/bottom: use those.',
    included.dupatta && 'The outfit photo includes its own dupatta: drape that one gracefully over the shoulders.',
    // Several jewellery pieces or accessories share one styling note.
    ...[...new Set(slots)].map((s) => STYLING[s]),
    ...(gender === 'male' ? MENSWEAR : []),
    !slots.includes('jewelry') && gender === 'female' && 'She wears no jewellery at all.',
    !slots.includes('bag') && gender === 'female' && 'She carries no bag.',
  ].filter(Boolean);
  return [
    `The first image is our model. Dress this exact ${who} — same face, complexion, hair, body size and shape, expression, pose, background and lighting — in exactly the pieces shown in the other images.`,
    `Style them together as one complete, polished look${occasion ? ` for ${occasion}` : ''}, the way a fashion stylist would: the pieces coordinated, sitting well on the body, proportions balanced, nothing crumpled or mismatched.`,
    `Fit every garment naturally to ${their} ${BUILD[gender][size].replace(/^an? /, '')}: true to this body size, neither slimmed nor enlarged.`,
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

/**
 * Gemini returns a PNG of 1.2 to 1.7 MB; as WebP at quality 90 it is about 60 KB and keeps the fabric
 * texture and embroidery (quality 80 smoothed knits). Previews live in the database, so this keeps a free Atlas tier from filling up. A model photo
 * is sent back to Gemini with every look, so it keeps more detail. If the image cannot be read, the
 * original is kept rather than losing a paid image.
 */
export async function compressImage(img: { mime: string; data: string }, quality = 90): Promise<{ mime: string; data: string }> {
  try {
    const out = await sharp(Buffer.from(img.data, 'base64')).webp({ quality, smartSubsample: true, preset: 'photo', effort: 5 }).toBuffer();
    return { mime: 'image/webp', data: out.toString('base64') };
  } catch (e) {
    console.warn('AI preview: could not compress an image, keeping it as it came:', (e as Error).message);
    return img;
  }
}

/** A product photo, small enough to send (Shopify serves resized images on request). */
async function productPhoto(repos: Repos, p: Product): Promise<{ mimeType: string; data: string }> {
  const src = p.images?.[0];
  if (!src) throw new AppError(400, `${p.title} has no photo to preview`);
  // A photo a brand uploaded in the brand portal is in our own database.
  if (src.startsWith('/api/brand-images/')) {
    const img = await repos.brandImages.findOne({ id: src.split('/').pop()! });
    if (!img) throw new AppError(502, `Could not load the photo of ${p.title}.`);
    return { mimeType: img.mime, data: img.data };
  }
  const url = /cdn\.shopify\.com/.test(src) ? `${src}${src.includes('?') ? '&' : '?'}width=768` : src;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) throw new AppError(502, `Could not load the photo of ${p.title}. Please try again.`);
  const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
  return { mimeType: /^image\//.test(mimeType) ? mimeType : 'image/jpeg', data: Buffer.from(await res.arrayBuffer()).toString('base64') };
}

/** One of our model photos: made on first use, then kept. */
async function baseModel(repos: Repos, gender: Gender, variant: number, size: BodySize): Promise<PreviewImage> {
  const id = `base-${CAST}-${gender}-${variant}-${size}`;
  const existing = await repos.previews.findOne({ id });
  if (existing) return existing;
  const img = await compressImage(await callGemini([{ text: basePrompt(gender, MODELS[gender][variant], size) }]), 95);
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
export async function previewDesign(repos: Repos, userId: string, designId: string, opts: { anotherModel?: boolean; size?: BodySize } = {}): Promise<Design> {
  if (!previewEnabled()) throw new AppError(404, 'The preview is not switched on');
  const d = await repos.designs.findOne({ id: designId, userId });
  if (!d) throw new AppError(404, 'Design not found');
  const challenge = await repos.challenges.findOne({ id: d.challengeId });
  const gender = genderOf(challenge ?? {});

  // Each look gets one of our models; "another model" moves on to the next one.
  const n = modelCount(gender);
  const shown = opts.anotherModel && d.previewId ? await repos.previews.findOne({ id: d.previewId }) : null;
  const variant = shown?.variant !== undefined ? (shown.variant + 1) % n : firstModel(userId, d.items, n);
  // The body size the player picked; "another model" keeps the size already shown.
  const size: BodySize = opts.size ?? (shown?.size as BodySize | undefined) ?? 'medium';

  const key = createHash('sha256')
    .update([userId, gender, config.preview.model, `cast=${CAST}`, `model=${variant}`, `size=${size}`, ...d.items.map((i) => `${i.slot}=${i.productId}`).sort()].join('|'))
    .digest('hex');
  const cached = await repos.previews.findOne({ key });
  if (cached) return (await repos.designs.update({ id: d.id }, { previewId: cached.id }))!;

  // One new image at a time per player: two quick taps (or two tabs) must not both slip past the limit.
  if (making.has(userId)) throw new AppError(429, 'Your last preview is still being made. Please wait for it to finish.');
  making.add(userId);
  try {
    return await makePreview(repos, userId, d, { key, gender, variant, size, occasion: challenge ? OCCASION_WORDS[challenge.occasion] : undefined });
  } finally {
    making.delete(userId);
  }
}

/** Players whose preview is being made right now (this server). */
const making = new Set<string>();

async function makePreview(
  repos: Repos,
  userId: string,
  d: Design,
  o: { key: string; gender: Gender; variant: number; size: BodySize; occasion?: string },
): Promise<Design> {
  const { key, gender, variant, size } = o;
  const status = await previewStatus(repos, userId);
  if (status.blocked) throw new AppError(status.blocked === 'verify' ? 403 : 429, status.message!);

  const products = await repos.products.find({ id: { $in: d.items.map((i) => i.productId) } });
  const byId = new Map(products.map((p) => [p.id, p]));
  const pieces = d.items.map((i) => ({ slot: i.slot, product: byId.get(i.productId) })).filter((x): x is { slot: Slot; product: Product } => Boolean(x.product));
  const main = pieces.find((x) => x.slot === 'main')?.product;
  if (!main) throw new AppError(400, 'Choose an outfit first');

  const [base, photos] = await Promise.all([baseModel(repos, gender, variant, size), Promise.all(pieces.map((x) => productPhoto(repos, x.product)))]);
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
      size,
      o.occasion,
    ),
  });

  const img = await compressImage(await callGemini(parts));
  const at = new Date().toISOString();
  const saved = await repos.previews.insert({ id: uid(), userId, key, variant, size, mime: img.mime, data: img.data, at });
  await repos.events.insert({ id: uid(), userId, type: 'preview', lookId: d.id, at });
  await recordUsage(repos, userId, at);
  return (await repos.designs.update({ id: d.id }, { previewId: saved.id }))!;
}

export type PreviewBlock = 'off' | 'verify' | 'used-up' | 'player-today' | 'everyone-today';

/** What players see when previews are switched off or a daily limit is set to 0. */
export const RESTING = 'Previews are resting for today. Publish your look now.';

/** The key a player's preview count is kept under: a hash of their email, never the email itself. */
export const emailKey = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

/** Notes one more preview against the player's email, so deleting the account does not reset it. */
async function recordUsage(repos: Repos, userId: string, at: string) {
  const user = await repos.users.findOne({ id: userId });
  if (!user) return;
  const id = emailKey(user.email);
  const [kept, total] = await Promise.all([repos.previewUsage.findOne({ id }), repos.events.count({ userId, type: 'preview' })]);
  await repos.previewUsage.upsert({ id, used: Math.max(total, (kept?.used ?? 0) + 1), updatedAt: at });
}

/** The preview limits in force: the admin portal's settings where set, else server/.env. */
export function previewLimits() {
  const s = settings();
  return {
    ...config.preview,
    off: config.preview.off || Boolean(s.previewsOff),
    free: s.previewFree ?? config.preview.free,
    dailyLimit: s.previewDailyLimit ?? config.preview.dailyLimit,
    globalDailyCap: s.previewGlobalDailyCap ?? config.preview.globalDailyCap,
  };
}

/**
 * What a player may still preview. A new image costs money, so it is limited several ways:
 * - for life: the free previews every account gets, plus those earned by inviting friends (game.ts). Previews
 *   are counted per email too, so a deleted and re-made account does not start again;
 * - per player per day (no bursts), and across all players per day, so one busy night cannot spend
 *   the Google credit; PREVIEWS_OFF=true, or a limit of 0, switches new previews off;
 * - a verified email comes first, so fake accounts cannot farm the free ones.
 * A look already previewed is shown again for free and never reaches this.
 */
export async function previewStatus(repos: Repos, userId: string) {
  const { free, dailyLimit, globalDailyCap, requireVerifiedEmail, friendsForCredit, friendCreditCap, off } = previewLimits();
  const user = await repos.users.findOne({ id: userId });
  const since = new Date(Date.now() - DAY).toISOString();
  const [mine, today, everyone, kept] = await Promise.all([
    repos.events.count({ userId, type: 'preview' }),
    repos.events.count({ userId, type: 'preview', at: { $gt: since } }),
    repos.events.count({ type: 'preview', at: { $gt: since } }),
    user ? repos.previewUsage.findOne({ id: emailKey(user.email) }) : null,
  ]);
  const used = Math.max(mine, kept?.used ?? 0);
  const earned = user?.previewCredits ?? 0;
  const left = Math.max(0, free + earned - used);
  const verified = Boolean(user?.emailVerifiedAt) || !requireVerifiedEmail || !config.emailConfirmation;
  let blocked: PreviewBlock | null = null;
  let message: string | null = null;
  if (off || dailyLimit === 0 || globalDailyCap === 0) {
    blocked = 'off';
    message = RESTING;
  } else if (!verified) {
    blocked = 'verify';
    message = 'Please confirm your email first: we sent you a link. It unlocks your free previews.';
  } else if (left <= 0) {
    blocked = 'used-up';
    message =
      (user?.referralCredits ?? 0) >= friendCreditCap
        ? 'You have used all your free previews. You can still publish your look.'
        : `You have used your free preview. Get another for every ${friendsForCredit} friends who join from your share link and publish a look. You can still publish yours.`;
  } else if (today >= dailyLimit) {
    blocked = 'player-today';
    message = `You have made ${dailyLimit} previews today. Come back tomorrow for more. You can still publish your look.`;
  } else if (everyone >= globalDailyCap) {
    blocked = 'everyone-today';
    message = 'So many people are previewing today that we have reached today’s limit. Come back tomorrow! You can still publish your look.';
  }
  const friends = user?.referrals ?? 0;
  // Friends still needed for the next earned preview (0 once the cap is reached).
  const friendsToGo = (user?.referralCredits ?? 0) >= friendCreditCap ? 0 : friendsForCredit - (friends % friendsForCredit);
  return { verified, left, free, earned, used, friends, friendsForCredit, friendsToGo, blocked, message };
}

/** Part of "delete my data". */
export async function deletePreviews(repos: Repos, userId: string) {
  await repos.previews.delete({ userId });
}
