/**
 * Outfit composer. Code, not an LLM, decides which real products appear in a look.
 * Pipeline: hard filters (coverage, avoided colours/brands, stock, occasion) ->
 * score candidates -> assemble each slot -> fit the budget -> choose 3 distinct looks.
 */
import { FORMAL_OCCASIONS, type Occasion, type Product, type Profile, type Slot } from '../types.js';
import { PALETTE, harmony, nearbyColors } from '../data/palette.js';
import { minModestyFor } from './modesty.js';
import { tasteScore } from './taste.js';

export interface ComposeRequest {
  occasion?: Occasion;
  /** Colour names the main piece should contain (any of). */
  colors?: string[];
  /** The colours actually asked for, when `colors` was widened: these rank first, close shades next. */
  preferColors?: string[];
  /** Brand ids the main piece should come from (any of). */
  brands?: string[];
  budgetMax?: number;
  extraModesty?: boolean;
  /** Said in chat, so it overrides the quiz answer. */
  wantsDupatta?: boolean;
  wantsScarf?: boolean;
  excludeMainIds?: string[];
  season?: 'summer' | 'winter';
  count?: number;
}

export interface ComposedLook {
  label: string;
  occasion: Occasion | null;
  items: Array<{ slot: Slot; product: Product }>;
  total: number;
  score: number;
}

const OPTIONAL_DROP_ORDER: Slot[] = ['jewelry', 'bag', 'footwear', 'dupatta', 'bottom'];

export function currentSeason(now = new Date()): 'summer' | 'winter' {
  const m = now.getMonth() + 1; // 1-12
  return m >= 11 || m <= 2 ? 'winter' : 'summer';
}

function avoidedBy(p: Product, profile: Profile): boolean {
  if (profile.brandsAvoided.includes(p.brandId)) return true;
  if (['main', 'bottom', 'dupatta'].includes(p.slot) && p.colors.some((c) => profile.colorsAvoided.includes(c)))
    return true;
  return false;
}

function fitsOccasion(p: Product, occasion: Occasion | undefined, profile: Profile): boolean {
  if (occasion) return p.occasions.includes(occasion);
  return p.occasions.some((o) => profile.occasions.includes(o));
}

function seasonPenalty(p: Product, season: 'summer' | 'winter'): number {
  return p.seasons.includes('all') || p.seasons.includes(season) ? 0 : -0.4;
}

function brandBonus(p: Product, profile: Profile): number {
  return profile.brandsLiked.includes(p.brandId) ? 0.25 : 0;
}

function mainScore(p: Product, profile: Profile, req: ComposeRequest, season: 'summer' | 'winter'): number {
  let s = tasteScore(profile.taste, p);
  s += brandBonus(p, profile);
  s += seasonPenalty(p, season);
  // Requested colours first, and an outfit that is mainly that colour above one that only has a touch of it.
  const asked = req.preferColors?.length ? req.preferColors : req.colors;
  if (asked?.length) {
    if (asked.includes(p.colors[0])) s += 1.5;
    else if (p.colors.some((c) => asked.includes(c))) s += 0.9;
    else if (p.colors.some((c) => nearbyColors(asked).includes(c))) s += 0.5;
  }
  // A festive occasion should look festive: among outfits that qualify, prefer the dressier ones.
  if (req.occasion && FORMAL_OCCASIONS.includes(req.occasion)) s += 0.15 * p.embellishment;
  return s;
}

// Men's kinds sit alongside women's: a sherwani or cufflinks dress up; a tee, polo or jeans dress down.
const DRESSY = new Set(['heel', 'khussa', 'clutch', 'potli', 'jhumkay', 'necklace set', 'maang tikka', 'cufflinks']);
const CASUAL_KIND = new Set(['sneaker', 'flat', 'sandal', 'tote', 'shoulder bag', 'cap']);
const TOO_CASUAL_FOR_FESTIVE = new Set(['sneaker', 'tote', 'shoulder bag', 'tee', 'polo', 'jeans', 'cap']);
const TOO_DRESSY_FOR_DAYTIME = new Set(['clutch', 'potli', 'jhumkay', 'necklace set', 'maang tikka', 'sherwani', 'prince coat', 'cufflinks']);

/** Hard rule: better a look without a bag than sneakers at Eid or a potli at the office. */
export function suitsOccasion(p: Product, occasion: Occasion | undefined): boolean {
  if (!occasion) return true;
  return !(FORMAL_OCCASIONS.includes(occasion) ? TOO_CASUAL_FOR_FESTIVE : TOO_DRESSY_FOR_DAYTIME).has(p.silhouette);
}

/**
 * How dressed-up a piece is: 0 casual, 1 smart, 2 festive, 3 formal. Mains go by embellishment and
 * occasions; accessories by their kind (heels, khussa, clutch, jhumkay dress up; sneakers, totes down).
 */
export function formality(p: Product): number {
  if (p.slot === 'main' || p.slot === 'dupatta' || p.slot === 'bottom' || p.slot === 'waistcoat') {
    const formalOnly = p.occasions.every((o) => FORMAL_OCCASIONS.includes(o));
    return Math.min(3, p.embellishment + (formalOnly ? 1 : 0));
  }
  if (DRESSY.has(p.silhouette)) return p.embellishment >= 2 ? 3 : 2;
  if (CASUAL_KIND.has(p.silhouette)) return p.embellishment >= 2 ? 1 : 0;
  return 1;
}

export function accessoryScore(p: Product, main: Product, profile: Profile, occasion: Occasion | undefined): number {
  const h = harmony(main.colors[0], p.colors[0]);
  let s = 0.8 * h + 0.4 * tasteScore(profile.taste, p) + brandBonus(p, profile);
  if (occasion && p.occasions.includes(occasion)) s += 0.2;
  // Same level of dress-up as the outfit: no sneakers with a formal suit, no clutch with casual lawn.
  if (p.slot !== 'bottom') s -= 0.35 * Math.abs(formality(p) - formality(main));
  // Price balance: a Rs 120 pair of earrings looks cheap next to a Rs 15,000 suit, and vice versa.
  if (p.slot !== 'bottom' && main.price > 0) {
    const ratio = p.price / main.price;
    if (ratio < 0.05 && main.price > 6000) s -= 0.35;
    if (ratio > 0.8) s -= 0.25;
  }
  // A plain accessory with a heavily embellished main (and vice versa) reads balanced.
  if (main.embellishment >= 3 && p.embellishment >= 3 && p.slot === 'dupatta') s -= 0.2;
  return s;
}

function pickBest(
  pool: Product[],
  main: Product,
  profile: Profile,
  occasion: Occasion | undefined,
  taken: Set<string>,
  avoid: Set<string> = new Set(),
  maxPrice = Infinity,
): Product | null {
  let best: Product | null = null;
  let bestScore = -Infinity;
  for (const p of pool) {
    if (taken.has(p.id) || p.price > maxPrice) continue;
    if (harmony(main.colors[0], p.colors[0]) < 0.5) continue; // never pair clashing colours
    const s = accessoryScore(p, main, profile, occasion) - (avoid.has(p.id) ? 0.35 : 0);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}

function scarfOnly(profile: Profile, req: ComposeRequest): boolean {
  return profile.hijab || !!req.wantsScarf;
}

function wantsDupatta(main: Product, profile: Profile, occasion: Occasion | undefined, req: ComposeRequest): boolean {
  if (scarfOnly(profile, req)) return true;
  // What the shopper just said beats the quiz answer.
  if (req.wantsDupatta !== undefined) return req.wantsDupatta && !main.includesDupatta;
  if (main.silhouette === 'western') return false;
  if (profile.dupatta === 'always') return !main.includesDupatta;
  if (profile.dupatta === 'formal') {
    return !main.includesDupatta && !!occasion && FORMAL_OCCASIONS.includes(occasion);
  }
  return false;
}

function total(items: Array<{ product: Product }>): number {
  return items.reduce((n, i) => n + i.product.price, 0);
}

function budgetFit(sum: number, profile: Profile, maxBudget: number): number {
  if (sum > maxBudget) return -1;
  if (sum < profile.budgetMin) return 0.7;
  return 1;
}

/**
 * Hard filters and ranking shared by the rule composer and the AI stylist: only in-stock items
 * that respect coverage, avoided colours and brands, occasion and budget ever reach either.
 */
function prepare(catalog: Product[], profile: Profile, req: ComposeRequest, now: Date) {
  const season = req.season ?? currentSeason(now);
  const maxBudget = req.budgetMax ?? profile.budgetMax;
  // "Modest" in chat means actually modest, even for a shopper whose quiz coverage is low.
  const coverage = req.extraModesty ? Math.min(5, Math.max(4, profile.coverage + 1)) : profile.coverage;
  const minModesty = minModestyFor(coverage);
  const occasion = req.occasion;
  // The stylist dresses women: menswear never enters its looks.
  const usable = catalog.filter((p) => p.gender !== 'male' && p.inStock && !avoidedBy(p, profile) && suitsOccasion(p, occasion));
  const bySlot = (slot: Slot) => usable.filter((p) => p.slot === slot);
  const strictBottoms = bySlot('bottom').filter((p) => p.modesty >= (minModesty >= 3.5 ? 5 : minModesty >= 2.5 ? 3 : 0));
  const mains = bySlot('main')
    .filter((p) => p.modesty >= minModesty)
    // Someone asking for modesty or a head covering is not asking for a midi dress with a scarf on top.
    .filter((p) => !(req.extraModesty || req.wantsDupatta || req.wantsScarf) || p.silhouette !== 'western')
    .filter((p) => fitsOccasion(p, occasion, profile))
    .filter((p) => !req.excludeMainIds?.includes(p.id))
    .filter((p) => !req.colors?.length || p.colors.some((c) => req.colors!.includes(c)))
    .filter((p) => !req.brands?.length || req.brands!.includes(p.brandId))
    .filter((p) => p.price <= maxBudget)
    .map((p) => ({ p, s: mainScore(p, profile, req, season) }))
    .sort((a, b) => b.s - a.s || a.p.id.localeCompare(b.p.id))
    .slice(0, 30);
  return { season, maxBudget, occasion, bySlot, strictBottoms, mains };
}

/** The stylist dresses women only, without a layer: its looks never use the waistcoat, accessory or layer slots. */
export type AccessorySlot = Exclude<Slot, 'main' | 'waistcoat' | 'accessory' | 'layer'>;

export interface StylingOption {
  main: Product;
  score: number;
  /** Slots this outfit must have (bottom when the main has none; dupatta/scarf when the shopper wants one) */
  needs: { bottom: boolean; dupatta: boolean };
  /** The best compatible, in-budget candidates per slot, best first */
  options: Partial<Record<AccessorySlot, Product[]>>;
}

/**
 * Shortlists for the AI stylist: a few varied outfits, each with the best compatible candidates for
 * every other slot. Everything here already passes the hard rules, so whatever the stylist picks
 * from it is allowed.
 */
export function stylingOptions(
  catalog: Product[],
  profile: Profile,
  req: ComposeRequest = {},
  opts: { mains?: number; perSlot?: number } = {},
  now = new Date(),
): { options: StylingOption[]; maxBudget: number; occasion?: Occasion } {
  const { maxBudget, occasion, bySlot, strictBottoms, mains: ranked } = prepare(catalog, profile, req, now);
  const nMains = opts.mains ?? 6;
  const perSlot = opts.perSlot ?? 5;
  // Leave room for shoes, a bag and jewellery: outfits over 75% of the budget rank lower.
  const mains = ranked.map((m) => ({ ...m, s: m.s - (m.p.price > 0.75 * maxBudget ? 0.8 : 0) })).sort((a, b) => b.s - a.s);

  // Varied outfits: best first, then favour a new colour family, brand or cut.
  const picked: typeof mains = [];
  for (const m of mains) {
    if (picked.length >= nMains) break;
    const repeats = picked.filter((x) => familyOf(x.p) === familyOf(m.p) && x.p.brandId === m.p.brandId && x.p.silhouette === m.p.silhouette).length;
    if (repeats === 0 || picked.length + (mains.length - mains.indexOf(m)) <= nMains) picked.push(m);
  }

  const options: StylingOption[] = [];
  for (const { p: main, s } of picked) {
    const room = maxBudget - main.price;
    const rank = (pool: Product[]) =>
      pool
        .filter((p) => p.price <= room && harmony(main.colors[0], p.colors[0]) >= 0.5)
        .map((p) => ({ p, s: accessoryScore(p, main, profile, occasion) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, perSlot)
        .map((x) => x.p);
    const needs = { bottom: !main.includesBottom, dupatta: wantsDupatta(main, profile, occasion, req) };
    const o: StylingOption['options'] = {};
    if (needs.bottom) o.bottom = rank(strictBottoms);
    if (needs.dupatta) o.dupatta = rank(bySlot('dupatta').filter((d) => (scarfOnly(profile, req) ? d.silhouette === 'scarf' : true)));
    o.footwear = rank(bySlot('footwear'));
    o.bag = rank(bySlot('bag'));
    o.jewelry = rank(bySlot('jewelry'));
    // Skip outfits that cannot be completed at all.
    if (needs.bottom && !o.bottom?.length) continue;
    if (needs.dupatta && !o.dupatta?.length) continue;
    options.push({ main, score: s, needs, options: o });
  }
  return { options, maxBudget, occasion };
}

export function composeLooks(
  catalog: Product[],
  profile: Profile,
  req: ComposeRequest = {},
  now = new Date(),
): ComposedLook[] {
  const count = req.count ?? 3;
  const { maxBudget, occasion, bySlot, strictBottoms, mains } = prepare(catalog, profile, req, now);

  /** Build one complete look around a main piece; null if no valid, in-budget look exists. */
  const assemble = (main: Product, ms: number, avoid: Set<string>): ComposedLook | null => {
    const taken = new Set<string>([main.id]);
    const items: Array<{ slot: Slot; product: Product }> = [{ slot: 'main', product: main }];
    let accScore = 0;
    let accN = 0;
    const add = (slot: Slot, product: Product | null) => {
      if (!product) return;
      items.push({ slot, product });
      taken.add(product.id);
      accScore += accessoryScore(product, main, profile, occasion);
      accN++;
    };
    const best = (pool: Product[]) => pickBest(pool, main, profile, occasion, taken, avoid);

    if (!main.includesBottom) {
      add('bottom', best(strictBottoms));
      if (!items.some((i) => i.slot === 'bottom')) return null; // no valid bottom for this top
    }
    if (wantsDupatta(main, profile, occasion, req)) {
      add('dupatta', best(bySlot('dupatta').filter((d) => (scarfOnly(profile, req) ? d.silhouette === 'scarf' : true))));
      // A shopper who wants one must never be shown a look without a dupatta or scarf.
      if (!items.some((i) => i.slot === 'dupatta')) return null;
    }
    // A complete look: shoes, a bag and jewellery whenever the catalog has a fitting one.
    add('footwear', best(bySlot('footwear').filter((f) => fitsOccasion(f, occasion, profile))) ?? best(bySlot('footwear')));
    add('bag', best(bySlot('bag').filter((b) => fitsOccasion(b, occasion, profile))) ?? best(bySlot('bag')));
    add('jewelry', best(bySlot('jewelry').filter((j) => fitsOccasion(j, occasion, profile))) ?? best(bySlot('jewelry')));

    // Fit the budget: try cheaper versions of every piece first, so nothing is lost if a cheaper one
    // would do. Only then drop the purely optional pieces.
    for (const slot of OPTIONAL_DROP_ORDER) {
      if (total(items) <= maxBudget) break;
      const idx = items.findIndex((i) => i.slot === slot);
      if (idx < 0) continue;
      const others = total(items) - items[idx].product.price;
      const cheaper = bySlot(slot)
        .filter((c) => c.price < items[idx].product.price && !taken.has(c.id))
        .filter((c) => harmony(main.colors[0], c.colors[0]) >= 0.6)
        .filter((c) => slot !== 'bottom' || strictBottoms.some((b) => b.id === c.id))
        .filter((c) => slot !== 'dupatta' || !scarfOnly(profile, req) || c.silhouette === 'scarf')
        .sort((a, b) => b.price - a.price);
      // The priciest option that fits the budget, or else the cheapest, to free up the most.
      const next = cheaper.find((c) => others + c.price <= maxBudget) ?? cheaper[cheaper.length - 1];
      if (next) {
        taken.add(next.id);
        items[idx] = { slot, product: next };
      }
    }
    for (const slot of ['jewelry', 'bag'] as Slot[]) {
      if (total(items) <= maxBudget) break;
      const idx = items.findIndex((i) => i.slot === slot);
      if (idx >= 0) items.splice(idx, 1);
    }
    const sum = total(items);
    if (sum > maxBudget) return null;
    const score =
      ms + 0.5 * (accN ? accScore / accN : 0) + 0.5 * budgetFit(sum, profile, maxBudget) - MISSING_PIECE_PENALTY * missingPieces({ items });
    return { label: '', occasion: occasion ?? null, items, total: sum, score };
  };

  const looks = mains.map(({ p, s }) => assemble(p, s, new Set())).filter((l): l is ComposedLook => !!l);
  const chosen = chooseDistinct(looks, count);

  // Give each later look its own accessories where possible, so the three do not look alike.
  const used = new Set<string>(chosen[0]?.items.filter((i) => i.slot !== 'main').map((i) => i.product.id));
  for (let i = 1; i < chosen.length; i++) {
    const main = mainOf(chosen[i]);
    const ms = mains.find((m) => m.p.id === main.id)!.s;
    const redo = assemble(main, ms, used);
    if (redo) {
      redo.label = chosen[i].label;
      if (redo.label === 'Smart value' && redo.total >= chosen[0].total) redo.label = 'Also great';
      chosen[i] = redo;
    }
    chosen[i].items.filter((x) => x.slot !== 'main').forEach((x) => used.add(x.product.id));
  }
  return chosen;
}

function mainOf(l: ComposedLook): Product {
  return l.items[0].product;
}

const MISSING_PIECE_PENALTY = 0.3;

/** How many of shoes, bag and jewellery a look lacks: complete looks rank above sparse ones. */
function missingPieces(l: Pick<ComposedLook, 'items'>): number {
  return (['footwear', 'bag', 'jewelry'] as Slot[]).filter((slot) => !l.items.some((i) => i.slot === slot)).length;
}

function familyOf(p: Product): string {
  return PALETTE[p.colors[0]]?.family ?? 'neutral';
}

/** Pick looks that are genuinely different from each other, with friendly labels. */
function chooseDistinct(looks: ComposedLook[], count: number): ComposedLook[] {
  const sorted = [...looks].sort((a, b) => b.score - a.score || mainOf(a).id.localeCompare(mainOf(b).id));
  if (sorted.length === 0) return [];
  const chosen: ComposedLook[] = [];

  const best = sorted[0];
  best.label = 'Best match';
  chosen.push(best);
  if (count < 2) return chosen;

  const remaining = () => sorted.filter((l) => !chosen.includes(l));
  const novelty = (l: ComposedLook) => {
    let n = 0;
    const m = mainOf(l);
    for (const c of chosen) {
      const cm = mainOf(c);
      if (familyOf(m) !== familyOf(cm)) n += 0.4;
      if (m.brandId !== cm.brandId) n += 0.2;
      if (m.silhouette !== cm.silhouette) n += 0.3;
      if (m.colors[0] !== cm.colors[0]) n += 0.2;
    }
    return n / chosen.length;
  };

  const fresh = remaining()
    .map((l) => ({ l, v: l.score + 1.2 * novelty(l) }))
    .sort((a, b) => b.v - a.v)[0]?.l;
  if (fresh) {
    fresh.label = 'Fresh pick';
    chosen.push(fresh);
  }
  if (count < 3) return chosen;

  const valueCandidates = remaining().filter((l) => l.score >= best.score * 0.6 && l.total < best.total);
  // The cheapest complete look, not simply the look with the fewest pieces.
  const value = valueCandidates.sort((a, b) => missingPieces(a) - missingPieces(b) || a.total - b.total || b.score - a.score)[0];
  if (value) {
    value.label = 'Smart value';
    chosen.push(value);
  }
  // Any extra requested looks: just take the next best.
  for (const l of remaining()) {
    if (chosen.length >= count) break;
    l.label = 'Also great';
    chosen.push(l);
  }
  return chosen;
}

/** Replace one accessory-level item in a look with the next best compatible product. */
export function swapSlot(
  catalog: Product[],
  profile: Profile,
  current: Array<{ slot: Slot; product: Product }>,
  slot: Slot,
  occasion: Occasion | undefined,
  maxBudget: number,
  req: ComposeRequest = {},
): Array<{ slot: Slot; product: Product }> | null {
  if (slot === 'main') return null; // main swaps re-compose the whole look (see chat service)
  const main = current.find((i) => i.slot === 'main')?.product;
  const old = current.find((i) => i.slot === slot)?.product;
  if (!main) return null;
  const taken = new Set(current.map((i) => i.product.id));
  const minModesty = minModestyFor(profile.coverage);
  const pool = catalog
    .filter((p) => p.gender !== 'male' && p.slot === slot && p.inStock && !avoidedBy(p, profile))
    .filter((p) => fitsOccasion(p, occasion, profile) && suitsOccasion(p, occasion))
    .filter((p) => slot !== 'bottom' || p.modesty >= (minModesty >= 3.5 ? 5 : minModesty >= 2.5 ? 3 : 0))
    .filter((p) => slot !== 'dupatta' || !scarfOnly(profile, req) || p.silhouette === 'scarf')
    .filter((p) => total(current) - (old?.price ?? 0) + p.price <= maxBudget);
  const next = pickBest(pool, main, profile, occasion, taken, new Set(old ? [old.id] : []));
  if (!next) return null;
  return current.map((i) => (i.slot === slot ? { slot, product: next } : i));
}
