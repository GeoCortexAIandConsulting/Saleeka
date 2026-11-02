import { describe, expect, it } from 'vitest';
import { answersSchema, buildProfile, likedColors, publicQuestions, validateAnswerOptions } from '../src/services/profile.js';
import { COMPLEXION_PALETTES, QUESTIONS } from '../src/data/questions.js';
import { DEMO_BRANDS } from '../src/data/seed.js';
import { COLOR_NAMES } from '../src/data/palette.js';
import { modestAnswers } from './fixtures.js';

const parse = (o: Record<string, unknown>) => answersSchema.parse({ ...modestAnswers, ...o });

describe('colour modes', () => {
  it('"Any colour" needs no picks and stores none', () => {
    const a = parse({ colorMode: 'any', colorsLiked: [] });
    expect(validateAnswerOptions(a, DEMO_BRANDS)).toBeNull();
    expect(buildProfile('u', a, DEMO_BRANDS).colorsLiked).toEqual([]);
  });

  it('still asks for colours in pick mode', () => {
    expect(validateAnswerOptions(parse({ colorsLiked: [] }), DEMO_BRANDS)).toMatch(/colour/);
  });

  it('complexion mode saves undertone and depth, and fills the palette if nothing was kept', () => {
    const a = parse({ colorMode: 'complexion', undertone: 'warm', skinDepth: 'medium', colorsLiked: [], colorsAvoided: ['rust'] });
    expect(validateAnswerOptions(a, DEMO_BRANDS)).toBeNull();
    const p = buildProfile('u', a, DEMO_BRANDS);
    expect(p.undertone).toBe('warm');
    expect(p.skinDepth).toBe('medium');
    expect(p.colorsLiked).toEqual(['mustard', 'olive', 'emerald', 'gold']); // rust is avoided
  });

  it('complexion mode without a result is rejected', () => {
    expect(validateAnswerOptions(parse({ colorMode: 'complexion', colorsLiked: [] }), DEMO_BRANDS)).toMatch(/complexion/);
  });

  it('only stores undertone and depth when the complexion helper was used', () => {
    const p = buildProfile('u', parse({ undertone: 'cool', skinDepth: 'light' }), DEMO_BRANDS);
    expect(p.undertone).toBeUndefined();
    expect(likedColors(parse({}))).toEqual(modestAnswers.colorsLiked);
  });

  it('every palette uses real colour names', () => {
    for (const colors of Object.values(COMPLEXION_PALETTES)) {
      expect(colors).toHaveLength(5);
      for (const c of colors) expect(COLOR_NAMES).toContain(c);
    }
  });
});

describe('age range', () => {
  it('is asked right after gender, is optional, and is saved', () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(ids.indexOf('ageRange')).toBe(ids.indexOf('gender') + 1);
    expect(QUESTIONS.find((q) => q.id === 'ageRange')!.optional).toBe(true);
    expect(buildProfile('u', parse({ ageRange: '25-34' }), DEMO_BRANDS).ageRange).toBe('25-34');
    expect(buildProfile('u', parse({}), DEMO_BRANDS).ageRange).toBeUndefined();
    expect(() => parse({ ageRange: '99' })).toThrow();
  });
});

describe('seasons and fabrics', () => {
  it('asks seasons right before fabrics', () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(ids.indexOf('seasons')).toBe(ids.indexOf('fabrics') - 1);
  });

  it('every season has fabrics for both women and men, plus "All fabrics"', () => {
    const fabrics = QUESTIONS.find((q) => q.id === 'fabrics')!.options!;
    expect(fabrics.find((o) => o.value === 'all')?.exclusive).toBe(true);
    for (const season of ['summer', 'autumn', 'winter', 'spring'] as const) {
      for (const g of ['female', 'male'] as const) {
        const n = fabrics.filter((o) => o.seasons?.includes(season) && (!o.genders || o.genders.includes(g))).length;
        expect(n, `${g} ${season}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('"All fabrics" and "All year round" mean no preference / every season', () => {
    const p = buildProfile('u', parse({ fabrics: ['all'], seasons: ['all'] }), DEMO_BRANDS);
    expect(p.fabrics).toEqual([]);
    expect(p.seasons).toEqual(['summer', 'autumn', 'winter', 'spring']);
  });
});

describe('brands', () => {
  it('offers the named brands by gender and accepts them', () => {
    const q = publicQuestions(DEMO_BRANDS).find((x) => x.id === 'brandsLiked')!;
    const forG = (g: string) => q.options!.filter((o: any) => o.genders.includes(g)).map((o) => o.label);
    expect(forG('female')).toHaveLength(15);
    expect(forG('male')).toHaveLength(15);
    expect(forG('female')[0]).toBe('Khaadi');
    expect(forG('male')[0]).toBe('J. (Junaid Jamshed)');
    expect(forG('male')).toContain('Amir Adnan');
    expect(forG('female')).not.toContain('Amir Adnan');
    const a = parse({ brandsLiked: ['maria-b', 'khaadi'], brandsAvoided: [] });
    expect(validateAnswerOptions(a, DEMO_BRANDS)).toBeNull();
    expect(buildProfile('u', a, DEMO_BRANDS).summary).toContain('Maria B');
  });

  it('allows up to 6 liked brands', () => {
    const six = ['khaadi', 'sapphire', 'maria-b', 'gul-ahmed', 'limelight', 'beechtree'];
    expect(() => parse({ brandsLiked: six, brandsAvoided: [] })).not.toThrow();
    expect(() => parse({ brandsLiked: [...six, 'bareeze'], brandsAvoided: [] })).toThrow();
    expect(QUESTIONS.find((q) => q.id === 'brandsLiked')!.max).toBe(6);
  });
});
