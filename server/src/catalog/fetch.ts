/**
 * Step 1 of a catalog import: read each brand's official catalog and save the raw items.
 *
 *   npm run catalog:fetch                        # all brands
 *   npm run catalog:fetch -- --brands=sapphire,bareeze --max-pages=200 --refresh
 *
 * Raw items go to .catalog-cache/raw/<brand>.json; page-scraped brands also cache each page there,
 * so re-running only fetches pages it has not seen (unless --refresh).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fetchBareeze, fetchSapphire, fetchShopify, type FetchOptions } from './fetchers.js';
import { BRAND_SOURCES } from './sources.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const flag = (name: string) => process.argv.includes(`--${name}`);

export const CACHE_DIR = resolve(process.env.CATALOG_CACHE ?? join(process.cwd(), '.catalog-cache'));

async function main() {
  const only = arg('brands')?.split(',');
  const sources = BRAND_SOURCES.filter((b) => !only || only.includes(b.id));
  const o: FetchOptions = {
    cacheDir: CACHE_DIR,
    maxPages: Number(arg('max-pages') ?? 450),
    refresh: flag('refresh'),
    log: (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`),
  };
  mkdirSync(join(CACHE_DIR, 'raw'), { recursive: true });
  // Different sites in parallel; each site still gets one polite request at a time.
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      const items = src.platform === 'shopify' ? await fetchShopify(src, o) : src.platform === 'sapphire' ? await fetchSapphire(src, o) : await fetchBareeze(src, o);
      writeFileSync(join(CACHE_DIR, 'raw', `${src.id}.json`), JSON.stringify({ brandId: src.id, fetchedAt: new Date().toISOString(), items }));
      return `${src.id}: ${items.length} raw items`;
    }),
  );
  console.log('\nSummary');
  results.forEach((r, i) => console.log(r.status === 'fulfilled' ? `  ${r.value}` : `  ${sources[i].id}: FAILED ${r.reason?.message ?? r.reason}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
