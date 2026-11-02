/**
 * Outfit composer. Code, not an LLM, decides which real products appear in a look.
 * Pipeline: hard filters (coverage, avoided colours/brands, stock, occasion) ->
 * score candidates -> assemble each slot -> fit the budget -> choose 3 distinct looks.
 */
import { FORMAL_OCCASIONS, type Occasion, type Product, type Profile, type Slot } from '../types.js';
import { PALETTE, harmony } from '../data/palette.js';
import { minModestyFor } from './modesty.js';
import { tasteScore } from './taste.js';

export interface ComposeRequest {
  occasion?: Occasion;
  /** Colour names the main piece should contain (any of). */
  colors?: string[];
  /** Brand ids the main piece should come from (any of). */
  brands?: string[];
  budgetMax?: number;
  extraModesty?: boolean;
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
  if (req.colors?.length && p.colors.some((c) => req.colors!.includes(c))) s += 0.3;
  return s;
}

function accessoryScore(p: Product, main: Product, profile: Profile, occasion: Occasion | undefined): number {
  const h = harmony(main.colors[0], p.colors[0]);
  let s = 0.8 * h + 0.4 * tasteScore(profile.taste, p) + brandBonus(p, profile);
  if (occasion && p.occasions.includes(occasion)) s += 0.2;
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

function wantsDupatta(main: Product, profile: Profile, occasion: Occasion | undefined): boolean {
  if (main.silhouette === 'western') return profile.hijab;
  if (profile.hijab) return true;
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

export function composeLooks(
  catalog: Product[],
  profile: Profile,
  req: ComposeRequest = {},
  now = new Date(),
): ComposedLook[] {
  const season = req.season ?? currentSeason(now);
  const count = req.count ?? 3;
  const maxBudget = req.budgetMax ?? profile.budgetMax;
  const coverage = Math.min(5, profile.coverage + (req.extraModesty ? 1 : 0));
  const minModesty = minModestyFor(coverage);
  const occasion = req.occasion;

  const usable = catalog.filter((p) => p.inStock && !avoidedBy(p, profile));
  const bySlot = (slot: Slot) => usable.filter((p) => p.slot === slot);
  const strictBottoms = bySlot('bottom').filter(
    (p) => p.modesty >= (minModesty >= 3.5 ? 5 : minModesty >= 2.5 ? 3 : 0),
  );

  const mains = bySlot('main')
    .filter((p) => p.modesty >= minModesty)
    .filter((p) => fitsOccasion(p, occasion, profile))
    .filter((p) => !req.excludeMainIds?.includes(p.id))
    .filter((p) => !req.colors?.length || p.colors.some((c) => req.colors!.includes(c)))
    .filter((p) => !req.brands?.length || req.brands!.includes(p.brandId))
    .filter((p) => p.price <= maxBudget)
    .map((p) => ({ p, s: mainScore(p, profile, req, season) }))
    .sort((a, b) => b.s - a.s || a.p.id.localeCompare(b.p.id))
    .slice(0, 30);

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
    if (wantsDupatta(main, profile, occasion)) {
      add('dupatta', best(bySlot('dupatta').filter((d) => (profile.hijab ? d.silhouette === 'scarf' : true))));
      // A shopper who wears hijab must never be shown a look without a scarf.
      if (profile.hijab && !items.some((i) => i.slot === 'dupatta')) return null;
    }
    add('footwear', best(bySlot('footwear').filter((f) => fitsOccasion(f, occasion, profile))));
    add('bag', best(bySlot('bag').filter((b) => fitsOccasion(b, occasion, profile))));
    const formal = occasion ? FORMAL_OCCASIONS.includes(occasion) : false;
    if (formal || profile.styleWords.includes('elegant') || profile.styleWords.includes('bold')) {
      add('jewelry', best(bySlot('jewelry').filter((j) => fitsOccasion(j, occasion, profile))));
    }

    // Fit the budget: swap optional pieces for cheaper compatible ones, then drop them.
    for (const slot of OPTIONAL_DROP_ORDER) {
      if (total(items) <= maxBudget) break;
      const idx = items.findIndex((i) => i.slot === slot);
      if (idx < 0) continue;
      const cheaper = bySlot(slot)
        .filter((c) => c.price < items[idx].product.price && !taken.has(c.id))
        .filter((c) => harmony(main.colors[0], c.colors[0]) >= 0.6)
        .filter((c) => slot !== 'bottom' || strictBottoms.some((b) => b.id === c.id))
        .sort((a, b) => b.price - a.price)[0]; // the priciest option that is still cheaper
      if (cheaper && total(items) - items[idx].product.price + cheaper.price <= maxBudget) {
        taken.add(cheaper.id);
        items[idx] = { slot, product: cheaper };
      } else if (slot === 'jewelry' || slot === 'bag') {
        items.splice(idx, 1); // purely optional
      }
    }
    const sum = total(items);
    if (sum > maxBudget) return null;
    const score = ms + 0.5 * (accN ? accScore / accN : 0) + 0.5 * budgetFit(sum, profile, maxBudget);
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
  const value = valueCandidates.sort((a, b) => a.total - b.total || b.score - a.score)[0];
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
): Array<{ slot: Slot; product: Product }> | null {
  if (slot === 'main') return null; // main swaps re-compose the whole look (see chat service)
  const main = current.find((i) => i.slot === 'main')?.product;
  const old = current.find((i) => i.slot === slot)?.product;
  if (!main) return null;
  const taken = new Set(current.map((i) => i.product.id));
  const minModesty = minModestyFor(profile.coverage);
  const pool = catalog
    .filter((p) => p.slot === slot && p.inStock && !avoidedBy(p, profile))
    .filter((p) => fitsOccasion(p, occasion, profile))
    .filter((p) => slot !== 'bottom' || p.modesty >= (minModesty >= 3.5 ? 5 : minModesty >= 2.5 ? 3 : 0))
    .filter((p) => slot !== 'dupatta' || !profile.hijab || p.silhouette === 'scarf')
    .filter((p) => total(current) - (old?.price ?? 0) + p.price <= maxBudget);
  const next = pickBest(pool, main, profile, occasion, taken, new Set(old ? [old.id] : []));
  if (!next) return null;
  return current.map((i) => (i.slot === slot ? { slot, product: next } : i));
}
