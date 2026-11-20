import type { Repos } from '../db/index.js';
import { quickGet } from '../catalog/http.js';
import { BRAND_SOURCES } from '../catalog/sources.js';
import type { Product } from '../types.js';
import type { CatalogStore } from './catalogStore.js';

/**
 * Live stock and price for the few pieces of one look, asked of the brand's own shop when someone is
 * about to buy (a look page, "Shop the look"). The nightly sync keeps everything else up to date.
 *
 * Shopify shops answer `/products/<handle>.js` with each size's availability and price (in paisa).
 * A few shops (Breakout) redirect that to a separate storefront; their `/products/<handle>.json`
 * still gives the price, and a 404 there means the piece is gone. Other platforms are not checked.
 */
export interface LiveStock {
  id: string;
  /** False when the shop could not be asked: show the stored stock and price */
  checked: boolean;
  inStock: boolean;
  price: number;
  checkedAt?: string;
}

const CACHE_MS = 15 * 60_000;
const cache = new Map<string, { at: number; value: LiveStock }>();

const stored = (p: Product): LiveStock => ({ id: p.id, checked: false, inStock: p.inStock, price: p.price, checkedAt: p.checkedAt });

/** Asks the shop about one piece. Exported for tests. */
export async function askShop(p: Product, get = quickGet): Promise<LiveStock> {
  const src = BRAND_SOURCES.find((b) => b.id === p.brandId);
  if (!src || src.platform !== 'shopify' || p.demo) return stored(p);
  let path: string;
  try {
    path = new URL(p.url).pathname.replace(/\/$/, '');
  } catch {
    return stored(p);
  }
  if (!/^\/products\/[^/]+$/.test(path)) return stored(p);
  const now = new Date().toISOString();
  try {
    const js = await get(`${src.origin}${path}.js`);
    if (js.status === 200) {
      const j = JSON.parse(js.body) as { available?: boolean; variants?: Array<{ available?: boolean; price?: number }> };
      const variants = (j.variants ?? []).filter((v) => Number(v.price) > 0);
      const live = variants.filter((v) => v.available);
      const prices = (live.length ? live : variants).map((v) => Number(v.price) / 100);
      return { id: p.id, checked: true, inStock: live.length > 0, price: prices.length ? Math.round(Math.min(...prices)) : p.price, checkedAt: now };
    }
    const json = await get(`${src.origin}${path}.json`);
    if (json.status === 404) return { id: p.id, checked: true, inStock: false, price: p.price, checkedAt: now };
    if (json.status === 200) {
      const prices = ((JSON.parse(json.body).product?.variants ?? []) as Array<{ price?: string }>).map((v) => Number(v.price)).filter((n) => n > 0);
      // Still listed; this answer does not say which sizes are left, so the stored stock stands.
      return { id: p.id, checked: true, inStock: p.inStock, price: prices.length ? Math.round(Math.min(...prices)) : p.price, checkedAt: now };
    }
    return stored(p);
  } catch {
    return stored(p); // slow or unreachable shop: never hold the page up
  }
}

/** Live stock for up to a dozen pieces; changes are saved, so the Studio stops offering sold-out pieces. */
export async function liveStock(repos: Repos, ids: string[], store?: CatalogStore, get = quickGet): Promise<LiveStock[]> {
  const unique = [...new Set(ids)].slice(0, 12);
  const products = await repos.products.find({ id: { $in: unique } });
  const now = Date.now();
  const results = await Promise.all(
    products.map(async (p) => {
      const hit = cache.get(p.id);
      if (hit && now - hit.at < CACHE_MS) return hit.value;
      const value = await askShop(p, get);
      if (value.checked) {
        cache.set(p.id, { at: now, value });
        if (cache.size > 5000) cache.delete(cache.keys().next().value!);
        if (value.inStock !== p.inStock || value.price !== p.price) {
          await repos.products.update({ id: p.id }, { inStock: value.inStock, price: value.price, checkedAt: value.checkedAt });
          store?.patch(p.id, { inStock: value.inStock, price: value.price });
        }
      }
      return value;
    }),
  );
  return unique.map((id) => results.find((r) => r.id === id)).filter((r): r is LiveStock => Boolean(r));
}

/** Tests only. */
export const clearLiveCache = () => cache.clear();
