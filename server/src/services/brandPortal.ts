/**
 * The brand portal (/brand): brands apply for an account, the admin approves it, and the brand then
 * adds its pieces (one at a time or from a spreadsheet), with photo links or uploaded photos.
 * Every new piece, and every change beyond price, sizes and stock, waits for the admin's approval
 * before players see it. Brands see statistics about their own pieces only, never who the players are.
 */
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { z } from 'zod';
import { normalize } from '../catalog/normalize.js';
import { paletteColors } from '../catalog/colors.js';
import { config } from '../config.js';
import { PALETTE } from '../data/palette.js';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import { MEN_SLOTS, OCCASIONS, WOMEN_GAME_SLOTS, type BrandAccount, type BrandItem, type Occasion, type Product, type Slot } from '../types.js';
import { brandApprovedEmail, brandRejectedEmail, resetEmail, sendEmail } from './email.js';
import { uid } from './looks.js';
import { bottomModesty, modestyScore } from './modesty.js';
import { setBrandHidden } from './admin.js';
import { settings } from './settings.js';

const HOUR = 60 * 60 * 1000;
/** Most pieces one brand can have, rows in one spreadsheet upload, and photos it can upload. */
export const MAX_ITEMS = 5000;
export const MAX_ROWS = 500;
export const MAX_IMAGES = 3000;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
/** The product id players see for an approved piece. */
export const productIdOf = (itemId: string) => `bi:${itemId}`;

/* ------------------------------------ accounts ------------------------------------ */

export const applicationSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email').max(120),
  password: z.string().min(8, 'Use at least 8 characters for the password').max(100),
  contactName: z.string().trim().min(1, 'Please enter your name').max(80),
  phone: z.string().trim().min(7, 'Please enter a phone number').max(30),
  brandName: z.string().trim().min(2, 'Please enter the brand name').max(60),
  website: z.string().trim().max(200).optional(),
  instagram: z.string().trim().max(200).optional(),
  city: z.string().trim().max(60).optional(),
  about: z.string().trim().max(1000).optional(),
  tier: z.enum(['budget', 'mid', 'premium']),
  sells: z.enum(['female', 'male', 'both']),
});

/** What the brand sees about its own account. */
export const publicAccount = (a: BrandAccount) => ({
  id: a.id,
  email: a.email,
  contactName: a.contactName,
  phone: a.phone,
  brandName: a.brandName,
  website: a.website ?? null,
  instagram: a.instagram ?? null,
  city: a.city ?? null,
  about: a.about ?? null,
  tier: a.tier,
  sells: a.sells,
  status: a.status,
  brandId: a.brandId ?? null,
  createdAt: a.createdAt,
});

/** A brand applies: the account waits for the admin. Nobody can sign in with it until it is approved. */
export async function applyBrand(repos: Repos, input: z.infer<typeof applicationSchema>) {
  if (await repos.brandAccounts.findOne({ email: input.email })) throw new AppError(409, 'There is already a brand account with this email. Sign in instead.');
  const clean = (s?: string) => (s?.trim() ? s.trim() : undefined);
  const account: BrandAccount = {
    id: uid(),
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 10),
    contactName: input.contactName,
    phone: input.phone,
    brandName: input.brandName,
    website: clean(input.website),
    instagram: clean(input.instagram),
    city: clean(input.city),
    about: clean(input.about),
    tier: input.tier,
    sells: input.sells,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  try {
    await repos.brandAccounts.insert(account);
  } catch {
    throw new AppError(409, 'There is already a brand account with this email. Sign in instead.');
  }
  return account;
}

/** The message a brand sees when its account cannot be used (yet). */
export function statusProblem(a: BrandAccount): string | null {
  if (a.status === 'pending') return 'Thank you for applying! Our team is reviewing your brand. We will email you as soon as it is approved.';
  if (a.status === 'rejected') return `Your application was not approved.${a.note ? ` Reason: ${a.note}` : ''} Email us if you have questions.`;
  if (a.status === 'suspended') return `This brand account is paused by the Saleeqa team.${a.note ? ` Reason: ${a.note}` : ''} Email us to sort it out.`;
  return null;
}

export async function loginBrand(repos: Repos, email: string, password: string) {
  const a = await repos.brandAccounts.findOne({ email: email.trim().toLowerCase() });
  const ok = a ? await bcrypt.compare(password, a.passwordHash) : false;
  if (!a || !ok) throw new AppError(401, 'Email or password is incorrect');
  const problem = statusProblem(a);
  if (problem) throw new AppError(403, problem);
  await repos.brandAccounts.update({ id: a.id }, { lastLoginAt: new Date().toISOString() });
  return a;
}

/** Sends a reset link (only to approved brands; same answer either way). */
export async function brandForgot(repos: Repos, email: string): Promise<string | undefined> {
  const a = await repos.brandAccounts.findOne({ email: email.trim().toLowerCase() });
  if (!a || a.status !== 'approved') return;
  const token = randomBytes(32).toString('base64url');
  await repos.brandAccounts.update({ id: a.id }, { resetTokenHash: hash(token), resetExpiresAt: new Date(Date.now() + HOUR).toISOString() });
  const url = `${config.webOrigin}/brand/reset?token=${encodeURIComponent(token)}`;
  await sendEmail(resetEmail(a.email, a.contactName, url));
  return url;
}

export async function brandReset(repos: Repos, token: string, password: string) {
  const a = await repos.brandAccounts.findOne({ resetTokenHash: hash(token) });
  if (!a || !a.resetExpiresAt || Date.parse(a.resetExpiresAt) < Date.now()) throw new AppError(400, 'This link has expired or was already used. Ask for a new one.');
  await repos.brandAccounts.update({ id: a.id }, { passwordHash: await bcrypt.hash(password, 10), resetTokenHash: undefined, resetExpiresAt: undefined });
  const problem = statusProblem(a);
  if (problem) throw new AppError(403, problem);
  return a;
}

export const profileSchema = z.object({
  contactName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  website: z.string().trim().max(200).optional(),
  instagram: z.string().trim().max(200).optional(),
  city: z.string().trim().max(60).optional(),
  about: z.string().trim().max(1000).optional(),
});

export async function updateProfile(repos: Repos, a: BrandAccount, patch: z.infer<typeof profileSchema>) {
  const next: Partial<BrandAccount> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) (next as Record<string, unknown>)[k] = v || undefined;
  return (await repos.brandAccounts.update({ id: a.id }, next))!;
}

export async function changePassword(repos: Repos, a: BrandAccount, current: string, next: string) {
  if (!(await bcrypt.compare(current, a.passwordHash))) throw new AppError(400, 'Your current password is not right');
  await repos.brandAccounts.update({ id: a.id }, { passwordHash: await bcrypt.hash(next, 10) });
}

/* --------------------------------- admin: accounts --------------------------------- */

export async function listBrandAccounts(repos: Repos, status?: BrandAccount['status']) {
  const all = await repos.brandAccounts.find({}, { sort: { createdAt: -1 }, omit: ['passwordHash', 'resetTokenHash'] });
  const items = await repos.brandItems.find({}, { omit: ['description'] });
  const per = new Map<string, { total: number; pending: number; approved: number }>();
  for (const i of items) {
    const x = per.get(i.accountId) ?? { total: 0, pending: 0, approved: 0 };
    x.total++;
    if (i.status === 'pending') x.pending++;
    if (i.status === 'approved') x.approved++;
    per.set(i.accountId, x);
  }
  // A brand of the same name already copied from a website: worth a look before approving.
  const brands = await repos.brands.find();
  const counts = { pending: 0, approved: 0, rejected: 0, suspended: 0 };
  for (const a of all) counts[a.status]++;
  return {
    counts,
    accounts: all
      .filter((a) => !status || a.status === status)
      .map((a) => ({
        ...publicAccount(a),
        note: a.note ?? null,
        reviewedAt: a.reviewedAt ?? null,
        lastLoginAt: a.lastLoginAt ?? null,
        items: per.get(a.id) ?? { total: 0, pending: 0, approved: 0 },
        sameName: brands.some((b) => b.id !== a.brandId && b.name.trim().toLowerCase() === a.brandName.trim().toLowerCase()),
      })),
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'brand';

export async function approveBrand(repos: Repos, id: string) {
  const a = await repos.brandAccounts.findOne({ id });
  if (!a) throw new AppError(404, 'Brand account not found');
  // Always a brand of its own, even if a brand of the same name was copied from a website.
  const brandId = a.brandId ?? `brand-${slug(a.brandName)}-${a.id.slice(0, 6)}`;
  if (!(await repos.brands.findOne({ id: brandId }))) await repos.brands.insert({ id: brandId, name: a.brandName, tier: a.tier, accountId: a.id });
  const was = a.status;
  await repos.brandAccounts.update({ id }, { status: 'approved', brandId, note: undefined, reviewedAt: new Date().toISOString() });
  // A suspended brand's pieces come back.
  if (was === 'suspended') await setBrandHidden(repos, brandId, false);
  if (was === 'pending' || was === 'rejected') {
    await sendEmail(brandApprovedEmail(a.email, a.contactName, a.brandName, `${config.webOrigin}/login`)).catch((e) => console.warn('Brand approval email failed:', (e as Error).message));
  }
}

export async function rejectBrand(repos: Repos, id: string, note: string) {
  const a = await repos.brandAccounts.findOne({ id });
  if (!a) throw new AppError(404, 'Brand account not found');
  if (a.status !== 'pending') throw new AppError(400, 'Only applications waiting for review can be turned down. Suspend an approved brand instead.');
  await repos.brandAccounts.update({ id }, { status: 'rejected', note: note || undefined, reviewedAt: new Date().toISOString() });
  await sendEmail(brandRejectedEmail(a.email, a.contactName, a.brandName, note, config.webOrigin)).catch((e) => console.warn('Brand rejection email failed:', (e as Error).message));
}

/** Pauses an approved brand: it cannot sign in, and its pieces leave the Studio until approved again. */
export async function suspendBrand(repos: Repos, id: string, note: string) {
  const a = await repos.brandAccounts.findOne({ id });
  if (!a) throw new AppError(404, 'Brand account not found');
  if (a.status !== 'approved') throw new AppError(400, 'Only approved brands can be suspended');
  await repos.brandAccounts.update({ id }, { status: 'suspended', note: note || undefined, reviewedAt: new Date().toISOString() });
  if (a.brandId) await setBrandHidden(repos, a.brandId, true);
}

/** Deletes the account, its items and photos. Its pieces stay in looks already made, shown as sold out. */
export async function deleteBrandAccount(repos: Repos, id: string) {
  const a = await repos.brandAccounts.findOne({ id });
  if (!a) throw new AppError(404, 'Brand account not found');
  const inLooks = await piecesInLooks(repos);
  for (const item of await repos.brandItems.find({ accountId: id })) await retireProduct(repos, item.id, { inLooks });
  await repos.brandItems.delete({ accountId: id });
  await repos.brandImages.delete({ accountId: id });
  await repos.brandAccounts.delete({ id });
  // The brand itself goes too, unless looks still show some of its pieces.
  if (a.brandId && !(await repos.products.count({ brandId: a.brandId }))) await repos.brands.delete({ id: a.brandId });
  await bumpCatalog(repos);
}

/* -------------------------------------- items -------------------------------------- */

const SLOTS_FOR = { female: WOMEN_GAME_SLOTS, male: MEN_SLOTS };
const IMAGE = /^(https:\/\/\S+|\/api\/brand-images\/[A-Za-z0-9-]+)$/;

export const itemSchema = z.object({
  title: z.string().trim().min(3, 'Give the piece a name (at least 3 letters)').max(120),
  slot: z.enum(['main', 'bottom', 'dupatta', 'footwear', 'bag', 'jewelry', 'waistcoat', 'accessory', 'layer']),
  gender: z.enum(['female', 'male']),
  price: z.number({ message: 'Enter the price in rupees' }).int('Enter a whole number of rupees').min(50, 'The price looks too low').max(5_000_000),
  colors: z.array(z.string()).max(2, 'Up to 2 colours').default([]),
  fabric: z.string().trim().max(40).optional(),
  sizes: z.array(z.string().trim().min(1).max(20)).max(20).default([]),
  inStock: z.boolean().default(true),
  url: z.string().trim().url('Add the link where players can buy it (your product page, Instagram or WhatsApp)').max(500),
  images: z.array(z.string().trim().regex(IMAGE, 'Photos must be https links or photos uploaded here')).min(1, 'Add at least one photo').max(6, 'Up to 6 photos'),
  description: z.string().trim().max(2000).optional(),
  occasions: z.array(z.enum(OCCASIONS as [Occasion, ...Occasion[]])).max(8).optional(),
  season: z.enum(['summer', 'winter', 'all']).optional(),
  embellishment: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  stitched: z.boolean().optional(),
  includesDupatta: z.boolean().optional(),
  includesBottom: z.boolean().optional(),
  sleeve: z.enum(['sleeveless', 'short', 'three-quarter', 'full']).optional(),
  length: z.enum(['short', 'knee', 'midi', 'full']).optional(),
  neckline: z.enum(['open', 'regular', 'high']).optional(),
});
export type ItemInput = z.infer<typeof itemSchema>;

/** Checks an item against the brand: the slot fits the gender, colours are known (or found in the name), photos are its own. */
async function checkItem(repos: Repos, a: BrandAccount, input: ItemInput): Promise<ItemInput> {
  if (a.sells !== 'both' && input.gender !== a.sells) throw new AppError(400, `Your brand is set up for ${a.sells === 'male' ? 'men' : 'women'}'s pieces only`);
  if (!SLOTS_FOR[input.gender].includes(input.slot)) throw new AppError(400, `“${CATEGORY_LABEL[input.slot]}” is not a ${input.gender === 'male' ? "men's" : "women's"} category here`);
  let colors = [...new Set(input.colors.map((c) => c.trim().toLowerCase()))].filter(Boolean);
  const unknown = colors.filter((c) => !PALETTE[c]);
  if (unknown.length) throw new AppError(400, `Unknown colour: ${unknown.join(', ')}. Choose from the colour list.`);
  if (!colors.length) colors = paletteColors(`${input.title} ${input.description ?? ''}`).slice(0, 2);
  if (!colors.length) throw new AppError(400, 'Choose the colour of this piece');
  const own = input.images.filter((u) => u.startsWith('/api/brand-images/')).map((u) => u.split('/').pop()!);
  if (own.length) {
    const found = await repos.brandImages.count({ id: { $in: own }, accountId: a.id });
    if (found !== new Set(own).size) throw new AppError(400, 'One of the photos was not found. Upload it again.');
  }
  return { ...input, colors };
}

export async function createItems(repos: Repos, a: BrandAccount, inputs: ItemInput[], batchId?: string) {
  if ((await repos.brandItems.count({ accountId: a.id })) + inputs.length > MAX_ITEMS) throw new AppError(400, `A brand can have up to ${MAX_ITEMS} pieces. Delete some old ones first.`);
  const now = new Date().toISOString();
  const made: BrandItem[] = [];
  for (const input of inputs) {
    const checked = await checkItem(repos, a, input);
    const item: BrandItem = { ...checked, id: uid(), accountId: a.id, brandId: a.brandId!, status: 'pending', createdAt: now, updatedAt: now, ...(batchId ? { batchId } : {}) };
    await repos.brandItems.insert(item);
    made.push(item);
  }
  return made;
}

/** A full edit: the piece goes back for approval (players keep seeing nothing new until then). */
export async function updateItem(repos: Repos, a: BrandAccount, id: string, input: ItemInput) {
  const item = await repos.brandItems.findOne({ id, accountId: a.id });
  if (!item) throw new AppError(404, 'Piece not found');
  const checked = await checkItem(repos, a, input);
  const clear = { fabric: undefined, description: undefined, occasions: undefined, season: undefined, embellishment: undefined, stitched: undefined, includesDupatta: undefined, includesBottom: undefined, sleeve: undefined, length: undefined, neckline: undefined };
  const next = { ...clear, ...checked, status: 'pending' as const, note: undefined, updatedAt: new Date().toISOString() };
  await repos.brandItems.update({ id }, next);
  // While it waits, the old version leaves the Studio (a look already made still shows it).
  await retireProduct(repos, id, { keepItem: true });
  await bumpCatalog(repos);
  return (await repos.brandItems.findOne({ id }))!;
}

export const quickSchema = z.object({
  price: z.number().int().min(50).max(5_000_000).optional(),
  inStock: z.boolean().optional(),
  sizes: z.array(z.string().trim().min(1).max(20)).max(20).optional(),
});

/** Price, sizes and stock change at once, with no new approval (they are facts the brand knows best). */
export async function quickUpdate(repos: Repos, a: BrandAccount, id: string, patch: z.infer<typeof quickSchema>) {
  const item = await repos.brandItems.findOne({ id, accountId: a.id });
  if (!item) throw new AppError(404, 'Piece not found');
  const change: Partial<BrandItem> = { updatedAt: new Date().toISOString() };
  if (patch.price !== undefined) change.price = patch.price;
  if (patch.inStock !== undefined) change.inStock = patch.inStock;
  if (patch.sizes !== undefined) change.sizes = patch.sizes;
  const next = (await repos.brandItems.update({ id }, change))!;
  if (next.status === 'approved') {
    const productChange: Partial<Product> = { checkedAt: change.updatedAt };
    if (patch.price !== undefined) productChange.price = patch.price;
    if (patch.inStock !== undefined) productChange.inStock = patch.inStock;
    if (patch.sizes !== undefined) productChange.sizes = patch.sizes;
    await repos.products.update({ id: productIdOf(id) }, productChange);
    await bumpCatalog(repos);
  }
  return next;
}

export async function deleteItems(repos: Repos, a: BrandAccount, ids: string[]) {
  const items = await repos.brandItems.find({ id: { $in: ids }, accountId: a.id });
  const inLooks = await piecesInLooks(repos);
  for (const item of items) await retireProduct(repos, item.id, { inLooks });
  if (items.length) await repos.brandItems.delete({ id: { $in: items.map((i) => i.id) } });
  // Photos no other piece uses go too.
  const used = new Set((await repos.brandItems.find({ accountId: a.id })).flatMap((i) => i.images));
  const orphans = items.flatMap((i) => i.images).filter((u) => u.startsWith('/api/brand-images/') && !used.has(u)).map((u) => u.split('/').pop()!);
  if (orphans.length) await repos.brandImages.delete({ id: { $in: orphans }, accountId: a.id });
  await bumpCatalog(repos);
  return items.length;
}

/**
 * Takes a piece out of the Studio. A piece that is part of a look stays (as sold out) so the look
 * still opens; otherwise it is deleted.
 */
async function retireProduct(repos: Repos, itemId: string, { keepItem = false, inLooks }: { keepItem?: boolean; inLooks?: Set<string> } = {}) {
  const pid = productIdOf(itemId);
  if (!(await repos.products.findOne({ id: pid }))) return;
  const used = keepItem ? null : (inLooks ?? (await piecesInLooks(repos)));
  if (keepItem || used!.has(pid)) await repos.products.update({ id: pid }, { inStock: false, checkedAt: new Date().toISOString() });
  else await repos.products.delete({ id: pid });
}

/** Every piece used in any look (drafts too). */
async function piecesInLooks(repos: Repos) {
  return new Set((await repos.designs.find({}, { omit: ['brandIds'] })).flatMap((d) => d.items.map((i) => i.productId)));
}

/** Tells the running API to reload its in-memory catalogue (see catalogStore.ts). */
async function bumpCatalog(repos: Repos) {
  const now = new Date().toISOString();
  const meta = await repos.meta.findOne({ id: 'catalog' });
  if (meta) await repos.meta.update({ id: 'catalog' }, { version: now });
  else await repos.meta.upsert({ id: 'catalog', version: now, syncedAt: now, products: await repos.products.count(), inStock: await repos.products.count({ inStock: true }) });
}

/** Shop words for each slot, so the tagging rules read the piece the way they read a shop's. */
const SLOT_WORD: Record<Slot, string> = {
  main: 'kurta suit',
  bottom: 'trousers',
  dupatta: 'dupatta',
  footwear: 'shoes',
  bag: 'bag',
  jewelry: 'jewellery',
  waistcoat: 'waistcoat',
  accessory: 'accessory',
  layer: 'jacket',
};
const DEFAULT_KIND: Record<Slot, string> = {
  main: 'straight',
  bottom: 'bottom',
  dupatta: 'dupatta',
  footwear: 'flat',
  bag: 'shoulder bag',
  jewelry: 'earrings',
  waistcoat: 'waistcoat',
  accessory: 'watch',
  layer: 'jacket',
};
export const CATEGORY_LABEL: Record<Slot, string> = {
  main: 'Outfit (kurta, suit, dress)',
  bottom: 'Bottom (trousers, shalwar)',
  dupatta: 'Dupatta, shawl or scarf',
  footwear: 'Shoes',
  bag: 'Bag',
  jewelry: 'Jewellery',
  waistcoat: 'Waistcoat',
  accessory: 'Accessory (watch, belt, sunglasses)',
  layer: 'Coat, jacket or sweater',
};

/**
 * The piece as players see it. The brand's own answers come first; anything it left out (the kind of
 * outfit, sleeves, occasions, season) is worked out by the same rules as copied products.
 */
export function toProduct(item: BrandItem, brand: { id: string; name: string; tier: Product['tier'] }, arrivedAt: string): Product {
  const now = new Date().toISOString();
  const tagged = normalize(
    {
      brandId: brand.id,
      sourceId: item.id,
      url: item.url,
      title: item.title,
      productType: SLOT_WORD[item.slot],
      tags: [],
      categories: [SLOT_WORD[item.slot]],
      text: item.description ?? '',
      options: { Colour: item.colors, Size: item.sizes },
      variants: [{ title: 'Default', price: item.price, available: true }],
      images: item.images,
    },
    { id: brand.id, name: brand.name, origin: '', platform: 'shopify', tier: brand.tier, sells: item.gender },
    now,
  );
  const auto = tagged.ok && tagged.product.slot === item.slot ? tagged.product : null;
  const embellishment = item.embellishment ?? auto?.embellishment ?? 0;
  const sleeve = item.sleeve ?? auto?.sleeve;
  const length = item.length ?? auto?.length;
  const neckline = item.neckline ?? auto?.neckline;
  const sheer = auto?.sheer ?? false;
  const silhouette = auto?.silhouette ?? (item.slot === 'main' && item.gender === 'male' ? 'kurta' : DEFAULT_KIND[item.slot]);
  const modesty =
    item.slot === 'main' && item.gender === 'female' ? modestyScore({ sleeve, length, neckline, sheer })
    : item.slot === 'bottom' ? bottomModesty(length ?? 'full')
    : (auto?.modesty ?? 5);
  const occasions: Occasion[] = item.occasions?.length ? item.occasions : (auto?.occasions ?? (embellishment >= 2 ? ['eid', 'mehndi', 'baraat', 'walima', 'party'] : ['casual', 'university', 'office', 'eid']));
  return {
    id: productIdOf(item.id),
    brandId: brand.id,
    brandName: brand.name,
    tier: brand.tier,
    title: item.title,
    slot: item.slot,
    ...(item.gender === 'male' ? { gender: 'male' as const } : {}),
    price: item.price,
    colors: item.colors,
    hex: PALETTE[item.colors[0]]?.hex ?? '#999999',
    fabric: item.fabric?.toLowerCase() || auto?.fabric || 'other',
    silhouette,
    ...(sleeve ? { sleeve } : {}),
    ...(length ? { length } : {}),
    ...(neckline ? { neckline } : {}),
    sheer,
    embellishment,
    modesty,
    occasions,
    seasons: item.season ? [item.season] : (auto?.seasons ?? ['all']),
    includesDupatta: item.includesDupatta ?? auto?.includesDupatta ?? false,
    includesBottom: item.includesBottom ?? auto?.includesBottom ?? false,
    stitched: item.stitched ?? auto?.stitched ?? true,
    sizes: item.sizes,
    inStock: item.inStock,
    url: item.url,
    images: item.images,
    checkedAt: now,
    arrivedAt,
    demo: false,
    source: 'brand',
  };
}

/* ---------------------------------- spreadsheets ---------------------------------- */

const yes = (v?: string) => /^(y|yes|true|1|haan|ha)$/i.test(v?.trim() ?? '');
const no = (v?: string) => /^(n|no|false|0|nahi)$/i.test(v?.trim() ?? '');
const list = (v?: string) => (v ?? '').split(/[|,;]/).map((x) => x.trim()).filter(Boolean);

const CATEGORY_WORDS: Array<[RegExp, Slot]> = [
  [/waist ?coat/i, 'waistcoat'],
  [/coat|jacket|sweater|cardigan|shrug|hoodie|blazer|layer/i, 'layer'],
  [/dupatta|shawl|stole|scarf|hijab|chadd?ar/i, 'dupatta'],
  [/shoe|footwear|khussa|heel|sandal|chappal|sneaker|loafer|peshawari|flat/i, 'footwear'],
  [/bag|clutch|purse|tote|potli/i, 'bag'],
  [/jewel|earring|necklace|bangle|ring|bracelet|jhumk|tikka/i, 'jewelry'],
  [/accessor|watch|belt|sunglass|cufflink|brooch|cap/i, 'accessory'],
  [/bottom|trouser|shalwar|salwar|pant|jeans|culotte|palazzo|sharara|gharara|skirt|pajama/i, 'bottom'],
  [/outfit|main|kurta|kurti|kameez|suit|dress|shirt|frock|top|lawn|unstitched|stitched|co-?ord|gown|lehenga/i, 'main'],
];
const pick = <T,>(v: string | undefined, map: Record<string, T>): T | undefined => {
  const k = v?.trim().toLowerCase().replace(/[\s_-]+/g, '');
  return k ? map[k] : undefined;
};

/** The spreadsheet columns, in the template's order, with what each one means. */
export const COLUMNS: Array<{ key: string; required: boolean; help: string; example: string }> = [
  { key: 'title', required: true, help: 'Name of the piece', example: 'Embroidered lawn 3-piece suit' },
  { key: 'category', required: true, help: 'outfit, bottom, dupatta, shoes, bag, jewellery, accessory, coat or waistcoat', example: 'outfit' },
  { key: 'for', required: true, help: 'women or men', example: 'women' },
  { key: 'price', required: true, help: 'Price in rupees, numbers only', example: '8990' },
  { key: 'photos', required: true, help: 'Photo links (https://...) or names of photo files you add below, separated by |', example: 'https://your-shop.pk/photo-1.jpg|suit-back.jpg' },
  { key: 'link', required: true, help: 'Where players buy it (your product page, Instagram or WhatsApp link)', example: 'https://your-shop.pk/products/lawn-suit' },
  { key: 'colours', required: false, help: 'Up to 2 colours from our colour list, separated by |', example: 'emerald|gold' },
  { key: 'fabric', required: false, help: 'lawn, cotton, chiffon, silk, khaddar, velvet...', example: 'lawn' },
  { key: 'sizes', required: false, help: 'Sizes in stock, separated by |', example: 'S|M|L' },
  { key: 'in_stock', required: false, help: 'yes or no (empty = yes)', example: 'yes' },
  { key: 'occasions', required: false, help: 'office, university, casual, eid, mehndi, baraat, walima, party (separated by |)', example: 'eid|party' },
  { key: 'season', required: false, help: 'summer, winter or all', example: 'summer' },
  { key: 'work', required: false, help: 'Embellishment: plain, light, medium or heavy', example: 'medium' },
  { key: 'stitched', required: false, help: 'Outfits: yes or no', example: 'no' },
  { key: 'with_dupatta', required: false, help: 'Outfits: comes with a dupatta? yes or no', example: 'yes' },
  { key: 'with_bottom', required: false, help: 'Outfits: comes with a trouser or shalwar? yes or no', example: 'yes' },
  { key: 'sleeves', required: false, help: 'sleeveless, short, three-quarter or full', example: 'full' },
  { key: 'length', required: false, help: 'short, knee, midi or full', example: 'full' },
  { key: 'neckline', required: false, help: 'open, regular or high', example: 'regular' },
  { key: 'description', required: false, help: 'A few words about the piece', example: 'Printed lawn shirt with an embroidered neckline' },
];

/**
 * One spreadsheet row (column name -> text) as an item. Lenient about how things are written
 * ("Women", "W", "Rs 8,990", "Yes"); the item then goes through the same checks as the form.
 */
export function parseRow(row: Record<string, string>): ItemInput {
  const get = (k: string) => {
    const hit = Object.keys(row).find((x) => x.trim().toLowerCase().replace(/[\s-]+/g, '_') === k);
    return hit ? row[hit]?.trim() : undefined;
  };
  const category = get('category') ?? '';
  const slot = CATEGORY_WORDS.find(([re]) => re.test(category))?.[1];
  if (!slot) throw new AppError(400, category ? `Unknown category “${category}”` : 'Category is empty');
  const who = get('for') ?? '';
  const gender = /^(m|men|mens|men's|male|gents|boys?)$/i.test(who) ? 'male' : /^(w|women|womens|women's|female|ladies|girls?)$/i.test(who) ? 'female' : null;
  if (!gender) throw new AppError(400, `“for” must be women or men${who ? ` (found “${who}”)` : ''}`);
  const price = Number((get('price') ?? '').replace(/rs\.?|pkr|,|\s/gi, ''));
  const work = pick(get('work'), { plain: 0, none: 0, light: 1, medium: 2, heavy: 3, '0': 0, '1': 1, '2': 2, '3': 3 } as Record<string, 0 | 1 | 2 | 3>);
  const bool = (k: string) => (yes(get(k)) ? true : no(get(k)) ? false : undefined);
  const stock = get('in_stock');
  const input = {
    title: get('title') ?? '',
    slot,
    gender,
    price: Math.round(price),
    colors: list(get('colours') ?? get('colors')).map((c) => c.toLowerCase()),
    fabric: get('fabric') || undefined,
    sizes: list(get('sizes')),
    inStock: stock ? !no(stock) : true,
    url: get('link') ?? '',
    images: list(get('photos')),
    description: get('description') || undefined,
    occasions: list(get('occasions')).map((o) => o.toLowerCase()),
    season: pick(get('season'), { summer: 'summer', winter: 'winter', all: 'all', allyear: 'all', any: 'all' } as Record<string, 'summer' | 'winter' | 'all'>),
    embellishment: work,
    stitched: bool('stitched'),
    includesDupatta: bool('with_dupatta'),
    includesBottom: bool('with_bottom'),
    sleeve: pick(get('sleeves'), { sleeveless: 'sleeveless', short: 'short', half: 'short', threequarter: 'three-quarter', '3/4': 'three-quarter', full: 'full', long: 'full' } as Record<string, 'sleeveless' | 'short' | 'three-quarter' | 'full'>),
    length: pick(get('length'), { short: 'short', knee: 'knee', midi: 'midi', full: 'full', long: 'full', ankle: 'full' } as Record<string, 'short' | 'knee' | 'midi' | 'full'>),
    neckline: pick(get('neckline'), { open: 'open', regular: 'regular', round: 'regular', high: 'high' } as Record<string, 'open' | 'regular' | 'high'>),
  };
  if (!input.occasions.length) delete (input as { occasions?: string[] }).occasions;
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'This row is not complete');
  return parsed.data;
}

/** Adds a spreadsheet's rows: good rows are added (waiting for approval), the rest come back with the reason. */
export async function bulkCreate(repos: Repos, a: BrandAccount, rows: Array<Record<string, string>>, batchId: string) {
  const good: ItemInput[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  for (const [i, row] of rows.entries()) {
    try {
      good.push(await checkItem(repos, a, parseRow(row)));
    } catch (e) {
      errors.push({ row: i, message: (e as Error).message });
    }
  }
  const made = good.length ? await createItems(repos, a, good, batchId) : [];
  return { created: made.length, errors };
}

/* -------------------------------------- photos -------------------------------------- */

const DATA_URL = /^data:image\/(jpeg|png|webp|gif|avif|heic|heif);base64,([A-Za-z0-9+/=]+)$/;

/** Stores an uploaded photo, shrunk to at most 1200 × 1600 px as WebP (about 60–150 KB). */
export async function uploadImage(repos: Repos, a: BrandAccount, dataUrl: string) {
  const m = dataUrl.match(DATA_URL);
  if (!m) throw new AppError(400, 'Please upload a JPG, PNG or WebP photo');
  if ((await repos.brandImages.count({ accountId: a.id })) >= MAX_IMAGES) throw new AppError(400, `You have uploaded ${MAX_IMAGES} photos, the most allowed. Use photo links, or delete old pieces.`);
  let out: Buffer;
  try {
    out = await sharp(Buffer.from(m[2], 'base64')).rotate().resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new AppError(400, 'That file could not be read as a photo');
  }
  const id = uid();
  await repos.brandImages.insert({ id, accountId: a.id, mime: 'image/webp', data: out.toString('base64'), bytes: out.length, at: new Date().toISOString() });
  return { id, url: `/api/brand-images/${id}`, bytes: out.length };
}

/* ---------------------------------- the brand's items ---------------------------------- */

export const ITEM_FILTERS = ['all', 'pending', 'approved', 'rejected', 'live', 'sold-out'] as const;

/** How players used the brand's approved pieces: picks in Runway looks, and clicks to buy. */
async function itemUsage(repos: Repos, brandId: string) {
  const [designs, clicks] = await Promise.all([repos.designs.find({ status: { $ne: 'draft' } }), repos.events.find({ brandId, type: 'click' })]);
  const picks = new Map<string, number>();
  for (const d of designs) if (!d.hidden) for (const i of d.items) if (i.productId.startsWith('bi:')) picks.set(i.productId, (picks.get(i.productId) ?? 0) + 1);
  const clicked = new Map<string, number>();
  for (const e of clicks) if (e.productId) clicked.set(e.productId, (clicked.get(e.productId) ?? 0) + 1);
  return { picks, clicked };
}

export async function listItems(repos: Repos, a: BrandAccount, q: { filter?: (typeof ITEM_FILTERS)[number]; search?: string; page?: number }) {
  let items = await repos.brandItems.find({ accountId: a.id }, { sort: { createdAt: -1 } });
  const counts = {
    all: items.length,
    pending: items.filter((i) => i.status === 'pending').length,
    approved: items.filter((i) => i.status === 'approved').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
    live: items.filter((i) => i.status === 'approved' && i.inStock).length,
    'sold-out': items.filter((i) => !i.inStock).length,
  };
  const f = q.filter ?? 'all';
  if (f === 'pending' || f === 'approved' || f === 'rejected') items = items.filter((i) => i.status === f);
  if (f === 'live') items = items.filter((i) => i.status === 'approved' && i.inStock);
  if (f === 'sold-out') items = items.filter((i) => !i.inStock);
  const term = q.search?.trim().toLowerCase();
  if (term) items = items.filter((i) => i.title.toLowerCase().includes(term));
  const { picks, clicked } = await itemUsage(repos, a.brandId!);
  const hidden = new Set(settings().hiddenProductIds);
  const page = Math.max(0, q.page ?? 0);
  const per = 30;
  return {
    counts,
    total: items.length,
    page,
    pages: Math.max(1, Math.ceil(items.length / per)),
    items: items.slice(page * per, page * per + per).map((i) => ({
      ...publicItem(i),
      picks: picks.get(productIdOf(i.id)) ?? 0,
      clicks: clicked.get(productIdOf(i.id)) ?? 0,
      hiddenByAdmin: hidden.has(productIdOf(i.id)),
    })),
  };
}

export const publicItem = (i: BrandItem) => {
  const { accountId: _a, ...rest } = i;
  return rest;
};

export async function getItem(repos: Repos, a: BrandAccount, id: string) {
  const item = await repos.brandItems.findOne({ id, accountId: a.id });
  if (!item) throw new AppError(404, 'Piece not found');
  return publicItem(item);
}

/* -------------------------------- admin: review queue -------------------------------- */

export async function reviewQueue(repos: Repos, q: { accountId?: string; page?: number }) {
  const where = { status: 'pending' as const, ...(q.accountId ? { accountId: q.accountId } : {}) };
  const total = await repos.brandItems.count(where);
  const page = Math.max(0, q.page ?? 0);
  const items = await repos.brandItems.find(where, { sort: { createdAt: 1 }, skip: page * 40, limit: 40 });
  const accounts = await repos.brandAccounts.find({}, { omit: ['passwordHash', 'resetTokenHash'] });
  const name = new Map(accounts.map((x) => [x.id, x.brandName]));
  // Per brand, how many wait, so the admin can work brand by brand.
  const waiting = await repos.brandItems.find({ status: 'pending' }, { omit: ['description', 'images'] });
  const byBrand = new Map<string, number>();
  for (const i of waiting) byBrand.set(i.accountId, (byBrand.get(i.accountId) ?? 0) + 1);
  const live = new Set((await repos.products.find({ id: { $in: items.map((i) => productIdOf(i.id)) } })).map((p) => p.id));
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / 40)),
    brands: [...byBrand].map(([accountId, n]) => ({ accountId, brandName: name.get(accountId) ?? 'Unknown brand', n })).sort((x, y) => y.n - x.n),
    items: items.map((i) => ({ ...publicItem(i), accountId: i.accountId, brandName: name.get(i.accountId) ?? 'Unknown brand', edit: live.has(productIdOf(i.id)) })),
  };
}

/** Approves pieces (players see them within a minute) or turns them down with a reason. */
export async function reviewItems(repos: Repos, ids: string[], approve: boolean, note = '') {
  const items = await repos.brandItems.find({ id: { $in: ids }, status: 'pending' });
  const now = new Date().toISOString();
  for (const item of items) {
    if (approve) {
      const brand = await repos.brands.findOne({ id: item.brandId });
      if (!brand) continue;
      const before = await repos.products.findOne({ id: productIdOf(item.id) });
      await repos.products.upsert(toProduct(item, brand, before?.arrivedAt ?? now));
      await repos.brandItems.update({ id: item.id }, { status: 'approved', note: undefined, reviewedAt: now });
    } else {
      await repos.brandItems.update({ id: item.id }, { status: 'rejected', note: note || undefined, reviewedAt: now });
      await retireProduct(repos, item.id, { keepItem: true });
    }
  }
  if (items.length) await bumpCatalog(repos);
  return items.length;
}
