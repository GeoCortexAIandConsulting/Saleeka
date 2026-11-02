/**
 * Step 2 of a catalog import: tag the raw items fetched by catalog:fetch and load them into MongoDB.
 *
 *   npm run catalog:import -- --dry-run     # tag and report only (writes .catalog-cache/normalized.json)
 *   npm run catalog:import                  # replace the demo catalog with the real one
 *
 * The demo brands and products are removed. Products of an imported brand that no longer appear on
 * its site are kept but marked out of stock, so saved looks still open.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { DEMO_BRANDS } from '../data/seed.js';
import { createMongoRepos } from '../db/index.js';
import type { Product } from '../types.js';
import { CACHE_DIR } from './cache.js';
import { normalize, type DropReason } from './normalize.js';
import { BRAND_SOURCES, type RawItem } from './sources.js';

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
  const repos = await createMongoRepos(config.mongoUri, config.mongoDb);
  try {
    const removedDemo = await repos.products.delete({ demo: true } as any);
    for (const b of DEMO_BRANDS) await repos.brands.delete({ id: b.id });
    for (const b of BRAND_SOURCES.filter((s) => imported.includes(s.id))) await repos.brands.upsert({ id: b.id, name: b.name, tier: b.tier });
    let n = 0;
    for (const p of all) {
      await repos.products.upsert(p);
      if (++n % 1000 === 0) console.log(`  saved ${n}/${all.length}`);
    }
    // Gone from the brand's site since the last import: keep (saved looks still open) but out of stock.
    let gone = 0;
    for (const old of await repos.products.find({ brandId: { $in: completeBrands } } as any)) {
      if (!products.has(old.id) && old.inStock) {
        await repos.products.update({ id: old.id }, { inStock: false });
        gone++;
      }
    }
    let removed = 0;
    for (let i = 0; i < rejected.length; i += 500) removed += await repos.products.delete({ id: { $in: rejected.slice(i, i + 500) } } as any);
    console.log(`Saved ${all.length} products; removed ${removedDemo} demo products and ${removed} items the rules now reject; ${gone} no longer listed (marked out of stock).`);
  } finally {
    await repos.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
