/**
 * Step 2 of a catalog import: tag the raw items fetched by catalog:fetch and load them into MongoDB.
 *
 *   npm run catalog:import -- --dry-run     # tag and report only (writes .catalog-cache/normalized.json)
 *   npm run catalog:import                  # replace the demo catalog with the real one
 *
 * The demo brands and products are removed. Products of an imported brand that no longer appear on
 * its site are kept but marked out of stock, so saved looks still open. The running API notices the
 * import (meta.catalog.version) and reloads its in-memory catalogue within a minute.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { DEMO_BRANDS } from '../data/seed.js';
import { connectMongo } from '../db/mongo.js';
import type { Product } from '../types.js';
import { CACHE_DIR } from './cache.js';
import { normalize, type DropReason } from './normalize.js';
import { BRAND_SOURCES, type RawItem } from './sources.js';

/**
 * "New in" dates. A piece keeps the arrival date it was first given, because shops re-list old stock;
 * a new piece takes the brand's own creation date. A shop that gives no date (Sapphire) has no
 * "New in": dating its pieces by the night a sync first saw them would call any piece new that our
 * capped sample of its pages happened to reach for the first time. Returns how many pieces are new to us.
 */
export function setArrivals(all: Product[], seen: Map<string, string | null>): number {
  let arrived = 0;
  for (const p of all) {
    const before = seen.get(p.id);
    if (before) p.arrivedAt = before;
    if (before === undefined) arrived++;
  }
  return arrived;
}

const isMain = process.argv[1] && /import\.[tj]s$/.test(process.argv[1]);
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const rawDir = join(CACHE_DIR, 'raw');
  if (!existsSync(rawDir)) throw new Error(`No raw catalogs in ${rawDir}. Run npm run catalog:fetch first.`);
  const products = new Map<string, Product>();
  const report: string[] = [];
  const imported: string[] = [];
  /** Brands whose whole catalog was read (a partial one must not mark the rest out of stock) */
  const completeBrands: string[] = [];
  /** Items the tagging rules now reject (e.g. wallets), to remove if an earlier import loaded them */
  const rejected: string[] = [];

  for (const file of readdirSync(rawDir).filter((f) => f.endsWith('.json'))) {
    const { brandId, fetchedAt, items, complete } = JSON.parse(readFileSync(join(rawDir, file), 'utf8')) as { brandId: string; fetchedAt: string; items: RawItem[]; complete?: boolean };
    const src = BRAND_SOURCES.find((b) => b.id === brandId);
    if (!src) continue;
    imported.push(brandId);
    if (complete !== false) completeBrands.push(brandId);
    const dropped: Partial<Record<DropReason, number>> = {};
    const bySlot: Record<string, number> = {};
    let inStock = 0;
    for (const raw of items) {
      const n = normalize(raw, src, fetchedAt);
      if (!n.ok) {
        dropped[n.reason] = (dropped[n.reason] ?? 0) + 1;
        rejected.push(`${src.id}:${raw.sourceId}`); // remove it if an earlier import loaded it
        continue;
      }
      products.set(n.product.id, n.product);
      bySlot[n.product.slot] = (bySlot[n.product.slot] ?? 0) + 1;
      if (n.product.inStock) inStock++;
    }
    const kept = Object.values(bySlot).reduce((a, b) => a + b, 0);
    report.push(
      `${brandId.padEnd(15)} raw ${String(items.length).padStart(5)}  kept ${String(kept).padStart(5)} (in stock ${inStock})  ` +
        `${Object.entries(bySlot).map(([k, v]) => `${k} ${v}`).join(', ')}  | dropped ${Object.entries(dropped).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
    );
  }

  console.log(report.join('\n'));
  const all = [...products.values()];
  console.log(`\nTotal ${all.length} products, ${all.filter((p) => p.inStock).length} in stock`);
  writeFileSync(join(CACHE_DIR, 'normalized.json'), JSON.stringify(all, null, 1));
  if (dryRun) {
    console.log(`Dry run: nothing written. Tagged products are in ${join(CACHE_DIR, 'normalized.json')}`);
    return;
  }

  if (!config.mongoUri) throw new Error('MONGODB_URI is not set; the import needs MongoDB.');
  const { client, db } = await connectMongo(config.mongoUri, config.mongoDb);
  try {
    const col = db.collection<any>('products');
    const now = new Date().toISOString();
    const removedDemo = (await col.deleteMany({ demo: true })).deletedCount;
    await db.collection<any>('brands').deleteMany({ _id: { $in: DEMO_BRANDS.map((b) => b.id) } });
    for (const b of BRAND_SOURCES.filter((s) => imported.includes(s.id))) {
      // Name and tier only: an admin's on/off switch (enabled) survives every sync.
      await db.collection<any>('brands').updateOne({ _id: b.id }, { $set: { name: b.name, tier: b.tier } }, { upsert: true });
    }

    const seen = new Map<string, string | null>();
    for (const d of await col.find({ brandId: { $in: imported } }, { projection: { arrivedAt: 1 } }).toArray()) seen.set(d._id, d.arrivedAt ?? null);
    const arrived = setArrivals(all, seen);

    // Written in batches: one round trip per 1000 pieces instead of one each (minutes, not an hour, on Atlas).
    for (let i = 0; i < all.length; i += 1000) {
      await col.bulkWrite(
        all.slice(i, i + 1000).map(({ id, ...rest }) => ({ replaceOne: { filter: { _id: id }, replacement: rest, upsert: true } })),
        { ordered: false },
      );
      console.log(`  saved ${Math.min(i + 1000, all.length)}/${all.length}`);
    }
    // Gone from the brand's site since the last import: keep (saved looks still open) but out of stock.
    let gone = 0;
    for (const brandId of completeBrands) {
      const ids = all.filter((p) => p.brandId === brandId).map((p) => p.id);
      gone += (await col.updateMany({ brandId, inStock: true, _id: { $nin: ids } }, { $set: { inStock: false, checkedAt: now } })).modifiedCount;
    }
    let removed = 0;
    for (let i = 0; i < rejected.length; i += 500) removed += (await col.deleteMany({ _id: { $in: rejected.slice(i, i + 500) } })).deletedCount;

    // Tells the running API to load the new catalogue (it checks this once a minute).
    const inStock = await col.countDocuments({ inStock: true });
    await db.collection<any>('meta').replaceOne({ _id: 'catalog' }, { version: now, syncedAt: now, products: await col.countDocuments(), inStock }, { upsert: true });
    console.log(
      `Saved ${all.length} products (${arrived} new since the last sync); removed ${removedDemo} demo products and ${removed} items the rules now reject; ` +
        `${gone} no longer listed (marked out of stock). ${inStock} in stock in total.`,
    );
  } finally {
    await client.close();
  }
}

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
