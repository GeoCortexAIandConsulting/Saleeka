import { describe, expect, it } from 'vitest';
import { composeLooks } from '../src/services/composer.js';
import { minModestyFor, modestyScore } from '../src/services/modesty.js';
import { catalog, profileFor } from './fixtures.js';

const winter = new Date('2026-11-01T10:00:00Z');

describe('modesty score', () => {
  it('rates full sleeves, long length and high neck as fully covered', () => {
    expect(modestyScore({ sleeve: 'full', length: 'full', neckline: 'high' })).toBe(5);
  });
  it('rates sleeveless short open-neck as the lowest', () => {
    expect(modestyScore({ sleeve: 'sleeveless', length: 'short', neckline: 'open' })).toBe(0);
  });
  it('penalises sheer fabric', () => {
    const solid = modestyScore({ sleeve: 'full', length: 'full', neckline: 'regular' });
    const sheer = modestyScore({ sleeve: 'full', length: 'full', neckline: 'regular', sheer: true });
    expect(sheer).toBe(solid - 1);
  });
  it('requires more coverage at higher settings', () => {
    expect(minModestyFor(5)).toBeGreaterThan(minModestyFor(3));
    expect(minModestyFor(3)).toBeGreaterThan(minModestyFor(1));
  });
});

describe('composeLooks', () => {
  const profile = profileFor();

  it('returns 3 distinct, complete looks for a formal occasion', () => {
    const looks = composeLooks(catalog, profile, { occasion: 'eid' }, winter);
    expect(looks).toHaveLength(3);
    const mains = looks.map((l) => l.items[0].product.id);
    expect(new Set(mains).size).toBe(3);
    for (const look of looks) {
      const slots = look.items.map((i) => i.slot);
      expect(slots[0]).toBe('main');
      expect(slots).toContain('footwear');
      expect(look.label).not.toBe('');
    }
  });

  it('never breaks hard rules: coverage, avoided colour and brand, stock, budget, occasion', () => {
    for (const occasion of ['office', 'eid', 'mehndi'] as const) {
      for (const look of composeLooks(catalog, profile, { occasion }, winter)) {
        const main = look.items[0].product;
        expect(main.modesty).toBeGreaterThanOrEqual(minModestyFor(profile.coverage));
        expect(main.occasions).toContain(occasion);
        for (const { product } of look.items) {
          expect(product.inStock).toBe(true);
          expect(product.brandId).not.toBe('b_street');
          if (['main', 'bottom', 'dupatta'].includes(product.slot)) expect(product.colors).not.toContain('orange');
        }
        expect(look.total).toBeLessThanOrEqual(profile.budgetMax);
        expect(look.total).toBe(look.items.reduce((n, i) => n + i.product.price, 0));
        const bottom = look.items.find((i) => i.slot === 'bottom');
        if (bottom) expect(bottom.product.modesty).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('adds a dupatta when the shopper always wears one and the main does not include it', () => {
    for (const look of composeLooks(catalog, profile, { occasion: 'eid' }, winter)) {
      const main = look.items[0].product;
      if (!main.includesDupatta && main.silhouette !== 'western') {
        expect(look.items.map((i) => i.slot)).toContain('dupatta');
      }
    }
  });

  it('uses scarves for hijab-wearing shoppers', () => {
    const hijab = profileFor({ dupatta: 'hijab', coverage: '5' });
    const looks = composeLooks(catalog, hijab, { occasion: 'office' }, winter);
    expect(looks.length).toBeGreaterThan(0);
    for (const look of looks) {
      const d = look.items.find((i) => i.slot === 'dupatta');
      expect(d?.product.silhouette).toBe('scarf');
      expect(look.items[0].product.modesty).toBeGreaterThanOrEqual(minModestyFor(5));
    }
  });

  it('respects requested colours and brands on the main piece', () => {
    const looks = composeLooks(catalog, profile, { occasion: 'eid', colors: ['emerald', 'mint', 'sage'] }, winter);
    for (const l of looks) expect(l.items[0].product.colors.some((c) => ['emerald', 'mint', 'sage'].includes(c))).toBe(true);
    const branded = composeLooks(catalog, profile, { occasion: 'eid', brands: ['b_studio', 'b_heritage'] }, winter);
    for (const l of branded) expect(['b_studio', 'b_heritage']).toContain(l.items[0].product.brandId);
  });

  it('keeps every look within a tighter requested budget', () => {
    const looks = composeLooks(catalog, profile, { occasion: 'office', budgetMax: 12000 }, winter);
    for (const l of looks) expect(l.total).toBeLessThanOrEqual(12000);
  });

  it('returns nothing rather than breaking rules when the budget is impossible', () => {
    expect(composeLooks(catalog, profile, { occasion: 'eid', budgetMax: 500 }, winter)).toEqual([]);
  });

  it('is deterministic', () => {
    const a = composeLooks(catalog, profile, { occasion: 'eid' }, winter).map((l) => l.items.map((i) => i.product.id));
    const b = composeLooks(catalog, profile, { occasion: 'eid' }, winter).map((l) => l.items.map((i) => i.product.id));
    expect(a).toEqual(b);
  });

  it('can exclude mains already shown', () => {
    const first = composeLooks(catalog, profile, { occasion: 'eid' }, winter);
    const exclude = first.map((l) => l.items[0].product.id);
    const second = composeLooks(catalog, profile, { occasion: 'eid', excludeMainIds: exclude }, winter);
    for (const l of second) expect(exclude).not.toContain(l.items[0].product.id);
  });

  it('shows more coverage when asked for extra modesty', () => {
    const relaxed = profileFor({ coverage: '2' });
    const looks = composeLooks(catalog, relaxed, { occasion: 'casual', extraModesty: true }, winter);
    for (const l of looks) expect(l.items[0].product.modesty).toBeGreaterThanOrEqual(minModestyFor(3));
  });
});
