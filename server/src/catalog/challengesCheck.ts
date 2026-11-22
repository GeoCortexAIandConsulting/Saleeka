/**
 * npm run challenges:check: for each launch challenge and each piece it offers, how many in-stock
 * pieces fit, how many have no photo, how many have a name that looks wrong, and the worst 10 names.
 * A slot needs at least 20 good pieces (a photo and a clean name) for a good game.
 *
 *   npm run challenges:check              # launch challenges
 *   npm run challenges:check -- --all     # every seeded challenge
 */
import { config } from '../config.js';
import { createMongoRepos } from '../db/index.js';
import { gameItems, LAUNCH, challengeKey, slotRules } from '../services/game.js';
import { slotsFor, type Challenge, type Product, type Slot } from '../types.js';
import { titleProblems } from './quality.js';

const GOOD_ENOUGH = 20;

async function main() {
  if (!config.mongoUri) throw new Error('Set MONGODB_URI in server/.env first.');
  const repos = await createMongoRepos(config.mongoUri, config.mongoDb);
  try {
    const catalog = await repos.products.find({ inStock: true });
    const all = process.argv.includes('--all');
    const challenges: Challenge[] = all
      ? (await repos.challenges.find({ source: 'seed' }))
      : LAUNCH.map(({ slug, ...c }) => ({ ...c, id: `seed-${slug}`, key: challengeKey(c), source: 'seed' as const, asks: 0, createdAt: '' }));
    console.log(`${catalog.length} in-stock products. A slot needs ${GOOD_ENOUGH}+ good pieces (photo and a clean name).\n`);
    let short = 0;
    for (const c of challenges) {
      const items = gameItems(catalog, c, Number.MAX_SAFE_INTEGER);
      const main = items.main?.[0];
      const rules = main ? slotRules(main, c) : {};
      console.log(`== ${c.title ?? c.id}${c.budget ? ` (budget Rs ${c.budget.toLocaleString('en-PK')})` : ''}`);
      for (const slot of slotsFor(c.gender ?? 'female') as Slot[]) {
        const list: Product[] = items[slot] ?? [];
        const noPhoto = list.filter((p) => !p.images?.length).length;
        const bad = list.map((p) => ({ p, why: titleProblems(p.title) })).filter((x) => x.why.length);
        const good = list.length - noPhoto - bad.filter((x) => x.p.images?.length).length;
        const need = slot === 'main' || rules[slot] === 'required' || c.required?.includes(slot);
        const flag = good < GOOD_ENOUGH ? (need ? '  << TOO FEW (needed piece)' : '  < few (optional piece)') : '';
        if (good < GOOD_ENOUGH && need) short++;
        console.log(`  ${slot.padEnd(10)} fit ${String(list.length).padStart(5)}  no photo ${String(noPhoto).padStart(3)}  bad name ${String(bad.length).padStart(4)}  good ${String(good).padStart(5)}${flag}`);
        for (const { p, why } of bad.slice(0, 10)) console.log(`      - "${p.title}" (${p.brandName}): ${why.join(', ')}`);
      }
      console.log('');
    }
    console.log(short ? `${short} needed slot(s) have fewer than ${GOOD_ENOUGH} good pieces.` : `Every needed slot has at least ${GOOD_ENOUGH} good pieces.`);
    process.exitCode = short ? 1 : 0;
  } finally {
    await repos.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
