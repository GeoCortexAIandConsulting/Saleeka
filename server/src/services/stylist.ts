/**
 * The AI stylist. Code builds shortlists of real, in-stock items that already pass every hard rule
 * (stylingOptions); the model composes complete, coordinated looks from them and writes a stylist's
 * note; code then checks every pick: it must come from that outfit's shortlist, required pieces must
 * be there, and the total must fit the budget. Anything missing is filled from the shortlist, anything
 * invalid falls back to the rule composer, so the shopper always gets complete, valid looks.
 */
import type { Product, Profile, Slot } from '../types.js';
import { composeLooks, stylingOptions, type AccessorySlot, type ComposeRequest, type ComposedLook, type StylingOption } from './composer.js';
import type { Llm, StyleBrief, StylePick } from './llm.js';

const ACCESSORY_SLOTS: AccessorySlot[] = ['bottom', 'dupatta', 'footwear', 'bag', 'jewelry'];
const DROP_WHEN_OVER: AccessorySlot[] = ['jewelry', 'bag'];

export interface StyledLooks {
  looks: ComposedLook[];
  /** Stylist's note per look ('' where the rule composer made the look) */
  notes: string[];
  /** How many looks the AI stylist composed (the rest came from the rule composer) */
  styledByAi: number;
}

const finish = (p: Product) =>
  p.embellishment >= 3 ? 'heavily embellished' : p.embellishment === 2 ? 'embroidered' : p.embellishment === 1 ? 'printed' : 'plain';

/** Builds the brief with short aliases (P1, P2, ...) in place of product ids. */
export function buildBrief(options: StylingOption[], profile: Profile, req: ComposeRequest, maxBudget: number, count: number) {
  const byAlias = new Map<string, Product>();
  const aliasOf = new Map<string, string>();
  const alias = (p: Product) => {
    let a = aliasOf.get(p.id);
    if (!a) {
      a = `P${aliasOf.size + 1}`;
      aliasOf.set(p.id, a);
      byAlias.set(a, p);
    }
    return a;
  };
  // One compact line per item keeps the prompt small.
  const item = (p: Product) => [alias(p), p.title.slice(0, 48), p.brandName, p.colors.join('/'), p.silhouette, finish(p), `Rs ${p.price}`].join(' | ');
  const brief: StyleBrief = {
    occasion: req.occasion ?? null,
    budgetMax: maxBudget,
    requestedColors: req.preferColors ?? req.colors ?? [],
    shopper: { hijab: profile.hijab || !!req.wantsScarf, colorsLiked: profile.colorsLiked, styleWords: profile.styleWords },
    outfits: options.map((o) => ({
      item: item(o.main),
      fabric: o.main.fabric,
      needsBottom: o.needs.bottom,
      needsDupatta: o.needs.dupatta,
      options: Object.fromEntries(Object.entries(o.options).map(([slot, ps]) => [slot, (ps ?? []).map(item)])),
    })),
    count,
  };
  return { brief, byAlias };
}

const total = (items: Array<{ product: Product }>) => items.reduce((n, i) => n + i.product.price, 0);

/**
 * Turns one stylist pick into a valid, complete look, or null if it cannot be made valid.
 * Exported for tests.
 */
export function validatePick(
  pick: StylePick,
  options: StylingOption[],
  byAlias: Map<string, Product>,
  profile: Profile,
  maxBudget: number,
): { look: ComposedLook; changed: boolean } | null {
  const main = byAlias.get(pick.main);
  const option = options.find((o) => o.main.id === main?.id);
  if (!main || !option) return null;
  const items: Array<{ slot: Slot; product: Product }> = [{ slot: 'main', product: main }];
  let changed = false; // true when code had to fill, swap or drop a piece (the note may no longer fit)
  for (const slot of ACCESSORY_SLOTS) {
    const allowed = option.options[slot] ?? [];
    if (!allowed.length) {
      if (pick[slot]) changed = true; // named a piece this outfit does not take: its note may mention it
      continue;
    }
    const chosen = byAlias.get(String(pick[slot] ?? ''));
    // Only items from this outfit's own shortlist; otherwise use the shortlist's best.
    const product = chosen && allowed.some((a) => a.id === chosen.id) ? chosen : null;
    const needed = slot === 'bottom' ? option.needs.bottom : slot === 'dupatta' ? option.needs.dupatta : true;
    if (product) items.push({ slot, product });
    else if (needed) {
      items.push({ slot, product: allowed[0] });
      changed = true;
    } else if (pick[slot]) changed = true;
  }
  if (option.needs.bottom && !items.some((i) => i.slot === 'bottom')) return null;
  if (option.needs.dupatta && !items.some((i) => i.slot === 'dupatta')) return null;

  // Over budget: cheaper options from the same shortlist first, then drop jewellery, then the bag.
  for (const slot of ACCESSORY_SLOTS) {
    if (total(items) <= maxBudget) break;
    const at = items.findIndex((i) => i.slot === slot);
    if (at < 0) continue;
    const cheaper = (option.options[slot] ?? []).filter((p) => p.price < items[at].product.price).sort((a, b) => b.price - a.price);
    const fits = cheaper.find((p) => total(items) - items[at].product.price + p.price <= maxBudget) ?? cheaper[cheaper.length - 1];
    if (fits) {
      items[at] = { slot, product: fits };
      changed = true;
    }
  }
  for (const slot of DROP_WHEN_OVER) {
    if (total(items) <= maxBudget) break;
    const at = items.findIndex((i) => i.slot === slot);
    if (at >= 0) {
      items.splice(at, 1);
      changed = true;
    }
  }
  if (total(items) > maxBudget) return null;
  return { look: { label: '', occasion: null, items, total: total(items), score: option.score }, changed };
}

const LABELS = ['Best match', 'Fresh pick', 'Smart value'];

/** Complete looks for a request: composed by the AI stylist when a model is configured, else by rules. */
export async function styleLooks(llm: Llm, catalog: Product[], profile: Profile, req: ComposeRequest = {}): Promise<StyledLooks> {
  const count = req.count ?? 3;
  const { options, maxBudget, occasion } = stylingOptions(catalog, profile, req, { mains: Math.max(5, count + 2), perSlot: 4 });
  const out: ComposedLook[] = [];
  const notes: string[] = [];

  if (options.length) {
    const { brief, byAlias } = buildBrief(options, profile, req, maxBudget, count);
    const picks = await llm.style(brief);
    for (const pick of picks ?? []) {
      if (out.length >= count) break;
      const checked = validatePick(pick, options, byAlias, profile, maxBudget);
      if (!checked || out.some((l) => l.items[0].product.id === checked.look.items[0].product.id)) continue;
      checked.look.occasion = occasion ?? null;
      out.push(checked.look);
      // Keep the stylist's note only if the look is exactly what it picked; otherwise explain from facts.
      notes.push(checked.changed ? '' : pick.note.trim());
    }
  }
  const styledByAi = out.length;

  // Fill any shortfall (or everything, without a model) from the rule composer.
  if (out.length < count) {
    const used = out.map((l) => l.items[0].product.id);
    const rules = composeLooks(catalog, profile, { ...req, excludeMainIds: [...(req.excludeMainIds ?? []), ...used], count: count - out.length });
    for (const l of rules) {
      out.push(l);
      notes.push('');
    }
  }
  out.forEach((l, i) => {
    l.label = LABELS[i] ?? 'Also great';
    if (l.label === 'Smart value' && l.total >= out[0].total) l.label = 'Also great';
  });
  return { looks: out, notes, styledByAi };
}
