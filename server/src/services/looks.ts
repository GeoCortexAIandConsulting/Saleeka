import { randomUUID } from 'node:crypto';
import type { Repos, ProfileDoc } from '../db/index.js';
import type { Look, Product, Slot } from '../types.js';
import type { ComposedLook } from './composer.js';
import type { LookFacts } from './llm.js';
import { tasteHits } from './llm.js';

export const uid = () => randomUUID();

export interface HydratedLook extends Omit<Look, 'items'> {
  items: Array<{ slot: Slot; product: Product }>;
}

const SLOT_ORDER: Slot[] = ['main', 'bottom', 'dupatta', 'footwear', 'bag', 'jewelry'];

export async function persistLooks(
  repos: Repos,
  userId: string,
  composed: ComposedLook[],
  source: Look['source'],
  reasons: string[] = [],
): Promise<HydratedLook[]> {
  const out: HydratedLook[] = [];
  for (let i = 0; i < composed.length; i++) {
    const c = composed[i];
    const look: Look = {
      id: uid(),
      userId,
      label: c.label,
      occasion: c.occasion,
      items: c.items.map((it) => ({ slot: it.slot, productId: it.product.id })),
      total: c.total,
      score: Math.round(c.score * 100) / 100,
      reason: reasons[i],
      saved: false,
      source,
      createdAt: new Date().toISOString(),
    };
    await repos.looks.insert(look);
    for (const it of c.items) {
      await repos.events.insert({
        id: uid(),
        userId,
        type: 'impression',
        productId: it.product.id,
        brandId: it.product.brandId,
        lookId: look.id,
        at: look.createdAt,
      });
    }
    out.push({ ...look, items: sortItems(c.items) });
  }
  return out;
}

function sortItems<T extends { slot: Slot }>(items: T[]): T[] {
  return [...items].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}

export async function hydrateLooks(repos: Repos, looks: Look[]): Promise<HydratedLook[]> {
  const ids = [...new Set(looks.flatMap((l) => l.items.map((i) => i.productId)))];
  const products = ids.length ? await repos.products.find({ id: { $in: ids } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return looks.map((l) => ({
    ...l,
    items: sortItems(
      l.items
        .map((i) => ({ slot: i.slot, product: byId.get(i.productId)! }))
        .filter((i) => i.product),
    ),
  }));
}

export function factsFor(look: ComposedLook, profile: ProfileDoc): LookFacts {
  const main = look.items[0].product;
  return {
    label: look.label,
    occasion: look.occasion,
    total: look.total,
    tasteHits: tasteHits(main, profile),
    items: look.items.map((i) => ({
      slot: i.slot,
      title: i.product.title,
      brand: i.product.brandName,
      price: i.product.price,
      colors: i.product.colors,
    })),
  };
}

export const sumPrice = (items: Array<{ product: Product }>) => items.reduce((n, i) => n + i.product.price, 0);
