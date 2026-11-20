import { describe, expect, it } from 'vitest';
import { createMemoryRepos } from '../src/db/index.js';
import { buildDemoCatalog } from '../src/data/seed.js';
import { setArrivals } from '../src/catalog/import.js';
import { normalize } from '../src/catalog/normalize.js';
import type { BrandSource, RawItem } from '../src/catalog/sources.js';
import { createCatalogStore } from '../src/services/catalogStore.js';
import { askShop, clearLiveCache, liveStock } from '../src/services/liveStock.js';
import { challengeKey, gamePieces, isNew } from '../src/services/game.js';
import type { Challenge, Product } from '../src/types.js';

const tick = () => new Promise((r) => setTimeout(r, 20));
const DAY = 86_400_000;

const piece = (over: Partial<Product> = {}): Product => ({ ...buildDemoCatalog()[0], ...over });

describe('the in-memory catalogue', () => {
  it('loads in-stock pieces once and reloads only after a sync bumps the version', async () => {
    const repos = createMemoryRepos();
    await repos.products.upsert(piece({ id: 'a', inStock: true }));
    await repos.products.upsert(piece({ id: 'gone', inStock: false }));
    await repos.meta.upsert({ id: 'catalog', version: 'v1', syncedAt: '', products: 2, inStock: 1 });
    const store = createCatalogStore(repos, { checkMs: 1 });

    expect((await store.get()).map((p) => p.id)).toEqual(['a']);
    expect(store.version()).toBe('v1');

    // A product changes without a sync: the copy in memory stays as it was.
    await repos.products.upsert(piece({ id: 'b', inStock: true }));
    await tick();
    await store.get();
    await tick();
    expect((await store.get()).map((p) => p.id)).toEqual(['a']);

    // The import stamps a new version: the next check swaps the new list in, in the background.
    await repos.meta.upsert({ id: 'catalog', version: 'v2', syncedAt: '', products: 3, inStock: 2 });
    await tick();
    await store.get();
    await tick();
    expect((await store.get()).map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(store.version()).toBe('v2');

    // A live check found one sold out: it leaves the copy in memory straight away.
    store.patch('a', { inStock: false, price: 100 });
    expect((await store.get()).map((p) => p.id)).toEqual(['b']);
  });

  it('keeps at most four photos per piece', async () => {
    const repos = createMemoryRepos();
    await repos.products.upsert(piece({ id: 'a', images: ['1', '2', '3', '4', '5', '6'] }));
    expect((await createCatalogStore(repos).get())[0].images).toEqual(['1', '2', '3', '4']);
  });
});

describe('New in', () => {
  const src: BrandSource = { id: 'zeen', name: 'Zeen', origin: 'https://example.pk', platform: 'shopify', tier: 'mid' };
  const raw = (o: Partial<RawItem>): RawItem => ({
    brandId: 'zeen', sourceId: '1', url: 'https://example.pk/products/x', title: 'Printed Khaddar Suit', productType: 'Eastern', tags: ['Green'],
    categories: [], text: '', options: {}, variants: [{ title: 'M', price: 5000, available: true }], images: ['i.jpg'], ...o,
  });

  it('takes the brand\'s creation date, not the publish date shops bump when they re-list', () => {
    const n = normalize(raw({ publishedAt: '2026-11-19T10:00:00Z', createdAt: '2026-03-01T10:00:00Z' }), src, '');
    expect(n.ok && n.product.arrivedAt).toBe('2026-03-01T10:00:00.000Z');
    const none = normalize(raw({ publishedAt: '2026-11-19T10:00:00Z' }), src, '');
    expect(none.ok && none.product.arrivedAt).toBeUndefined();
  });

  it('keeps a piece\'s first arrival date; pieces without a brand date are never "new"', () => {
    const all = [
      piece({ id: 'kept', brandId: 'zeen', arrivedAt: '2026-11-19T00:00:00.000Z' }),
      piece({ id: 'fresh', brandId: 'zeen', arrivedAt: '2026-11-18T00:00:00.000Z' }),
      piece({ id: 'undated', brandId: 'sapphire', arrivedAt: undefined }),
    ];
    const seen = new Map<string, string | null>([['kept', '2026-01-01T00:00:00.000Z']]);
    expect(setArrivals(all, seen)).toBe(2);
    expect(Object.fromEntries(all.map((p) => [p.id, p.arrivedAt]))).toEqual({
      kept: '2026-01-01T00:00:00.000Z', // re-listed: keeps the date it first had
      fresh: '2026-11-18T00:00:00.000Z',
      undated: undefined,
    });
  });

  it('counts two weeks as new, and sorts the Studio grid newest first', () => {
    const now = Date.now();
    expect(isNew(piece({ arrivedAt: new Date(now - 3 * DAY).toISOString() }), now)).toBe(true);
    expect(isNew(piece({ arrivedAt: new Date(now - 20 * DAY).toISOString() }), now)).toBe(false);
    expect(isNew(piece({ arrivedAt: undefined }), now)).toBe(false);

    const mains = buildDemoCatalog().filter((p) => p.slot === 'main' && p.inStock && p.occasions.includes('casual') && !p.gender);
    const catalog = mains.map((p, i) => ({ ...p, arrivedAt: i === mains.length - 1 ? new Date(now - DAY).toISOString() : undefined }));
    const base = { occasion: 'casual' as const, colors: [], coverage: 1, wantsDupatta: false };
    const c: Challenge = { id: 't', key: challengeKey(base), source: 'seed', asks: 0, createdAt: '', ...base };
    const page = gamePieces(catalog, c, { slot: 'main', sort: 'new' });
    expect(page.groups[0].variants[0].id).toBe(mains[mains.length - 1].id);
  });
});

describe('live stock', () => {
  const shop = (answers: Record<string, { status: number; body?: unknown }>) => async (url: string) => {
    const a = Object.entries(answers).find(([end]) => url.endsWith(end))?.[1] ?? { status: 500 };
    return { status: a.status, body: a.body === undefined ? '' : JSON.stringify(a.body) };
  };
  const p = piece({ id: 'zeen:1', brandId: 'zeen', url: 'https://zeenwoman.com/products/printed-suit', price: 5000, inStock: true, demo: false });

  it('reads each size\'s stock and the price (in paisa) from the shop', async () => {
    const r = await askShop(p, shop({ '.js': { status: 200, body: { variants: [{ available: false, price: 450000 }, { available: true, price: 520000 }] } } }));
    expect(r).toMatchObject({ checked: true, inStock: true, price: 5200 });
    const out = await askShop(p, shop({ '.js': { status: 200, body: { variants: [{ available: false, price: 450000 }] } } }));
    expect(out).toMatchObject({ checked: true, inStock: false, price: 4500 });
  });

  it('falls back to the product\'s .json (Breakout); a missing product is sold out; an unreachable shop keeps the stored stock', async () => {
    expect(await askShop(p, shop({ '.js': { status: 301 }, '.json': { status: 404 } }))).toMatchObject({ checked: true, inStock: false });
    expect(await askShop(p, shop({ '.js': { status: 301 }, '.json': { status: 200, body: { product: { variants: [{ price: '4549.00' }] } } } }))).toMatchObject({ checked: true, inStock: true, price: 4549 });
    expect(await askShop(p, async () => { throw new Error('timeout'); })).toMatchObject({ checked: false, inStock: true, price: 5000 });
    // Not a Shopify shop: not asked.
    expect(await askShop({ ...p, brandId: 'sapphire' }, shop({}))).toMatchObject({ checked: false });
  });

  it('saves what it finds, so the Studio stops offering a sold-out piece', async () => {
    clearLiveCache();
    const repos = createMemoryRepos();
    await repos.products.upsert(p);
    const store = createCatalogStore(repos, { checkMs: 60_000 });
    expect((await store.get()).map((x) => x.id)).toEqual(['zeen:1']);
    const [r] = await liveStock(repos, ['zeen:1', 'zeen:1'], store, shop({ '.js': { status: 200, body: { variants: [{ available: false, price: 500000 }] } } }));
    expect(r).toMatchObject({ id: 'zeen:1', checked: true, inStock: false });
    expect((await repos.products.findOne({ id: 'zeen:1' }))!.inStock).toBe(false);
    expect(await store.get()).toEqual([]);
  });
});
