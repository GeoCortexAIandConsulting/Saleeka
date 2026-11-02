import type { Repos } from '../db/index.js';
import { DEMO_BRANDS, buildDemoCatalog } from './seed.js';

/** Loads the demo brands and products the first time the app runs on an empty database. */
export async function seedIfEmpty(repos: Repos): Promise<void> {
  if ((await repos.products.count()) > 0) return;
  for (const b of DEMO_BRANDS) await repos.brands.upsert(b);
  for (const p of buildDemoCatalog()) await repos.products.upsert(p);
}
