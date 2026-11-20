import type { Repos } from '../db/index.js';
import type { Product } from '../types.js';

/**
 * The in-stock catalogue, kept in memory. Loading every product from the database takes seconds
 * (tens of thousands of pieces), so it happens once at start-up and again only after a catalog sync:
 * each import bumps `meta.catalog.version`, which this checks with one tiny query a minute. A reload
 * runs in the background; requests keep getting the previous list until the new one is ready.
 */
export interface CatalogStore {
  /** In-stock products, trimmed to what the app shows */
  get(): Promise<Product[]>;
  /** The loaded catalog version (null before the first sync has run) */
  version(): string | null;
  /** A live check found new stock or price: update the copy in memory (sold out = gone from it) */
  patch(id: string, change: Pick<Product, 'inStock' | 'price'>): void;
}

export interface CatalogStoreOptions {
  /** How often to ask whether a sync has run. 0 = read the database on every call (tests) */
  checkMs?: number;
  /** Reload at least this often anyway (an import without the version stamp, a manual edit) */
  maxAgeMs?: number;
}

/** Only what the app uses: the grids show the first photos, quick view a few more. */
const trim = (p: Product): Product => (p.images && p.images.length > 4 ? { ...p, images: p.images.slice(0, 4) } : p);

const load = async (repos: Repos) => (await repos.products.find({ inStock: true })).map(trim);

export function createCatalogStore(repos: Repos, { checkMs = 60_000, maxAgeMs = 6 * 3600_000 }: CatalogStoreOptions = {}): CatalogStore {
  if (checkMs <= 0) return { get: () => load(repos), version: () => null, patch: () => {} };

  let current: { list: Product[]; version: string | null; at: number } | null = null;
  let first: Promise<Product[]> | null = null;
  let reloading: Promise<void> | null = null;
  let checkedAt = 0;

  const versionNow = async () => (await repos.meta.findOne({ id: 'catalog' }))?.version ?? null;

  const reload = () => {
    reloading ??= (async () => {
      try {
        const version = await versionNow();
        const list = await load(repos);
        current = { list, version, at: Date.now() };
      } catch (e) {
        console.warn('Could not reload the catalogue (keeping the previous one):', e);
      } finally {
        reloading = null;
      }
    })();
    return reloading;
  };

  const check = async () => {
    try {
      const v = await versionNow();
      if (current && (v !== current.version || Date.now() - current.at > maxAgeMs)) await reload();
    } catch (e) {
      console.warn('Could not check the catalog version:', e);
    }
  };

  return {
    async get() {
      if (!current) {
        first ??= reload().then(() => {
          first = null;
          if (!current) throw new Error('The catalogue could not be loaded');
          return current.list;
        });
        return first;
      }
      if (Date.now() - checkedAt > checkMs) {
        checkedAt = Date.now();
        void check(); // never makes this request wait
      }
      return current.list;
    },
    version: () => current?.version ?? null,
    patch(id, change) {
      if (!current || !current.list.some((p) => p.id === id)) return;
      current = { ...current, list: current.list.flatMap((p) => (p.id !== id ? [p] : change.inStock ? [{ ...p, ...change }] : [])) };
    },
  };
}
