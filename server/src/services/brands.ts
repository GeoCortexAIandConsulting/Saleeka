import type { Repos } from '../db/index.js';
import type { Product } from '../types.js';

/**
 * Brands an admin switched off. Their pieces disappear everywhere: the Studio, the piece grids, the
 * landing demo, briefs and look pages. The list is read from the database at most once a minute (so
 * every server sees a switch within a minute) and at once on the server that made the switch.
 */
export const BRANDS_TTL_MS = 60_000;

const cache = new WeakMap<Repos, { at: number; off: Promise<Set<string>> }>();

export function disabledBrands(repos: Repos): Promise<Set<string>> {
  const hit = cache.get(repos);
  if (hit && Date.now() - hit.at < BRANDS_TTL_MS) return hit.off;
  const off = repos.brands.find({ enabled: false }).then((bs) => new Set(bs.map((b) => b.id)));
  off.catch(() => cache.delete(repos)); // a failed read is retried next time
  cache.set(repos, { at: Date.now(), off });
  return off;
}

/** After a switch: the next read goes to the database. */
export const forgetDisabledBrands = (repos: Repos) => void cache.delete(repos);

/** Only pieces from brands that are switched on. */
export async function withoutDisabled<T extends Pick<Product, 'brandId'>>(repos: Repos, products: T[]): Promise<T[]> {
  const off = await disabledBrands(repos);
  return off.size ? products.filter((p) => !off.has(p.brandId)) : products;
}
