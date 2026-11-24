/**
 * npm run challenges:check
 *
 * For each launch challenge and each slot: how many in-stock pieces fit, how many have no photo,
 * how many have a title that would look wrong to players, and how many are good (photo and a clean
 * title). Then the 10 worst-looking titles in that slot. Reads the catalog in MongoDB (MONGODB_URI);
 * writes nothing. Exits with code 1 if any slot has fewer than 20 good pieces.
 */
import { config } from '../config.js';
import { createMongoRepos } from '../db/index.js';
import { challengeTitle, gameItems, launchChallenges, slotRules } from '../services/game.js';
import type { Product, Slot } from '../types.js';
import { isSerious, titleProblems, titleScore } from './titleCheck.js';

const MIN_GOOD = 20;
const pad = (s: string | number, n: number) => String(s).padStart(n);

async function main() {
  if (!config.mongoUri) throw new Error('Set MONGODB_URI in server/.env (the catalog lives in MongoDB).');
  const repos = await createMongoRepos(config.mongoUri, config.mongoDb);
  const catalog = (await repos.products.find({ inStock: true })) as Product[];
  const brands = new Set(catalog.map((p) => p.brandId));
  console.log(`Catalog: ${catalog.length} in-stock products from ${brands.size} brands.\n`);

  let short = 0;
  for (const c of launchChallenges()) {
    const items = gameItems(catalog, c, Infinity);
    console.log(`=== ${challengeTitle(c)} (${c.gender === 'male' ? 'men' : 'women'}) ===`);
    // Which slots the brief needs: required for any outfit on offer, or (if no outfit fits) the usual ones.
    const needed = new Set<Slot>(['main']);
    for (const main of (items.main ?? []).slice(0, 50)) for (const [s, r] of Object.entries(slotRules(main, c))) if (r === 'required') needed.add(s as Slot);
    console.log(`  ${'slot'.padEnd(10)}${pad('fit', 7)}${pad('no photo', 10)}${pad('bad title', 11)}${pad('good', 7)}`);
    const worst: string[] = [];
    for (const [slot, pieces = []] of Object.entries(items) as Array<[Slot, Product[]]>) {
      const noPhoto = pieces.filter((p) => !p.images?.length).length;
      const checked = pieces.map((p) => ({ p, problems: titleProblems(p.title) }));
      const bad = checked.filter((x) => isSerious(x.problems)).length;
      const good = checked.filter((x) => x.p.images?.length && !isSerious(x.problems)).length;
      const ok = good >= MIN_GOOD;
      if (!ok) short++;
      const tag = ok ? 'ok' : needed.has(slot) ? 'TOO FEW (needed)' : 'TOO FEW';
      console.log(`  ${slot.padEnd(10)}${pad(pieces.length, 7)}${pad(noPhoto, 10)}${pad(bad, 11)}${pad(good, 7)}  ${tag}`);
      const ranked = checked.filter((x) => x.problems.length).sort((a, b) => titleScore(b.problems) - titleScore(a.problems)).slice(0, 10);
      if (ranked.length) worst.push(`  ${slot}:`, ...ranked.map((x) => `    - "${x.p.title}" (${x.p.brandName}; ${x.problems.join(', ')})`));
    }
    if (worst.length) console.log(`  Worst-looking titles:\n${worst.join('\n')}`);
    console.log('');
  }
  console.log(short ? `${short} slot(s) have fewer than ${MIN_GOOD} good pieces.` : `Every slot has at least ${MIN_GOOD} good pieces.`);
  await repos.close();
  process.exitCode = short ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
