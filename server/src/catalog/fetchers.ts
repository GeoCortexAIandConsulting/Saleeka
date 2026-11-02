import { mkdirSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Disallowed, locs, politeGet, textOf } from './http.js';
import type { BrandSource, RawItem } from './sources.js';

export interface FetchOptions {
  /** Where raw pages are cached (product pages are only fetched once unless `refresh`) */
  cacheDir: string;
  /** Most product pages to read for page-scraped brands */
  maxPages: number;
  refresh: boolean;
  /** Use only pages already cached: no network (builds partial catalogs while a fetch is still running) */
  offline?: boolean;
  log: (msg: string) => void;
}

/* --------------------------------- Shopify --------------------------------- */

/**
 * The brand site's public product list (/products.json), 250 products per page, one page every 3 s.
 * Each page is cached as it arrives, so an interrupted run resumes where it stopped.
 */
export async function fetchShopify(src: BrandSource, o: FetchOptions): Promise<RawItem[]> {
  const out: RawItem[] = [];
  for (let page = 1; page <= 80; page++) {
    // Reused for 12 hours (to resume an interrupted run), then read fresh so stock stays current.
    const c = cached(o, src.id, `feed-page-${page}`, 12 * 3600_000);
    let body = c.get();
    if (!body) {
      if (o.offline) break; // stop at the first page not fetched yet
      body = await politeGet(`${src.origin}/products.json?limit=250&page=${page}`, { minDelayMs: 4000 });
      c.put(body);
    }
    const products: any[] = JSON.parse(body).products ?? [];
    if (!products.length) break;
    for (const p of products) {
      out.push({
        brandId: src.id,
        sourceId: String(p.id),
        url: `${src.origin}/products/${p.handle}`,
        title: p.title ?? '',
        productType: p.product_type ?? '',
        tags: Array.isArray(p.tags) ? p.tags : String(p.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
        categories: [],
        text: textOf(p.body_html ?? ''),
        options: Object.fromEntries((p.options ?? []).map((op: any) => [String(op.name), (op.values ?? []).map(String)])),
        variants: (p.variants ?? []).map((v: any) => ({
          title: v.title ?? '',
          price: Number(v.price) || 0,
          compareAt: v.compare_at_price ? Number(v.compare_at_price) : undefined,
          available: v.available !== false,
        })),
        images: (p.images ?? []).map((i: any) => i.src).filter(Boolean),
        publishedAt: p.published_at ?? p.created_at,
      });
    }
    o.log(`${src.id}: page ${page}, ${out.length} products`);
    if (products.length < 250) break;
  }
  return out;
}

/* ------------------------- page-scraped brands (shared) ------------------------- */

const WOMEN_URL = /wom[ae]n|ladies|female|unstitched|ready-to-wear|readytowear|pret|stitched|kurta|kameez|dupatta|shawl|stole|scarf|hijab|trouser|pant|bottom|co-?ord|formal|luxury|lawn|eid|festive|bridal|bag|clutch|shoe|footwear|khussa|heel|jewel|earring|printed|embroider|cambric|khaddar|chiffon|velvet|silk|winter|summer/i;
const NOT_WOMEN_URL = /\bm[ae]n\b|mens|-men-|man-|boy|girl|kid|baby|infant|junior|home|bed|towel|cushion|curtain|fragrance|mist|perfume|parfum|beauty|cosmetic|candle|gift-?card/i;

/** Gzipped page cache, keyed by brand and a safe file name. */
function cached(o: FetchOptions, brand: string, key: string, maxAgeMs = Infinity) {
  const dir = join(o.cacheDir, 'pages', brand);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, key.replace(/[^a-z0-9._-]+/gi, '_').slice(-150) + '.html.gz');
  const fresh = () => existsSync(file) && Date.now() - statSync(file).mtimeMs < maxAgeMs;
  return {
    get: () => (!o.refresh && fresh() ? gunzipSync(readFileSync(file)).toString('utf8') : null),
    put: (html: string) => writeFileSync(file, gzipSync(html)),
  };
}

/** Spread the cap across categories (round-robin), so one big collection does not crowd out the rest. */
function spread(urls: string[], groupOf: (u: string) => string, max: number): string[] {
  const groups = new Map<string, string[]>();
  for (const u of urls) {
    const g = groupOf(u);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(u);
  }
  const lists = [...groups.values()];
  const out: string[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length && out.length < max) out.push(l[i]);
  }
  return out;
}

async function crawlPages(src: BrandSource, urls: string[], o: FetchOptions, parse: (html: string, url: string) => RawItem | null): Promise<RawItem[]> {
  const out: RawItem[] = [];
  let done = 0, skipped = 0;
  for (const url of urls) {
    const c = cached(o, src.id, new URL(url).pathname);
    let html = c.get();
    if (!html) {
      try {
        html = await politeGet(url);
        c.put(html);
      } catch (e: any) {
        skipped++;
        if (!(e instanceof Disallowed)) o.log(`${src.id}: skipped ${url} (${e.message})`);
        continue;
      }
    }
    const item = parse(html, url);
    if (item) out.push(item);
    if (++done % 25 === 0) o.log(`${src.id}: ${done}/${urls.length} pages, ${out.length} products`);
  }
  o.log(`${src.id}: ${out.length} products from ${done} pages (${skipped} skipped)`);
  return out;
}

/* --------------------------------- Sapphire --------------------------------- */

export async function fetchSapphire(src: BrandSource, o: FetchOptions): Promise<RawItem[]> {
  const urls = locs(await politeGet(`${src.origin}/sitemap_0-product.xml`));
  const collection = (u: string) => u.match(/\/collections\/([^/]+)\//)?.[1] ?? 'other';
  const women = urls.filter((u) => WOMEN_URL.test(collection(u)) && !NOT_WOMEN_URL.test(collection(u)));
  o.log(`${src.id}: ${urls.length} product URLs in sitemap, ${women.length} look like women's`);
  return crawlPages(src, spread(women, collection, o.maxPages), o, (html, url) => parseSapphire(src, html, url));
}

export function parseSapphire(src: BrandSource, html: string, url: string): RawItem | null {
  const dl = html.match(/var dataLayerEvent = (\{.*?\});\s/s)?.[1];
  if (!dl) return null;
  let p: any;
  try {
    p = JSON.parse(dl).ecommerce.detail.products[0];
  } catch {
    return null;
  }
  const ga4 = html.match(/var ga4DataLayerEvent = (\{.*?\});\s/s)?.[1];
  let cats: string[] = [];
  try {
    const item = JSON.parse(ga4 ?? '{}').ecommerce?.items?.[0] ?? {};
    cats = ['item_category', 'item_category2', 'item_category3', 'item_category4'].map((k) => item[k]).filter(Boolean);
  } catch { /* optional */ }
  const images = [...new Set([...html.matchAll(/data-high-src="([^"]+)"/g)].map((m) => m[1]))].filter((s) => s.includes(p.id) || s.includes('/images/'));
  // Description, fabric and size tabs on the product page.
  const panes = [...html.matchAll(/class="tab-pane[^"]*detail-content-pane[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => textOf(m[1]));
  // Size buttons: <div class="size-item"><input class="options-select d-none [not-available]"><span>XS</span>.
  // Inputs marked "shopthelook" belong to the "shop the look" suggestions, not this product.
  const sizes = [...html.matchAll(/<div class="size-item"[^>]*>\s*<input([^>]*)>\s*<span[^>]*>\s*([^<]*?)\s*</g)]
    .filter((m) => !/shopthelook/.test(m[1]) && m[2])
    .map((m) => ({ title: m[2], available: !/not-available|\bdisabled\b/.test(m[1]) }));
  const pdp = html.slice(html.indexOf('pdp-right') > 0 ? html.indexOf('pdp-right') : 0);
  const soldOut = /class="[^"]*(?:add-to-cart|addToCart)[^"]*"[^>]*disabled|>\s*SOLD OUT\s*</i.test(pdp.slice(0, 40000));
  const price = Number(p.price) || 0;
  const compare = Number(p.compare_price) || undefined;
  return {
    brandId: src.id,
    sourceId: String(p.id),
    url: url.split('?')[0],
    title: String(p.name ?? ''),
    productType: String(p.category ?? ''),
    tags: [],
    categories: [...cats, url.match(/\/collections\/([^/]+)\//)?.[1] ?? ''].filter(Boolean),
    text: panes.join('\n'),
    options: sizes.length ? { Size: sizes.map((s) => s.title) } : {},
    variants: sizes.length
      ? sizes.map((s) => ({ title: s.title, price, compareAt: compare, available: s.available })) // per-size stock is exact
      : [{ title: 'Default', price, compareAt: compare, available: !soldOut }],
    images,
  };
}

/* --------------------------------- Bareeze --------------------------------- */

export async function fetchBareeze(src: BrandSource, o: FetchOptions): Promise<RawItem[]> {
  const index = locs(await politeGet(`${src.origin}/sitemap/sitemap.xml`));
  const urls: string[] = [];
  for (const sm of index.filter((u) => /sitemap_prod/.test(u))) urls.push(...locs(await politeGet(sm)));
  // Product URLs are bare handles (no category), so spread by the handle's first word.
  const group = (u: string) => new URL(u).pathname.split('/')[1]?.split('-')[0] ?? 'other';
  const keep = urls.filter((u) => !NOT_WOMEN_URL.test(new URL(u).pathname));
  o.log(`${src.id}: ${urls.length} product URLs in sitemap`);
  return crawlPages(src, spread(keep, group, o.maxPages), o, (html, url) => parseBareeze(src, html, url));
}

/** Bareeze is a Next.js app: the product record is inside the streamed page data. */
export function parseBareeze(src: BrandSource, html: string, url: string): RawItem | null {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return '';
    }
  });
  const flight = chunks.join('');
  const at = flight.indexOf('"productDetailServer":');
  if (at < 0) return null;
  const start = flight.indexOf('{', at);
  let depth = 0, end = start, inStr = false;
  for (let i = start; i < flight.length; i++) {
    const ch = flight[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) { end = i + 1; break; }
  }
  let p: any;
  try {
    p = JSON.parse(flight.slice(start, end));
  } catch {
    return null;
  }
  const money = (s: unknown) => Number(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;
  const imgs = new Set<string>();
  for (const k of ['images', 'media', 'product_images', 'gallery']) {
    for (const im of Array.isArray(p[k]) ? p[k] : []) {
      const src = typeof im === 'string' ? im : im?.cdn_link ?? im?.src ?? im?.url ?? im?.image ?? im?.original;
      if (src) imgs.add(String(src));
    }
  }
  if (!imgs.size) {
    for (const m of flight.matchAll(/https:\/\/cdn-live\.bareeze\.com\/bareeze\/products\/product_images\/[^"'\s)]+\.(?:jpe?g|png|webp)/g)) imgs.add(m[0]);
  }
  let variants = (p.variants ?? []).map((v: any) => ({
    title: [v.option1, v.option2, v.option3].filter(Boolean).join(' / ') || v.title || 'Default',
    price: money(v.variant_detail?.discounted_price ?? v.price),
    compareAt: money(v.variant_detail?.original_price) || undefined,
    available: !(v.variant_detail?.sold_out ?? p.sold_out) && (v.variant_detail?.quantity ?? 1) > 0,
  }));
  // A "group" product is sold as separate pieces (e.g. shirt + dupatta): one outfit, priced as the set.
  if (p.is_group_product && Array.isArray(p.group_products) && p.group_products.length) {
    const parts = p.group_products as any[];
    const partOut = (g: any) => g.sold_out === true || g.variant_detail?.sold_out === true || (g.variant_detail?.quantity ?? 1) <= 0;
    variants = [{
      title: parts.map((g) => String(g.title ?? '').replace(String(p.title), '').trim() || 'piece').join(' + '),
      price: parts.reduce((n, g) => n + money(g.discounted_price ?? g.variant_detail?.discounted_price), 0),
      compareAt: parts.reduce((n, g) => n + money(g.original_price ?? g.variant_detail?.original_price), 0) || undefined,
      available: !p.sold_out && !parts.some(partOut),
    }];
  }
  const sku = String(p.variants?.[0]?.sku ?? p.group_products?.[0]?.sku ?? '');
  return {
    brandId: src.id,
    sourceId: String(p.id),
    url: url.replace('://bareeze.com', '://www.bareeze.com'),
    title: String(p.title ?? ''),
    productType: String(p.product_type ?? p.type ?? ''),
    tags: [...(Array.isArray(p.tags) ? p.tags : []), ...sku.split('-').slice(1, 2)].map(String),
    categories: (p.categories ?? p.collections ?? []).map((c: any) => (typeof c === 'string' ? c : c?.title ?? c?.name ?? '')).filter(Boolean),
    text: textOf(String(p.description ?? '')),
    options: { Pieces: [...new Set((p.variants ?? []).map((v: any) => v.option1).filter(Boolean))] as string[] },
    variants: variants.length ? variants : [{ title: 'Default', price: 0, available: !p.sold_out }],
    images: [...imgs],
    publishedAt: p.created_at ? String(p.created_at).replace(/'$/, '') : undefined,
  };
}
