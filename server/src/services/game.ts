/**
 * The dress-up game. Players pick a design challenge (a styling request) and, from every brand,
 * and hang a complete look together from real products. Other players rate the designs; well-rated
 * designs become human-made examples the AI stylist can learn from.
 *
 * Every challenge's rules are enforced here, the same way the stylist enforces them: only in-stock
 * pieces that meet the challenge's coverage, occasion and colours can be chosen, so every
 * design is one the stylist could actually recommend.
 */
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import { FORMAL_OCCASIONS, maxPieces, slotsFor, type Challenge, type ChatConstraints, type Design, type DesignComment, type Gender, type LookItem, type Occasion, type Product, type Profile, type Season, type Slot } from '../types.js';
import { minModestyFor } from './modesty.js';
import { currentSeason, formality, suitsOccasion } from './composer.js';
import { uid } from './looks.js';
import { settings } from './settings.js';

/** A search becomes a public challenge only once this many stylist searches asked for it. */
export const MIN_ASKS = 2;
const PER_SLOT = 60;

export type GameSlot = Slot;
export const CLOTHING_SLOTS: Slot[] = ['main', 'bottom', 'dupatta', 'waistcoat', 'layer'];

/** A product's gender; everything imported before menswear is women's. */
export const genderOf = (x: { gender?: Gender }): Gender => x.gender ?? 'female';

const OCCASION_LABEL: Record<Occasion, string> = {
  office: 'Office',
  university: 'University',
  casual: 'Everyday',
  eid: 'Eid',
  mehndi: 'Mehndi',
  baraat: 'Baraat',
  walima: 'Walima',
  party: 'Party',
};

export const LAUNCH_PRIZE = 'Top-voted look wins a PKR 10,000 voucher';

/** The launch challenges: wedding season, featured first until the launch week ends. */
export const LAUNCH: Array<Omit<Challenge, 'id' | 'key' | 'source' | 'asks' | 'createdAt'> & { slug: string }> = [
  { slug: 'launch-mehndi', title: 'Mehndi look under PKR 20,000', occasion: 'mehndi', colors: [], coverage: 3, wantsDupatta: true, budget: 20000, prize: LAUNCH_PRIZE, launch: true },
  { slug: 'launch-baraat-guest', title: 'Baraat guest look under PKR 35,000', occasion: 'baraat', colors: [], coverage: 3, wantsDupatta: true, budget: 35000, prize: LAUNCH_PRIZE, launch: true },
  { slug: 'launch-walima-modest', title: 'Walima look, modest', occasion: 'walima', colors: [], coverage: 4, wantsDupatta: true, prize: LAUNCH_PRIZE, launch: true },
  { slug: 'launch-winter-wedding', title: 'Winter wedding with a shawl or coat', occasion: 'baraat', colors: [], coverage: 3, wantsDupatta: false, season: 'winter', required: ['layer'], prize: LAUNCH_PRIZE, launch: true },
  { slug: 'launch-nikkah', gender: 'male', title: 'Nikkah: shalwar kameez and waistcoat', occasion: 'walima', colors: [], coverage: 1, wantsDupatta: false, required: ['waistcoat'], silhouettes: ['shalwar kameez', 'kurta'], prize: LAUNCH_PRIZE, launch: true },
];

/** Until the launch week ends, the launch challenges are the featured ones. */
export const launchOn = (now = Date.now()) => now < Date.parse(config.launchEnds);

/** Ships with the app so the game has challenges before the stylist launches. */
const SEED: Array<Omit<Challenge, 'id' | 'key' | 'source' | 'asks' | 'createdAt'> & { slug: string }> = [
  { slug: 'mehndi-mustard', occasion: 'mehndi', colors: ['mustard', 'lemon'], coverage: 3, wantsDupatta: true },
  { slug: 'mehndi-green', occasion: 'mehndi', colors: ['emerald', 'mint', 'olive'], coverage: 3, wantsDupatta: true },
  { slug: 'walima-pastel-modest', occasion: 'walima', colors: ['blush', 'mint', 'lilac', 'sky', 'peach', 'lemon'], coverage: 4, wantsDupatta: true },
  { slug: 'baraat-red', occasion: 'baraat', colors: ['red', 'maroon'], coverage: 3, wantsDupatta: true },
  { slug: 'baraat-guest-jewel', occasion: 'baraat', colors: ['royal', 'teal', 'emerald', 'plum'], coverage: 3, wantsDupatta: true },
  { slug: 'eid-white', occasion: 'eid', colors: ['white', 'ivory'], coverage: 3, wantsDupatta: true },
  { slug: 'eid-pink-modest', occasion: 'eid', colors: ['pink', 'blush'], coverage: 4, wantsDupatta: true },
  { slug: 'party-black', occasion: 'party', colors: ['black'], coverage: 2, wantsDupatta: false },
  { slug: 'office-soft', occasion: 'office', colors: ['beige', 'sage', 'sky', 'grey'], coverage: 3, wantsDupatta: false },
  { slug: 'office-navy-modest', occasion: 'office', colors: ['navy'], coverage: 4, wantsDupatta: true },
  { slug: 'university-easy', occasion: 'university', colors: [], coverage: 3, wantsDupatta: false },
  { slug: 'casual-summer', occasion: 'casual', colors: ['peach', 'lemon', 'mint', 'sky'], coverage: 2, wantsDupatta: false, season: 'summer' },
  // Winter briefs: khaddar, velvet and karandi outfits, shawls, and a coat or sweater on top.
  { slug: 'winter-everyday', occasion: 'casual', colors: [], coverage: 3, wantsDupatta: false, season: 'winter' },
  { slug: 'winter-wedding-guest', occasion: 'walima', colors: ['maroon', 'emerald', 'navy', 'plum', 'black'], coverage: 3, wantsDupatta: true, season: 'winter' },
  { slug: 'winter-office', occasion: 'office', colors: ['brown', 'beige', 'grey', 'rust', 'olive', 'black'], coverage: 3, wantsDupatta: false, season: 'winter' },
  // Men's challenges: coverage and dupatta do not apply to menswear.
  { slug: 'men-eid-white', gender: 'male', occasion: 'eid', colors: ['white', 'ivory', 'beige'], coverage: 1, wantsDupatta: false },
  { slug: 'men-eid-pastel', gender: 'male', occasion: 'eid', colors: ['sky', 'mint', 'sage', 'lilac', 'peach'], coverage: 1, wantsDupatta: false },
  { slug: 'men-mehndi', gender: 'male', occasion: 'mehndi', colors: ['mustard', 'lemon', 'olive', 'emerald'], coverage: 1, wantsDupatta: false },
  { slug: 'men-baraat', gender: 'male', occasion: 'baraat', colors: ['ivory', 'gold', 'beige', 'maroon'], coverage: 1, wantsDupatta: false },
  { slug: 'men-walima', gender: 'male', occasion: 'walima', colors: ['navy', 'black', 'grey', 'maroon'], coverage: 1, wantsDupatta: false },
  { slug: 'men-office', gender: 'male', occasion: 'office', colors: ['white', 'sky', 'navy', 'grey', 'beige'], coverage: 1, wantsDupatta: false },
  { slug: 'men-casual', gender: 'male', occasion: 'casual', colors: [], coverage: 1, wantsDupatta: false },
  { slug: 'men-winter-casual', gender: 'male', occasion: 'casual', colors: [], coverage: 1, wantsDupatta: false, season: 'winter' },
  { slug: 'men-winter-wedding', gender: 'male', occasion: 'baraat', colors: ['black', 'maroon', 'navy', 'brown', 'grey'], coverage: 1, wantsDupatta: false, season: 'winter' },
  // Launch week (from 27 Nov 2026): wedding season, featured first, with a prize for the top-voted look.
  ...LAUNCH,
];

/** One key per kind of request, so repeat searches count up the same challenge. */
export function challengeKey(c: Pick<Challenge, 'occasion' | 'colors' | 'coverage' | 'wantsDupatta' | 'gender' | 'season' | 'tiers' | 'brandIds' | 'maxPrice' | 'budget' | 'required' | 'silhouettes' | 'launch'>): string {
  const key = [c.occasion, [...c.colors].sort().join('+') || 'any', c.coverage, c.wantsDupatta ? 'dupatta' : '-'];
  return [
    ...key,
    ...(c.gender === 'male' ? ['male'] : []),
    ...(c.season ? [c.season] : []),
    // A player's own brief: its budget and brands make it a different request.
    ...(c.tiers?.length ? [`tiers=${[...c.tiers].sort().join('+')}`] : []),
    ...(c.brandIds?.length ? [`brands=${[...c.brandIds].sort().join('+')}`] : []),
    ...(c.maxPrice ? [`max=${c.maxPrice}`] : []),
    // A set challenge's own rules make it a different challenge too.
    ...(c.budget ? [`budget=${c.budget}`] : []),
    ...(c.required?.length ? [`needs=${[...c.required].sort().join('+')}`] : []),
    ...(c.silhouettes?.length ? [`kinds=${[...c.silhouettes].sort().join('+')}`] : []),
    ...(c.launch ? ['launch'] : []),
  ].join('|');
}

export async function seedChallenges(repos: Repos): Promise<void> {
  for (const { slug, ...c } of SEED) {
    const id = `seed-${slug}`;
    const existing = await repos.challenges.findOne({ id });
    await repos.challenges.upsert({
      ...c,
      id,
      key: challengeKey(c),
      source: 'seed',
      asks: existing?.asks ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      // The admin may have taken it off the list; a restart keeps it off.
      ...(existing?.hidden ? { hidden: true } : {}),
    });
  }
}

/**
 * Called after a stylist search succeeds. Keeps only the structured request (no message, no user),
 * The game has no budget: each design's total is kept, so the stylist can later show a shopper
 * only the community looks within their own budget.
 */
export async function recordSearchChallenge(repos: Repos, profile: Profile, c: ChatConstraints): Promise<void> {
  if (!c.occasion) return;
  const formal = FORMAL_OCCASIONS.includes(c.occasion);
  const coverage = c.extraModesty ? Math.min(5, Math.max(4, profile.coverage + 1)) : profile.coverage;
  const wantsDupatta = c.wantsDupatta ?? (profile.hijab || profile.dupatta === 'always' || (profile.dupatta === 'formal' && formal));
  const base = { occasion: c.occasion, colors: [...new Set(c.colors)].sort().slice(0, 6), coverage: Math.round(coverage), wantsDupatta };
  const key = challengeKey(base);
  // Counted in one step, so two searches at the same moment both count. A new kind of request gets
  // an id made from its key: if another search created it a moment earlier, ours counts on theirs.
  const existing = await repos.challenges.findOne({ key });
  if (existing) return repos.challenges.increment({ id: existing.id }, 'asks', 1);
  const id = `search-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
  try {
    await repos.challenges.insert({ ...base, id, key, source: 'search', asks: 1, createdAt: new Date().toISOString() });
  } catch {
    await repos.challenges.increment({ key }, 'asks', 1);
  }
}

export function challengeTitle(c: Challenge): string {
  if (c.title) return c.title;
  const colours = c.colors.length ? ` · ${c.colors.slice(0, 3).join(', ')}${c.colors.length > 3 ? ' or similar' : ''}` : '';
  const occasion = c.season ? `${c.season === 'winter' ? 'Winter' : 'Summer'} ${OCCASION_LABEL[c.occasion].toLowerCase()}` : OCCASION_LABEL[c.occasion];
  return `${occasion} ${genderOf(c) === 'male' ? 'look' : 'outfit'}${colours}`;
}

/** A seasonal challenge out of season (a summer brief in December) goes to the end of the list. */
const offSeason = (c: Pick<Challenge, 'season'>, now = new Date()) => Boolean(c.season && c.season !== currentSeason(now));

export function publicChallenge(c: Challenge, designs: number) {
  return {
    id: c.id,
    featured: isFeatured(c),
    title: challengeTitle(c),
    occasion: c.occasion,
    colors: c.colors,
    coverage: c.coverage,
    modest: c.coverage >= 4,
    wantsDupatta: c.wantsDupatta,
    gender: genderOf(c),
    season: c.season ?? null,
    fromShoppers: c.source === 'search',
    custom: c.source === 'custom',
    tiers: c.tiers ?? [],
    brandIds: c.brandIds ?? [],
    maxPrice: c.maxPrice ?? null,
    budget: c.budget ?? null,
    required: c.required ?? [],
    // The prize line shows while the launch is on.
    prize: c.prize && launchOn() ? c.prize : null,
    asks: c.asks,
    designs,
  };
}

/** Can players see and play this challenge? Seeded and admin-made ones, and searches enough shoppers asked for, unless the admin hid it. */
export const listable = (c: Challenge) => !c.hidden && (c.source === 'seed' || c.source === 'admin' || (c.source === 'search' && c.asks >= MIN_ASKS));

/** Challenges a player can design for: all seeded ones, plus searches enough shoppers asked for. */
export async function listChallenges(repos: Repos) {
  const all = (await repos.challenges.find()).filter(listable);
  // Counted by the database, one challenge at a time, instead of loading every look.
  const counts = await Promise.all(all.map((c) => repos.designs.count({ challengeId: c.id, ...PUBLISHED })));
  const count = new Map(all.map((c, i) => [c.id, counts[i]]));
  // This week's challenges first, then this season's, then shoppers' real requests (most asked), then
  // the seeded ones; briefs for the other season come last.
  const season = currentSeason();
  const rank = (c: Challenge) => (isFeatured(c) ? 3 : c.season === season ? 2 : offSeason(c) ? 0 : 1);
  all.sort((a, b) => rank(b) - rank(a) || (b.source === 'search' ? 1 : 0) - (a.source === 'search' ? 1 : 0) || b.asks - a.asks || a.id.localeCompare(b.id));
  return all.map((c) => publicChallenge(c, count.get(c.id) ?? 0));
}

export async function loadChallenge(repos: Repos, id: string): Promise<Challenge> {
  const c = await repos.challenges.findOne({ id });
  if (!c || c.hidden || (c.source === 'search' && c.asks < MIN_ASKS)) throw new AppError(404, 'Challenge not found');
  return c;
}

/**
 * The pieces a player may choose for a challenge, per slot, from every brand, best fit first.
 */
/** "New in": a piece that arrived on the brand's site in the last two weeks. */
export const NEW_DAYS = 14;
export const isNew = (p: Product, now = Date.now()) => {
  const at = p.arrivedAt ? Date.parse(p.arrivedAt) : NaN;
  return at <= now && now - at < NEW_DAYS * 86_400_000;
};

export function gameItems(catalog: Product[], c: Challenge, perSlot = PER_SLOT, now = new Date()): Partial<Record<Slot, Product[]>> {
  const gender = genderOf(c);
  const minModesty = minModestyFor(c.coverage);
  const bottomMin = minModesty >= 3.5 ? 5 : minModesty >= 2.5 ? 3 : 0;
  // A seasonal brief uses its own season; any other uses the season it is now (winter: Nov to Feb).
  const season: Season = c.season ?? currentSeason(now);
  const forSeason = (p: Product) => p.seasons.includes(season) || p.seasons.includes('all');
  const usable = catalog.filter(
    (p) => p.inStock && genderOf(p) === gender && suitsOccasion(p, c.occasion) && (!c.season || forSeason(p)) && (!c.tiers?.length || c.tiers.includes(p.tier)),
  );
  // A player's own brief can name brands: those brands' pieces only, unless none of them sells that
  // kind of piece (a clothing brand with no shoes), then every brand's.
  const brands = c.brandIds?.length ? new Set(c.brandIds) : null;
  // A brief's outfit price, and a challenge's whole-look budget: no single piece can cost more.
  const priceOk = (p: Product) => (!c.maxPrice || p.slot !== 'main' || p.price <= c.maxPrice) && (!c.budget || p.price <= c.budget);
  const kindOk = (p: Product) => !c.silhouettes?.length || c.silhouettes.includes(p.silhouette);
  const festive = FORMAL_OCCASIONS.includes(c.occasion);
  // Best fit for the challenge first, not cheapest first: the order nudges what players pick, and
  // their picks teach the stylist. Outfits: mainly the asked colour, then dressier for festive briefs.
  // Everything else: the challenge's level of dress-up, then (festive) the finer piece first.
  // In-season pieces rise and off-season ones sink (khaddar and coats in winter, lawn in summer).
  const seasonFit = (p: Product) => (p.seasons.includes(season) ? 1 : p.seasons.includes('all') ? 0 : -1.5);
  // New arrivals get a small lift, so a fresh drop shows near the top without burying a better fit.
  const fit = (p: Product) =>
    seasonFit(p) +
    (isNew(p, now.getTime()) ? 0.5 : 0) +
    (p.slot === 'main'
      ? (c.colors.includes(p.colors[0]) ? 2 : 0) + (festive ? 0.5 * p.embellishment : -0.3 * p.embellishment)
      : -Math.abs(formality(p) - (festive ? 2.5 : 0.5)));
  const of = (slot: Slot, keep: (p: Product) => boolean = () => true) => {
    const all = usable.filter((p) => p.slot === slot && priceOk(p) && keep(p));
    const fromBrands = brands ? all.filter((p) => brands.has(p.brandId)) : all;
    return (fromBrands.length ? fromBrands : all)
      .sort((a, b) => fit(b) - fit(a) || (festive ? b.price - a.price : a.price - b.price) || a.id.localeCompare(b.id))
      .slice(0, perSlot);
  };
  const colourOk = (p: Product) => !c.colors.length || p.colors.some((col) => c.colors.includes(col));
  if (gender === 'male') {
    return {
      main: of('main', (p) => p.occasions.includes(c.occasion) && colourOk(p) && kindOk(p)),
      bottom: of('bottom'),
      waistcoat: of('waistcoat', (p) => p.occasions.includes(c.occasion) || !FORMAL_OCCASIONS.includes(c.occasion)),
      layer: of('layer', (p) => p.occasions.includes(c.occasion)),
      footwear: of('footwear'),
      accessory: of('accessory'),
    };
  }
  return {
    main: of('main', (p) =>
      kindOk(p) &&
      p.modesty >= minModesty &&
      p.occasions.includes(c.occasion) &&
      (!c.colors.length || p.colors.some((col) => c.colors.includes(col))) &&
      // A modest or dupatta brief is not asking for a western dress with a scarf on top.
      !((c.coverage >= 4 || c.wantsDupatta) && p.silhouette === 'western'),
    ),
    bottom: of('bottom', (p) => p.modesty >= bottomMin),
    dupatta: of('dupatta', (p) => p.occasions.includes(c.occasion) || !FORMAL_OCCASIONS.includes(c.occasion)),
    layer: of('layer', (p) => p.occasions.includes(c.occasion)),
    footwear: of('footwear'),
    bag: of('bag'),
    jewelry: of('jewelry'),
    accessory: of('accessory'),
  };
}

/* ------------------------------ Studio piece browser ------------------------------ */

export const PIECES_PAGE = 24;
export const PIECE_SORTS = ['best', 'new', 'price-asc', 'price-desc'] as const;
export type PieceSort = (typeof PIECE_SORTS)[number];

export interface PieceQuery {
  slot: Slot;
  /** Words to find in the title or brand */
  q?: string;
  brand?: string;
  color?: string;
  min?: number;
  max?: number;
  sort?: PieceSort;
  page?: number;
}

/** One card in the Studio: a product and its other colours (the same piece, from the same brand). */
export interface PieceGroup {
  key: string;
  variants: Product[];
}

/** Interleaves brands within each window, so the first rows are never one brand, while keeping best fit first. */
function mixBrands(groups: PieceGroup[], window = 48): PieceGroup[] {
  const out: PieceGroup[] = [];
  for (let i = 0; i < groups.length; i += window) {
    const buckets = new Map<string, PieceGroup[]>();
    for (const g of groups.slice(i, i + window)) {
      const b = g.variants[0].brandId;
      buckets.set(b, [...(buckets.get(b) ?? []), g]);
    }
    const lists = [...buckets.values()];
    while (lists.some((l) => l.length)) for (const l of lists) if (l.length) out.push(l.shift()!);
  }
  return out;
}

/**
 * The Studio's grid for one slot of a challenge: only pieces that fit the challenge (gameItems), with
 * colour variants grouped into one card, then searched, filtered, sorted and paged. Also returns the
 * brands and colours on offer, for the filters.
 */
export function gamePieces(catalog: Product[], c: Challenge, query: PieceQuery) {
  const all = gameItems(catalog, c, Infinity)[query.slot] ?? [];
  const byKey = new Map<string, Product[]>();
  for (const p of all) {
    const key = `${p.brandId}|${p.title.trim().toLowerCase()}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  let groups: PieceGroup[] = [...byKey].map(([key, variants]) => ({ key, variants }));

  const brands = new Map<string, { id: string; name: string; count: number }>();
  for (const g of groups) {
    const p = g.variants[0];
    const b = brands.get(p.brandId) ?? { id: p.brandId, name: p.brandName, count: 0 };
    b.count++;
    brands.set(p.brandId, b);
  }
  const colors = [...new Set(all.map((p) => p.colors[0]))].sort();

  const words = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const keep = (p: Product) =>
    (!query.color || p.colors.includes(query.color)) &&
    (query.min === undefined || p.price >= query.min) &&
    (query.max === undefined || p.price <= query.max);
  groups = groups
    .filter((g) => !query.brand || g.variants[0].brandId === query.brand)
    .filter((g) => words.every((w) => `${g.variants[0].title} ${g.variants[0].brandName}`.toLowerCase().includes(w)))
    .map((g) => ({ ...g, variants: g.variants.filter(keep) }))
    .filter((g) => g.variants.length > 0);

  const cheapest = (g: PieceGroup) => Math.min(...g.variants.map((p) => p.price));
  const sort = query.sort ?? 'best';
  if (sort === 'price-asc') groups.sort((a, b) => cheapest(a) - cheapest(b) || a.key.localeCompare(b.key));
  else if (sort === 'price-desc') groups.sort((a, b) => cheapest(b) - cheapest(a) || a.key.localeCompare(b.key));
  else if (sort === 'new') {
    // Newest arrivals first; pieces with no known date keep their best-fit order after them.
    const newest = (g: PieceGroup) => Math.max(0, ...g.variants.map((p) => (p.arrivedAt ? Date.parse(p.arrivedAt) || 0 : 0)));
    const order = new Map(mixBrands(groups).map((g, i) => [g.key, i]));
    groups.sort((a, b) => newest(b) - newest(a) || order.get(a.key)! - order.get(b.key)!);
  }
  else groups = mixBrands(groups);

  const pages = Math.max(1, Math.ceil(groups.length / PIECES_PAGE));
  const page = Math.min(Math.max(1, query.page ?? 1), pages);
  return {
    slot: query.slot,
    groups: groups.slice((page - 1) * PIECES_PAGE, page * PIECES_PAGE),
    total: groups.length,
    page,
    pages,
    brands: [...brands.values()].sort((a, b) => a.name.localeCompare(b.name)),
    colors,
  };
}

type Rule = 'required' | 'optional' | 'included';

/** Which slots a look needs, given its main piece: a suit may bring its own bottom (and dupatta). */
export function slotRules(main: Product, c: Challenge): Partial<Record<Slot, Rule>> {
  const bottom: Rule = main.includesBottom ? 'included' : 'required';
  const rules: Partial<Record<Slot, Rule>> =
    genderOf(c) === 'male'
      ? { bottom, waistcoat: 'optional', layer: 'optional', footwear: 'required', accessory: 'optional' }
      : {
          bottom,
          dupatta: main.includesDupatta ? 'included' : c.wantsDupatta ? 'required' : 'optional',
          layer: 'optional',
          footwear: 'required',
          bag: 'optional',
          jewelry: 'optional',
          accessory: 'optional',
        };
  // A challenge can ask for more (a coat for a winter wedding, a waistcoat for a nikkah).
  for (const slot of c.required ?? []) if (rules[slot] === 'optional') rules[slot] = 'required';
  return rules;
}

const SLOT_WORD: Partial<Record<Slot, string>> = { footwear: 'shoes', jewelry: 'jewellery', layer: 'a coat or jacket', accessory: 'accessories' };

export async function submitDesign(
  repos: Repos,
  userId: string,
  input: { challengeId: string; items: LookItem[]; draft?: boolean },
): Promise<Design> {
  const c = await loadChallenge(repos, input.challengeId);
  // One piece per slot, except jewellery and accessories (up to three: earrings, rings and a bracelet).
  const perSlot = new Map<Slot, number>();
  for (const it of input.items) perSlot.set(it.slot, (perSlot.get(it.slot) ?? 0) + 1);
  for (const [slot, n] of perSlot) {
    if (n > maxPieces(slot)) throw new AppError(400, maxPieces(slot) > 1 ? `Up to ${maxPieces(slot)} pieces of ${SLOT_WORD[slot] ?? slot}` : 'One piece per slot');
  }
  if (new Set(input.items.map((i) => i.productId)).size !== input.items.length) throw new AppError(400, 'Each piece only once');

  const catalog = await repos.products.find({ id: { $in: input.items.map((i) => i.productId) } });
  const allowed = gameItems(catalog, c);
  const chosen = new Map<Slot, Product[]>();
  for (const it of input.items) {
    const p = allowed[it.slot]?.find((x) => x.id === it.productId);
    if (!p) throw new AppError(400, 'That piece does not fit this challenge');
    chosen.set(it.slot, [...(chosen.get(it.slot) ?? []), p]);
  }
  const main = chosen.get('main')?.[0];
  if (!main) throw new AppError(400, 'Choose an outfit first');
  const rules = slotRules(main, c);
  for (const slot of slotsFor(genderOf(c)).filter((x) => x !== 'main')) {
    const rule = rules[slot];
    const word = SLOT_WORD[slot] ?? `a ${slot}`;
    if (rule === 'required' && !chosen.has(slot)) throw new AppError(400, `This look needs ${word}`);
    if (rule === 'included' && chosen.has(slot)) throw new AppError(400, `This outfit already comes with ${word}`);
  }
  const pieces = [...chosen].flatMap(([slot, ps]) => ps.map((p) => ({ slot, p })));
  const total = pieces.reduce((n, x) => n + x.p.price, 0);
  if (c.budget && total > c.budget) {
    throw new AppError(400, `This look costs Rs ${total.toLocaleString('en-PK')}, over the Rs ${c.budget.toLocaleString('en-PK')} budget. Swap a piece for a cheaper one.`);
  }

  const design: Design = {
    id: uid(),
    userId,
    challengeId: c.id,
    // The brands the clothes came from, for brand reports.
    brandIds: [...new Set(pieces.filter((x) => CLOTHING_SLOTS.includes(x.slot)).map((x) => x.p.brandId))],
    items: pieces.map((x) => ({ slot: x.slot, productId: x.p.id })),
    total,
    up: 0,
    down: 0,
    createdAt: new Date().toISOString(),
    status: input.draft ? 'draft' : 'published',
  };
  // One draft per player: saving a changed look replaces the previous draft.
  if (input.draft) await discardDrafts(repos, userId);
  await repos.designs.insert(design);
  if (!input.draft) await countFriend(repos, userId, design.id);
  return design;
}

/**
 * A player who joined from a friend's share link counts for that friend once, when they publish
 * their first look. Every few friends (config.preview.friendsForCredit) earn the friend one more AI
 * preview, up to a cap. The friend hears about each one.
 */
export async function countFriend(repos: Repos, userId: string, designId: string) {
  const me = await repos.users.findOne({ id: userId });
  if (!me?.referredBy || me.referralCounted) return;
  // One atomic step: two looks published at once still count once.
  const marked = await repos.users.update({ id: userId, referralCounted: { $ne: true } }, { referralCounted: true });
  if (!marked) return;
  const friend = await repos.users.findOne({ id: me.referredBy });
  if (!friend) return;
  await repos.users.increment({ id: friend.id }, 'referrals', 1);
  const count = (friend.referrals ?? 0) + 1;
  const { friendsForCredit, friendCreditCap } = config.preview;
  const earned = count % friendsForCredit === 0 && (friend.referralCredits ?? 0) < friendCreditCap;
  if (earned) {
    await repos.users.increment({ id: friend.id }, 'previewCredits', 1);
    await repos.users.increment({ id: friend.id }, 'referralCredits', 1);
  }
  const toGo = friendsForCredit - (count % friendsForCredit || friendsForCredit);
  await repos.notifications.insert({
    id: `friend:${userId}`,
    userId: friend.id,
    type: 'friend',
    actorId: userId,
    designId,
    text: earned ? 'You earned a free AI preview!' : (friend.referralCredits ?? 0) >= friendCreditCap ? 'Thanks for sharing Saleeqa!' : `${toGo} more friend${toGo === 1 ? '' : 's'} for a free AI preview.`,
    at: new Date().toISOString(),
    read: false,
  });
}

/** Published and not hidden by the admin: what other players can see. */
export const isPublished = (d: Design) => d.status !== 'draft' && !d.hidden;
/** The same rule as a database filter: a look with no status was published before drafts existed. */
export const PUBLISHED = { status: { $ne: 'draft' as const }, hidden: { $ne: true } };

/** Which looks the Runway shows: women's or men's, and/or one occasion (both come from the look's challenge). */
export interface FeedScope {
  gender?: Gender;
  occasion?: Occasion;
}

/** The database filter for a scope: looks whose challenge matches (none when the scope is everything). */
async function scopeFilter(repos: Repos, scope: FeedScope = {}) {
  if (!scope.gender && !scope.occasion) return {};
  const ids = (await repos.challenges.find(scope.occasion ? { occasion: scope.occasion } : {}))
    .filter((c) => !scope.gender || genderOf(c) === scope.gender)
    .map((c) => c.id);
  return { challengeId: { $in: ids } };
}

async function discardDrafts(repos: Repos, userId: string) {
  for (const d of (await repos.designs.find({ userId, status: 'draft' }))) {
    await repos.designs.delete({ id: d.id });
  }
}

/** Publishes the player's draft. */
export async function publishDesign(repos: Repos, userId: string, designId: string): Promise<Design> {
  const d = await repos.designs.findOne({ id: designId, userId });
  if (!d) throw new AppError(404, 'Design not found');
  if (d.status !== 'draft') return d;
  const published = (await repos.designs.update({ id: d.id }, { status: 'published', createdAt: new Date().toISOString() }))!;
  await countFriend(repos, userId, d.id);
  return published;
}

export async function hydrateDesigns(repos: Repos, designs: Design[]) {
  const ids = [...new Set(designs.flatMap((d) => d.items.map((i) => i.productId)))];
  const products = ids.length ? await repos.products.find({ id: { $in: ids } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const challengeIds = [...new Set(designs.map((d) => d.challengeId))];
  const challenges = challengeIds.length ? await repos.challenges.find({ id: { $in: challengeIds } }) : [];
  const cById = new Map(challenges.map((c) => [c.id, c]));
  return designs.map((d) => {
    const c = cById.get(d.challengeId);
    return {
      id: d.id,
      challenge: c ? publicChallenge(c, 0) : null,
      items: d.items.map((i) => ({ slot: i.slot, product: byId.get(i.productId)! })).filter((i) => i.product),
      total: d.total,
      up: d.up,
      down: d.down,
      createdAt: d.createdAt,
      /** The AI image of the look on a model, when the designer previewed it */
      previewUrl: d.previewId ? `/api/previews/${d.previewId}` : null,
    };
  });
}

/** Someone else's design this player has not rated yet; designs with the fewest votes first. */
export async function nextDesignToRate(repos: Repos, userId: string) {
  const voted = new Set((await repos.designVotes.find({ userId })).map((v) => v.designId));
  const open = (await repos.designs.find({ ...PUBLISHED, userId: { $ne: userId } })).filter((d) => !voted.has(d.id));
  open.sort((a, b) => a.up + a.down - (b.up + b.down) || a.createdAt.localeCompare(b.createdAt));
  if (!open.length) return null;
  return (await hydrateDesigns(repos, [open[0]]))[0];
}

export async function recount(repos: Repos, designId: string) {
  const votes = await repos.designVotes.find({ designId });
  const up = votes.filter((v) => v.up).length;
  await repos.designs.update({ id: designId }, { up, down: votes.length - up });
}

/** 👍 (true), 👎 (false), or take your vote back (null). Designers may vote on their own looks too. */
export async function voteDesign(repos: Repos, userId: string, designId: string, up: boolean | null) {
  const d = await repos.designs.findOne({ id: designId });
  if (!d || !isPublished(d)) throw new AppError(404, 'Design not found');
  if (up === null) await repos.designVotes.delete({ id: `${designId}:${userId}` });
  else await repos.designVotes.upsert({ id: `${designId}:${userId}`, designId, userId, up, at: new Date().toISOString() });
  await recount(repos, designId);
  // The designer hears about likes (one per person, however often they tap); never about dislikes.
  const like = `like:${designId}:${userId}`;
  if (up === true && d.userId !== userId) {
    const was = await repos.notifications.findOne({ id: like });
    if (!was) await repos.notifications.insert({ id: like, userId: d.userId, type: 'like', actorId: userId, designId, at: new Date().toISOString(), read: false });
  } else await repos.notifications.delete({ id: like });
}

/* --------------------------------- My taste feed --------------------------------- */

export const FEED_PAGE = 12;
export const FEED_SORTS = ['new', 'trending', 'top'] as const;
export type FeedSort = (typeof FEED_SORTS)[number];
const HOUR = 60 * 60 * 1000;
/** Only a first name is shown with a look or comment, never the full name or email. */
const firstName = (name?: string) => (name ?? '').trim().split(/\s+/)[0] || 'A stylist';

async function namesOf(repos: Repos, userIds: string[]) {
  const ids = [...new Set(userIds)];
  const users = ids.length ? await repos.users.find({ id: { $in: ids } }) : [];
  // The player's username; older accounts that have not picked one yet show their first name.
  return new Map(users.map((u) => [u.id, u.username ?? firstName(u.name)]));
}

/**
 * Everyone's published looks (or only women's or men's), with the viewer's own vote.
 * - new: newest first; `before` is the last look's "createdAt|id".
 * - trending: likes and comments, weighed down by age, so fresh looks people love rise to the top.
 * - top: the most liked of the last 7 days.
 * Trending and top page by position: `before` is how many looks were already shown.
 */
export async function feed(repos: Repos, viewerId: string, before?: string, scope: FeedScope = {}, sort: FeedSort = 'new') {
  if (sort !== 'new') return rankedFeed(repos, viewerId, sort, Number(before) || 0, scope);
  // The page marker is "createdAt|id", so looks published in the same millisecond are never skipped.
  const [bAt, bId = ''] = (before ?? '').split('|');
  const older = (d: Design) => !before || d.createdAt < bAt || (d.createdAt === bAt && d.id < bId);
  // The database returns just the next page, newest first: looks up to the marker's time (a few
  // extra, for looks published in that same millisecond), then the ones already shown are dropped.
  const rows = await repos.designs.find(
    { ...PUBLISHED, ...(await scopeFilter(repos, scope)), ...(before ? { createdAt: { $lte: bAt } } : {}) },
    { sort: { createdAt: -1, id: -1 }, limit: FEED_PAGE + 1 + 20 },
  );
  const all = rows.filter(older);
  const page = all.slice(0, FEED_PAGE);
  return {
    looks: await feedLooks(repos, viewerId, page),
    next: all.length > FEED_PAGE ? `${page[page.length - 1].createdAt}|${page[page.length - 1].id}` : null,
  };
}

async function rankedFeed(repos: Repos, viewerId: string, sort: 'trending' | 'top', offset: number, scope: FeedScope = {}) {
  const now = Date.now();
  // Only recent looks can rank: the week for "top", two months for "trending" (older looks' scores
  // are too small to reach the first pages), so the database never returns the whole history.
  const since = new Date(now - (sort === 'top' ? 7 : 60) * 24 * HOUR).toISOString();
  let all = await repos.designs.find({ ...PUBLISHED, createdAt: { $gte: since }, ...(await scopeFilter(repos, scope)) });
  const talk = new Map<string, number>();
  const said = all.length ? await repos.comments.find({ designId: { $in: all.map((d) => d.id) } }) : [];
  for (const c of said) talk.set(c.designId, (talk.get(c.designId) ?? 0) + 1);
  const age = (d: Design) => Math.max(0, now - Date.parse(d.createdAt)) / HOUR;
  const newer = (a: Design, b: Design) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  if (sort === 'top') {
    all = all.filter((d) => age(d) <= 7 * 24);
    all.sort((a, b) => b.up - a.up || (talk.get(b.id) ?? 0) - (talk.get(a.id) ?? 0) || newer(a, b));
  } else {
    const score = (d: Design) => (d.up + 2 * (talk.get(d.id) ?? 0) + 1) / Math.pow(age(d) + 2, 1.5);
    all.sort((a, b) => score(b) - score(a) || newer(a, b));
  }
  const page = all.slice(offset, offset + FEED_PAGE);
  return { looks: await feedLooks(repos, viewerId, page), next: offset + FEED_PAGE < all.length ? String(offset + FEED_PAGE) : null };
}

/** Published designs as Runway looks: pieces, the designer's first name, the viewer's vote, comment count. */
async function feedLooks(repos: Repos, viewerId: string, page: Design[]) {
  const looks = await hydrateDesigns(repos, page);
  const names = await namesOf(repos, page.map((d) => d.userId));
  const myVotes = new Map((await repos.designVotes.find({ userId: viewerId })).map((v) => [v.designId, v.up]));
  const comments = page.length ? await repos.comments.find({ designId: { $in: page.map((d) => d.id) } }) : [];
  const count = new Map<string, number>();
  for (const c of comments) count.set(c.designId, (count.get(c.designId) ?? 0) + 1);
  return looks.map((l, i) => ({
    ...l,
    by: names.get(page[i].userId) ?? 'A stylist',
    /** For a link to the designer's profile */
    byId: page[i].userId,
    mine: page[i].userId === viewerId,
    myVote: myVotes.has(l.id) ? (myVotes.get(l.id) ? ('up' as const) : ('down' as const)) : null,
    comments: count.get(l.id) ?? 0,
  }));
}

/**
 * Live like and comment counts for the looks on someone's screen (the Runway and look pages poll
 * this). Published looks only; drafts and unknown ids are left out. Counts are public, like the looks.
 */
export async function liveCounts(repos: Repos, ids: string[]) {
  const designs = (await repos.designs.find({ id: { $in: ids } })).filter(isPublished);
  if (!designs.length) return {};
  const comments = await repos.comments.find({ designId: { $in: designs.map((d) => d.id) } });
  const count = new Map<string, number>();
  for (const c of comments) count.set(c.designId, (count.get(c.designId) ?? 0) + 1);
  return Object.fromEntries(designs.map((d) => [d.id, { likes: d.up, comments: count.get(d.id) ?? 0 }]));
}

/** One published look, for its own page on the Runway. */
export async function feedLook(repos: Repos, viewerId: string, designId: string) {
  const d = await repos.designs.findOne({ id: designId });
  if (!d || !isPublished(d)) throw new AppError(404, 'Look not found');
  return (await feedLooks(repos, viewerId, [d]))[0];
}

export async function listComments(repos: Repos, viewerId: string, designId: string) {
  const d = await repos.designs.findOne({ id: designId });
  if (!d || !isPublished(d)) throw new AppError(404, 'Design not found');
  const comments = await repos.comments.find({ designId });
  comments.sort((a, b) => a.at.localeCompare(b.at));
  const names = await namesOf(repos, comments.map((c) => c.userId));
  return comments.map((c) => ({
    id: c.id,
    by: names.get(c.userId) ?? 'A stylist',
    text: c.text,
    at: c.at,
    parentId: c.parentId ?? null,
    mine: c.userId === viewerId,
    // The commenter, or the look's designer (to keep their own look's comments kind).
    canDelete: c.userId === viewerId || d.userId === viewerId,
  }));
}

/** A new comment, or (with `parentId`) a reply. Replying to a reply joins the same thread. */
export async function addComment(repos: Repos, userId: string, designId: string, text: string, parentId?: string) {
  const d = await repos.designs.findOne({ id: designId });
  if (!d || !isPublished(d)) throw new AppError(404, 'Design not found');
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) throw new AppError(400, 'Write a comment first');
  let thread: string | undefined;
  let repliedTo: string | undefined;
  if (parentId) {
    const parent = await repos.comments.findOne({ id: parentId });
    if (!parent || parent.designId !== designId) throw new AppError(404, 'That comment was deleted');
    thread = parent.parentId ?? parent.id;
    repliedTo = parent.userId;
  }
  const at = new Date().toISOString();
  const commentId = uid();
  await repos.comments.insert({ id: commentId, designId, userId, text: clean, at, ...(thread ? { parentId: thread } : {}) });
  // The person replied to hears about the reply; the designer hears about every other comment.
  const note = { designId, commentId, actorId: userId, text: clean.slice(0, 120), at, read: false };
  if (repliedTo && repliedTo !== userId) await repos.notifications.insert({ ...note, id: uid(), userId: repliedTo, type: 'reply' });
  if (d.userId !== userId && d.userId !== repliedTo) await repos.notifications.insert({ ...note, id: uid(), userId: d.userId, type: 'comment' });
  return listComments(repos, userId, designId);
}

/** Deleting a comment deletes its replies with it. */
export async function deleteComment(repos: Repos, userId: string, commentId: string) {
  const c = await repos.comments.findOne({ id: commentId });
  if (!c) throw new AppError(404, 'Comment not found');
  const d = await repos.designs.findOne({ id: c.designId });
  if (c.userId !== userId && d?.userId !== userId) throw new AppError(403, 'You can only delete your own comments');
  const gone = [c.id, ...(await repos.comments.find({ parentId: c.id })).map((r) => r.id)];
  await repos.notifications.delete({ commentId: { $in: gone } });
  await repos.comments.delete({ parentId: c.id });
  await repos.comments.delete({ id: c.id });
}

/** Part of "delete my data": the player's designs, their votes, and the counts those votes touched. */
export async function deleteGameData(repos: Repos, userId: string) {
  const mine = await repos.designs.find({ userId });
  for (const d of mine) {
    await repos.designVotes.delete({ designId: d.id });
    await repos.comments.delete({ designId: d.id });
  }
  // Their comments go, and with them any replies other players left under those comments.
  const theirs = (await repos.comments.find({ userId })).map((c) => c.id);
  if (theirs.length) await repos.comments.delete({ parentId: { $in: theirs } });
  await repos.comments.delete({ userId });
  await repos.designs.delete({ userId });
  // Notifications to them, from them, and about their looks.
  await repos.notifications.delete({ userId });
  await repos.notifications.delete({ actorId: userId });
  if (mine.length) await repos.notifications.delete({ designId: { $in: mine.map((d) => d.id) } });
  const votes = await repos.designVotes.find({ userId });
  await repos.designVotes.delete({ userId });
  for (const id of new Set(votes.map((v) => v.designId))) await recount(repos, id);
}

/* --------------------------------- Notifications --------------------------------- */

/** The player's latest notifications, with who did it and which look, and how many are unread. */
export async function listNotifications(repos: Repos, userId: string) {
  const page = await repos.notifications.find({ userId }, { sort: { at: -1 }, limit: 30 });
  const unread = await repos.notifications.count({ userId, read: false });
  const names = await namesOf(repos, page.map((n) => n.actorId));
  const designs = page.length ? await repos.designs.find({ id: { $in: [...new Set(page.map((n) => n.designId))] } }) : [];
  const byId = new Map(designs.map((d) => [d.id, d]));
  const challenges = designs.length ? await repos.challenges.find({ id: { $in: [...new Set(designs.map((d) => d.challengeId))] } }) : [];
  const cById = new Map(challenges.map((c) => [c.id, c]));
  return {
    unread,
    notifications: page
      .filter((n) => byId.has(n.designId))
      .map((n) => {
        const d = byId.get(n.designId)!;
        const c = cById.get(d.challengeId);
        return {
          id: n.id,
          type: n.type,
          by: names.get(n.actorId) ?? 'A stylist',
          text: n.text ?? null,
          at: n.at,
          read: n.read,
          lookId: d.id,
          lookTitle: c ? challengeTitle(c) : 'your look',
          previewUrl: d.previewId ? `/api/previews/${d.previewId}` : null,
        };
      }),
  };
}

export async function unreadCount(repos: Repos, userId: string) {
  return repos.notifications.count({ userId, read: false });
}

export async function markNotificationsRead(repos: Repos, userId: string) {
  for (const n of await repos.notifications.find({ userId, read: false })) await repos.notifications.update({ id: n.id }, { read: true });
}

/* ------------------------------ Challenge of the week ------------------------------ */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Weeks start on Monday 00:00 Pakistan time (UTC+5). 2024-01-01 was a Monday. */
const WEEK_ZERO = Date.UTC(2024, 0, 1) - 5 * 60 * 60 * 1000;
export const weekIndex = (now = Date.now()) => Math.floor((now - WEEK_ZERO) / WEEK_MS);
/** When week number `i` starts (Monday 00:00 Pakistan time), as an ISO date. */
export const weekStart = (i: number) => new Date(WEEK_ZERO + i * WEEK_MS).toISOString();
export const weekEnds = (now = Date.now()) => new Date(WEEK_ZERO + (weekIndex(now) + 1) * WEEK_MS).toISOString();

/**
 * The seeded challenges, women's and men's, in a fixed order: each week features the next one.
 * A seasonal brief is only featured in its season.
 */
function rotation(gender: Gender, now: number) {
  return SEED.filter((c) => genderOf(c) === gender && !c.launch && !offSeason(c, new Date(now))).map((c) => `seed-${c.slug}`);
}

/** This week's featured challenge for women and for men. Everyone sees the same ones all week. */
export function featuredIds(now = Date.now()): string[] {
  // The admin's own pick comes first, then the launch challenges while the launch is on.
  const picked = settings().featuredIds;
  if (picked.length) return picked;
  if (launchOn(now)) return LAUNCH.map((c) => `seed-${c.slug}`);
  return (['female', 'male'] as Gender[]).map((g) => {
    const ids = rotation(g, now);
    return ids[weekIndex(now) % ids.length];
  });
}
const isFeatured = (c: Pick<Challenge, 'id'>) => featuredIds().includes(c.id);

/**
 * The weekly challenge: this week's featured challenges, when the week ends, and the most liked
 * looks made for them this week (the board people play to top).
 */
export async function weekly(repos: Repos, viewerId: string) {
  // During the launch, the board is the launch challenges' looks since they opened, until the launch ends.
  const launch = launchOn();
  const start = launch ? '2000-01-01T00:00:00.000Z' : new Date(WEEK_ZERO + weekIndex() * WEEK_MS).toISOString();
  const ids = featuredIds();
  const challenges = await repos.challenges.find({ id: { $in: ids } });
  const designs = (await repos.designs.find({ challengeId: { $in: ids } })).filter((d) => isPublished(d) && d.createdAt >= start);
  const count = new Map<string, number>();
  for (const d of designs) count.set(d.challengeId, (count.get(d.challengeId) ?? 0) + 1);
  designs.sort((a, b) => b.up - a.up || a.createdAt.localeCompare(b.createdAt));
  return {
    endsAt: launch ? new Date(config.launchEnds).toISOString() : weekEnds(),
    launch,
    challenges: ids.map((id) => challenges.find((c) => c.id === id)).filter((c): c is Challenge => Boolean(c)).map((c) => publicChallenge(c, count.get(c.id) ?? 0)),
    top: await feedLooks(repos, viewerId, designs.slice(0, 6)),
  };
}

/* ---------------------------------- Player profiles ---------------------------------- */

/** A player's public page: first name, when they joined, their published looks and the likes they earned. */
export async function playerProfile(repos: Repos, viewerId: string, playerId: string) {
  const user = await repos.users.findOne({ id: playerId });
  if (!user) throw new AppError(404, 'Player not found');
  const designs = await repos.designs.find({ userId: playerId, ...PUBLISHED }, { sort: { createdAt: -1 } });
  return {
    id: user.id,
    name: firstName(user.name),
    username: user.username ?? null,
    joined: user.createdAt,
    me: user.id === viewerId,
    stats: { looks: designs.length, likes: designs.reduce((n, d) => n + d.up, 0) },
    looks: await feedLooks(repos, viewerId, designs.slice(0, 60)),
  };
}

/* --------------------------------- Showcase and covers --------------------------------- */

/** A clean first impression: a real name (no catalogue codes), no abaya standing in for an outfit. */
const showcaseTitle = (p: Product) => /^[A-Za-z][A-Za-z0-9 '’&.-]{2,40}$/.test(p.title) && !/abaya/i.test(p.title);

/**
 * A cover photo per challenge: the best-fitting outfit that has a photo, a different one for each
 * challenge where possible. Real product photos, so covers cost nothing to make.
 */
export function challengeCovers(catalog: Product[], challenges: Challenge[]): Map<string, string> {
  const used = new Set<string>();
  const covers = new Map<string, string>();
  for (const c of challenges) {
    const mains = (gameItems(catalog, c, 40).main ?? []).filter((p) => p.images?.length);
    const pick = mains.find((p) => showcaseTitle(p) && !used.has(p.id)) ?? mains.find((p) => !used.has(p.id)) ?? mains[0];
    if (!pick) continue;
    used.add(pick.id);
    covers.set(c.id, pick.images![0]);
  }
  return covers;
}

/**
 * The landing page's Runway: the trending looks that have a model image, each with its latest
 * comment. Public (published looks are public pages); names are first names only.
 */
export async function showcase(repos: Repos, count = 4) {
  const { looks } = await rankedFeed(repos, '', 'trending', 0);
  const withImage = looks.filter((l) => l.previewUrl).slice(0, count);
  const comments = withImage.length ? await repos.comments.find({ designId: { $in: withImage.map((l) => l.id) } }, { sort: { at: -1 } }) : [];
  const latest = new Map<string, DesignComment>();
  for (const c of comments) if (!c.parentId && !latest.has(c.designId)) latest.set(c.designId, c);
  const names = await namesOf(repos, [...latest.values()].map((c) => c.userId));
  return withImage.map((l) => {
    const c = latest.get(l.id);
    // Only what a visitor needs: no viewer fields, no designer id.
    const { mine: _m, myVote: _v, byId: _b, ...rest } = l;
    return { ...rest, comment: c ? { by: names.get(c.userId) ?? 'A stylist', text: c.text } : null };
  });
}
