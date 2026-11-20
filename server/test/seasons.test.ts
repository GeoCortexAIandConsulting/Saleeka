import { describe, expect, it } from 'vitest';
import { buildDemoCatalog } from '../src/data/seed.js';
import { challengeKey, challengeTitle, featuredIds, gameItems, slotRules } from '../src/services/game.js';
import type { Challenge, Product } from '../src/types.js';

const catalog = buildDemoCatalog();
const DECEMBER = new Date('2026-12-10T12:00:00+05:00');
const JUNE = new Date('2026-06-10T12:00:00+05:00');

const challenge = (c: Partial<Challenge>): Challenge => {
  const base = { occasion: 'casual' as const, colors: [], coverage: 3, wantsDupatta: false, ...c };
  return { id: 'test', key: challengeKey(base), source: 'seed', asks: 0, createdAt: '', ...base };
};
const onlySummer = (p: Product) => p.seasons.length === 1 && p.seasons[0] === 'summer';

describe('seasons in the Studio', () => {
  it('ranks in-season outfits first: khaddar and velvet in winter, lawn in summer', () => {
    const c = challenge({});
    const winter = gameItems(catalog, c, 20, DECEMBER).main!;
    const summer = gameItems(catalog, c, 20, JUNE).main!;
    expect(winter.length).toBeGreaterThan(0);
    expect(winter[0].seasons).toContain('winter');
    expect(summer[0].seasons).toContain('summer');
    // Off-season pieces still exist (not filtered), just lower down.
    const all = gameItems(catalog, c, Infinity, DECEMBER).main!;
    expect(all.some(onlySummer)).toBe(true);
    expect(all.findIndex(onlySummer)).toBeGreaterThan(all.findIndex((p) => p.seasons.includes('winter')));
  });

  it('a winter challenge offers only winter or all-season pieces, and coats as the layer', () => {
    const c = challenge({ season: 'winter' });
    const items = gameItems(catalog, c, Infinity, JUNE);
    for (const slot of ['main', 'bottom', 'dupatta', 'layer'] as const) {
      expect(items[slot]!.some(onlySummer)).toBe(false);
    }
    expect(items.layer!.length).toBeGreaterThan(0);
    expect(challengeTitle(c)).toBe('Winter everyday outfit');
  });

  it('the layer is optional for women and men', () => {
    const main = gameItems(catalog, challenge({}), 1, DECEMBER).main![0];
    expect(slotRules(main, challenge({}))).toMatchObject({ layer: 'optional' });
    const man = gameItems(catalog, challenge({ gender: 'male' }), 1, DECEMBER);
    expect(man.layer!.length).toBeGreaterThan(0);
    expect(slotRules(man.main![0], challenge({ gender: 'male' }))).toMatchObject({ layer: 'optional' });
  });

  it('features summer briefs only in summer and winter briefs only in winter', () => {
    const inWinter = featuredIds(DECEMBER.getTime());
    const inSummer = featuredIds(JUNE.getTime());
    expect(inWinter).not.toContain('seed-casual-summer');
    for (const id of inSummer) expect(id).not.toMatch(/winter/);
  });
});
