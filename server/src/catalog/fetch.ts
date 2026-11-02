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
import { join } from 'node:path';
import { CACHE_DIR } from './cache.js';
import { fetchBareeze, fetchSapphire, fetchShopify, type FetchOptions } from './fetchers.js';
import { BRAND_SOURCES } from './sources.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const only = arg('brands')?.split(',');
  // Offline mode only rebuilds feed brands from their cached pages (page-scraped brands need their sitemap).
  const sources = BRAND_SOURCES.filter((b) => (!only || only.includes(b.id)) && (!flag('offline') || b.platform === 'shopify'));
  const o: FetchOptions = {
    cacheDir: CACHE_DIR,
    maxPages: Number(arg('max-pages') ?? 450),
    refresh: flag('refresh'),
    offline: flag('offline'),
    log: (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`),
  };
  mkdirSync(join(CACHE_DIR, 'raw'), { recursive: true });
  const save = (id: string, items: unknown[], complete: boolean) =>
    writeFileSync(join(CACHE_DIR, 'raw', `${id}.json`), JSON.stringify({ brandId: id, fetchedAt: new Date().toISOString(), complete, items }));

  const run = async (src: (typeof sources)[number]): Promise<string> => {
    try {
      const items = src.platform === 'shopify' ? await fetchShopify(src, o) : src.platform === 'sapphire' ? await fetchSapphire(src, o) : await fetchBareeze(src, o);
      if (!items.length) return `${src.id}: nothing cached yet`; // keep any earlier raw file
      // An offline build may stop at the first missing page, so it is marked incomplete.
      save(src.id, items, !o.offline);
      return `${src.id}: ${items.length} raw items${o.offline ? ' (partial)' : ''}`;
    } catch (e: any) {
      // Keep whatever pages were read before the site gave up on us, marked incomplete.
      if (src.platform === 'shopify') {
        const partial = await fetchShopify(src, { ...o, offline: true });
        if (partial.length) save(src.id, partial, false);
        return `${src.id}: FAILED ${e.message}; kept ${partial.length} items read so far (partial)`;
      }
      return `${src.id}: FAILED ${e.message}`;
    }
  };

  // Shopify limits requests per visitor across all its stores, so the Shopify brands go one store at
  // a time; the other platforms run alongside. Each site still gets one polite request at a time.
  const shopify = sources.filter((s) => s.platform === 'shopify');
  const others = sources.filter((s) => s.platform !== 'shopify');
  const results: string[] = [];
  await Promise.all([
    (async () => { for (const s of shopify) results.push(await run(s)); })(),
    ...others.map(async (s) => results.push(await run(s))),
  ]);
  console.log('\nSummary');
  results.forEach((r) => console.log(`  ${r}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
