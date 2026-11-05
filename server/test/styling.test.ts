import { describe, expect, it } from 'vitest';
import { DEMO_BRANDS } from '../src/data/seed.js';
import { nearbyColors } from '../src/data/palette.js';
import { composeWithRelaxation, mergeConstraints } from '../src/services/chat.js';
import { composeLooks } from '../src/services/composer.js';
import { parseRequestRules } from '../src/services/llm.js';
import { catalog, profileFor } from './fixtures.js';

const winter = new Date('2026-11-01T10:00:00Z');
const parse = (message: string) => parseRequestRules(message, { brands: DEMO_BRANDS });
const slotsOf = (look: { items: Array<{ slot: string }> }) => look.items.map((i) => i.slot);

describe('reading modesty and head covering from chat', () => {
  it('treats "modest" as a request for more coverage and a dupatta', () => {
    expect(parse('modest outfit for eid')).toMatchObject({ extraModesty: true, wantsDupatta: true });
  });

  it.each(['dupatta', 'duppata', 'dopatta', 'dupata'])('understands the spelling "%s"', (word) => {
    expect(parse(`office outfit with ${word}`).wantsDupatta).toBe(true);
  });

  it('asks for a scarf specifically when the shopper says scarf or hijab', () => {
    expect(parse('eid outfit with a scarf').wantsScarf).toBe(true);
    expect(parse('hijab friendly outfit for walima')).toMatchObject({ wantsScarf: true, extraModesty: true });
    expect(parse('office outfit with dupatta').wantsScarf).toBeUndefined();
  });

  it('does not read a refusal as a request', () => {
    for (const message of ['eid outfit without dupatta', 'no scarf please, for eid', 'eid ke liye dupatta nahi']) {
      const c = parse(message);
      expect(c.wantsDupatta).toBe(false);
      expect(c.wantsScarf).toBeUndefined();
    }
  });

  it('says nothing about covering when the shopper does not', () => {
    const c = parse('emerald outfit for eid under 20000');
    expect(c.wantsDupatta).toBeUndefined();
    expect(c.extraModesty).toBeUndefined();
  });

  it('remembers the request across chat messages, and lets the shopper take it back', () => {
    const asked = mergeConstraints({ colors: [], brands: [] }, parse('modest with a scarf for eid'));
    const later = mergeConstraints(asked, parse('make it under 30000'));
    expect(later).toMatchObject({ wantsDupatta: true, wantsScarf: true, extraModesty: true });
    const refused = mergeConstraints(later, parse('actually no dupatta'));
    expect(refused).toMatchObject({ wantsDupatta: false, wantsScarf: false });
  });
});

describe('head covering in looks', () => {
  // The bug: these shoppers answered the quiz this way and then asked for modest in chat.
  it.each(['never', 'formal'] as const)('a modest request beats the quiz answer "%s"', (dupatta) => {
    const profile = profileFor({ dupatta, coverage: '2' });
    const looks = composeLooks(catalog, profile, { occasion: 'office', extraModesty: true, wantsDupatta: true, budgetMax: 25000 }, winter);
    expect(looks.length).toBeGreaterThan(0);
    for (const look of looks) {
      expect(look.items[0].product.includesDupatta || slotsOf(look).includes('dupatta')).toBe(true);
    }
  });

  it('adds a scarf when asked, even with a suit that includes a dupatta', () => {
    const profile = profileFor({ dupatta: 'never' });
    const looks = composeLooks(catalog, profile, { occasion: 'eid', wantsScarf: true, budgetMax: 40000 }, winter);
    expect(looks.length).toBeGreaterThan(0);
    for (const look of looks) expect(look.items.find((i) => i.slot === 'dupatta')?.product.silhouette).toBe('scarf');
  });

  it('leaves the dupatta out when the shopper says so, despite the quiz', () => {
    const profile = profileFor({ dupatta: 'always' });
    for (const look of composeLooks(catalog, profile, { occasion: 'eid', wantsDupatta: false, budgetMax: 40000 }, winter)) {
      expect(slotsOf(look)).not.toContain('dupatta');
    }
  });

  it('skips an outfit rather than showing it without the dupatta the shopper wants', () => {
    const profile = profileFor({ dupatta: 'always' });
    const noDupattas = catalog.filter((p) => p.slot !== 'dupatta');
    for (const look of composeLooks(noDupattas, profile, { occasion: 'eid', budgetMax: 40000 }, winter)) {
      expect(look.items[0].product.includesDupatta).toBe(true);
    }
  });

  it('holds the coverage floor for a low-coverage shopper who asks for modest', () => {
    const profile = profileFor({ coverage: '1' });
    for (const look of composeLooks(catalog, profile, { occasion: 'casual', extraModesty: true }, winter)) {
      expect(look.items[0].product.modesty).toBeGreaterThanOrEqual(4);
    }
  });

  it('never answers a modest or head-covering request with a western dress', () => {
    const profile = profileFor({ dupatta: 'never', coverage: '1' });
    for (const asked of [{ extraModesty: true }, { wantsDupatta: true }, { wantsScarf: true }]) {
      for (const look of composeLooks(catalog, profile, { occasion: 'eid', budgetMax: 40000, ...asked }, winter)) {
        expect(look.items[0].product.silhouette).not.toBe('western');
      }
    }
  });
});

describe('dressing for the occasion', () => {
  it.each(['eid', 'mehndi', 'party', 'walima'] as const)('never puts sneakers, totes or shoulder bags in a %s look', (occasion) => {
    const looks = composeLooks(catalog, profileFor(), { occasion, budgetMax: 45000 }, winter);
    expect(looks.length).toBeGreaterThan(0);
    for (const look of looks) {
      for (const { product } of look.items) expect(['sneaker', 'tote', 'shoulder bag']).not.toContain(product.silhouette);
    }
  });

  it('keeps potlis, clutches and bridal jewellery out of everyday looks', () => {
    for (const occasion of ['office', 'casual', 'university'] as const) {
      for (const look of composeLooks(catalog, profileFor(), { occasion, budgetMax: 30000 }, winter)) {
        for (const { product } of look.items) expect(['clutch', 'potli', 'jhumkay', 'necklace set', 'maang tikka']).not.toContain(product.silhouette);
      }
    }
  });
});

describe('complete looks', () => {
  it('keeps shoes, bag and jewellery when the budget allows it', () => {
    const looks = composeLooks(catalog, profileFor(), { occasion: 'eid', budgetMax: 45000 }, winter);
    expect(looks).toHaveLength(3);
    for (const look of looks) expect(slotsOf(look)).toEqual(expect.arrayContaining(['footwear', 'bag', 'jewelry']));
  });

  it('never goes over budget to stay complete', () => {
    for (const budgetMax of [12000, 18000, 25000]) {
      for (const look of composeLooks(catalog, profileFor(), { occasion: 'eid', budgetMax }, winter)) {
        expect(look.total).toBeLessThanOrEqual(budgetMax);
      }
    }
  });
});

describe('requested colours', () => {
  const ask = (message: string, overrides = {}) => composeWithRelaxation(catalog, profileFor(overrides), parse(message));

  it('finds close shades of a colour and never neutrals', () => {
    expect(nearbyColors(['emerald'])).toContain('teal');
    for (const c of nearbyColors(['emerald'])) expect(['black', 'white', 'ivory', 'beige', 'grey', 'gold', 'silver']).not.toContain(c);
    expect(nearbyColors(['black'])).toEqual([]);
  });

  // The bug: an emerald outfit existed, and was thrown away in favour of black and mustard.
  it('keeps the emerald look that exists instead of discarding it when there are too few', () => {
    const { looks, notes } = ask('emerald outfit for eid under 20000');
    expect(looks.length).toBe(3);
    expect(looks.filter((l) => l.items[0].product.colors.includes('emerald')).length).toBeGreaterThan(0);
    expect(looks[0].items[0].product.colors).toContain('emerald');
    expect(notes.join(' ')).toMatch(/emerald/);
    expect(notes.join(' ')).not.toMatch(/nearby colours/);
  });

  it('ranks an outfit that is mainly the colour above one with only a touch of it', () => {
    const looks = composeLooks(catalog, profileFor(), { occasion: 'party', colors: ['emerald', 'sage', 'mint', 'olive'], budgetMax: 25000 }, winter);
    const primary = looks.map((l) => ['emerald', 'sage', 'mint', 'olive'].includes(l.items[0].product.colors[0]));
    expect(primary[0]).toBe(true);
  });

  it('adds no colour note when every look is in the requested colour', () => {
    const { looks, notes } = ask('green outfit for eid under 45000');
    if (looks.every((l) => l.items[0].product.colors.some((c) => ['emerald', 'sage', 'mint', 'olive'].includes(c)))) {
      expect(notes).toEqual([]);
    }
  });
});
