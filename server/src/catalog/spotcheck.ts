/**
 * npm run catalog:spotcheck [-- --count=20]
 *
 * Are our prices and stock still right? Picks random in-stock products, spread across every brand,
 * asks each brand's live product page exactly as the look pages do (services/liveStock.ts, through
 * its cache), checks that the photo loads, and prints a table and a summary per brand.
 * At most 2 requests a second. Reads the catalog in MongoDB; changes nothing.
 */
import { config } from '../config.js';
import { createMongoRepos } from '../db/index.js';
import { liveCheck } from '../services/liveStock.js';
import type { Product } from '../types.js';
import { quickGet, USER_AGENT } from './http.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const COUNT = Math.max(1, Number(arg('count') ?? 20));

/** One request at a time, a second apart: each call may also read the site's robots.txt once, so never more than 2 a second. */
let last = 0;
async function politely<T>(task: () => Promise<T>): Promise<T> {
  const wait = last + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return task();
}
const politeGet: typeof quickGet = (url, timeoutMs) => politely(() => quickGet(url, timeoutMs));

/** Does the first photo load as an image? Only the headers are read. */
async function photoLoads(p: Product): Promise<'yes' | 'no' | 'none'> {
  const src = p.images?.[0];
  if (!src) return 'none';
  return politely(async () => {
    try {
      const res = await fetch(src, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
      void res.body?.cancel();
      return res.ok && /^image\//.test(res.headers.get('content-type') ?? '') ? 'yes' : 'no';
    } catch {
      return 'no';
    }
  });
}

/** Random pieces, taking brands in turn so every brand is in the sample (as far as the count allows). */
function sample(products: Product[], count: number): Product[] {
  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const byBrand = new Map<string, Product[]>();
  for (const p of products) byBrand.set(p.brandId, [...(byBrand.get(p.brandId) ?? []), p]);
  const queues = shuffle([...byBrand.values()].map(shuffle));
  const out: Product[] = [];
  while (out.length < count && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < count) out.push(q.shift()!);
  return out;
}

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const cell = (s: string, n: number) => cut(s, n).padEnd(n);

async function main() {
  if (!config.mongoUri) throw new Error('Set MONGODB_URI in server/.env (the catalog lives in MongoDB).');
  const repos = await createMongoRepos(config.mongoUri, config.mongoDb);
  const picked = sample(await repos.products.find({ inStock: true }), COUNT);
  console.log(`Checking ${picked.length} random in-stock products from ${new Set(picked.map((p) => p.brandId)).size} brands (at most 2 requests a second)…\n`);

  type Row = { p: Product; checked: boolean; livePrice: number; liveStock: boolean; photo: 'yes' | 'no' | 'none' };
  const rows: Row[] = [];
  for (const p of picked) {
    const live = await liveCheck(p, politeGet);
    rows.push({ p, checked: live.checked, livePrice: live.price, liveStock: live.inStock, photo: await photoLoads(p) });
    process.stdout.write('.');
  }
  console.log('\n');

  const head = `${cell('Brand', 18)} ${cell('Product', 34)} ${'Our price'.padStart(11)} ${'Live price'.padStart(11)}  ${cell('Our stock', 9)} ${cell('Live stock', 12)} Photo`;
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const r of rows) {
    const priceOff = r.checked && r.livePrice !== r.p.price;
    const stockOff = r.checked && r.liveStock !== r.p.inStock;
    console.log(
      `${cell(r.p.brandName, 18)} ${cell(r.p.title, 34)} ${rs(r.p.price).padStart(11)} ${(r.checked ? rs(r.livePrice) : 'not checked').padStart(11)}${priceOff ? '!' : ' '} ` +
        `${cell(r.p.inStock ? 'in stock' : 'sold out', 9)} ${cell(r.checked ? (r.liveStock ? 'in stock' : 'SOLD OUT') : 'not checked', 11)}${stockOff ? '!' : ' '} ${r.photo === 'yes' ? 'ok' : r.photo === 'none' ? 'NO PHOTO' : 'BROKEN'}`,
    );
  }
  console.log('\n! = differs from the live shop\n');

  console.log('Summary per brand:');
  const brands = [...new Set(rows.map((r) => r.p.brandName))].sort();
  let wrong = 0;
  for (const b of brands) {
    const mine = rows.filter((r) => r.p.brandName === b);
    const checked = mine.filter((r) => r.checked);
    const price = checked.filter((r) => r.livePrice !== r.p.price);
    const stock = checked.filter((r) => r.liveStock !== r.p.inStock);
    const photos = mine.filter((r) => r.photo !== 'yes');
    const problems = [
      price.length && `${price.length} price${price.length === 1 ? '' : 's'} differ (${price.map((r) => `${rs(r.p.price)} → ${rs(r.livePrice)}`).join(', ')})`,
      stock.length && `${stock.length} sold out on the shop`,
      photos.length && `${photos.length} photo${photos.length === 1 ? '' : 's'} not loading`,
      checked.length < mine.length && `${mine.length - checked.length} could not be checked`,
    ].filter(Boolean);
    if (price.length || stock.length || photos.length) wrong++;
    console.log(`  ${b.padEnd(28)} ${mine.length} checked: ${problems.length ? problems.join('; ') : 'all right'}`);
  }
  console.log(`\n${wrong ? `${wrong} of ${brands.length} brands have something out of date.` : 'Every brand checked matches its live shop.'}`);
  await repos.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
