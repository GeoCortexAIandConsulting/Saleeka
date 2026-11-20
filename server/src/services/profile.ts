import { z } from 'zod';
import { BUDGET_BANDS, COMPLEXION_PALETTES, QUESTIONS } from '../data/questions.js';
import { KNOWN_BRANDS, MEN_ORDER } from '../data/knownBrands.js';
import { COLOR_NAMES, PALETTE } from '../data/palette.js';
import { OCCASIONS, type Brand, type Occasion, type Profile } from '../types.js';
import { addWeight } from './taste.js';

const arr = (max: number) => z.array(z.string().max(40)).max(max).default([]);

export const answersSchema = z.object({
  gender: z.enum(['female', 'male']).optional(),
  ageRange: z.enum(['under-18', '18-24', '25-34', '35-44', '45-54', '55-plus']).optional(),
  heightCm: z.coerce.number().min(100).max(220).optional(),
  weightKg: z.coerce.number().min(30).max(200).optional(),
  bodyShape: z.string().max(40).optional(),
  shapeShoulders: z.enum(['narrower', 'same', 'wider']).optional(),
  shapeWaist: z.enum(['defined', 'straight', 'fuller']).optional(),
  coverage: z.enum(['1', '2', '3', '4', '5']),
  /** No longer asked: women get a dupatta with formal looks, men never (older answers are kept) */
  dupatta: z.enum(['always', 'formal', 'never', 'hijab']).optional(),
  /** 'eastern' and/or 'western' (older answers may hold specific cuts) */
  silhouettes: arr(3),
  colorsLiked: arr(5),
  /** pick = chose colours, any = no preference, complexion = used the complexion helper */
  colorMode: z.enum(['pick', 'any', 'complexion']).default('pick'),
  undertone: z.enum(['warm', 'cool', 'neutral']).optional(),
  skinDepth: z.enum(['light', 'medium', 'deep']).optional(),
  colorsAvoided: arr(4),
  /** No longer asked: medium unless an older answer says otherwise */
  embellishment: z.enum(['minimal', 'medium', 'heavy']).default('medium'),
  seasons: arr(5),
  fabrics: arr(4),
  occasions: arr(4),
  budget: z.enum(['b1', 'b2', 'b3', 'b4']),
  brandsLiked: arr(6),
  brandsAvoided: arr(4),
  footwear: arr(3),
  styleWords: arr(3),
  neverWear: z.string().max(500).optional(),
});

export type Answers = z.infer<typeof answersSchema>;

const SHAPES = {
  female: new Set(['hourglass', 'pear', 'rectangle', 'apple', 'inverted-triangle']),
  male: new Set(['trapezoid', 'inverted-triangle', 'rectangle', 'triangle', 'oval']),
};

/**
 * Body shape from the quiz: the shopper's own pick, or, for "not sure", worked out from the
 * two proportion questions. Shapes are checked against the gender's list (skipped gender = female).
 * Returns undefined when there is nothing to go on.
 */
export function resolveBodyShape(
  a: Pick<Answers, 'gender' | 'bodyShape' | 'shapeShoulders' | 'shapeWaist'>,
): string | undefined {
  const gender = a.gender ?? 'female';
  if (a.bodyShape && SHAPES[gender].has(a.bodyShape)) return a.bodyShape;
  if (a.bodyShape !== 'not-sure') return undefined; // skipped, not valid for this gender, or the old 'prefer-not'
  const { shapeShoulders: shoulders, shapeWaist: waist } = a;
  if (gender === 'male') {
    if (waist === 'fuller') return 'oval';
    if (shoulders === 'wider') return waist === 'defined' ? 'inverted-triangle' : 'trapezoid';
    if (shoulders === 'narrower') return 'triangle';
    if (shoulders === 'same' && waist) return 'rectangle';
    return undefined;
  }
  if (waist === 'fuller') return 'apple';
  if (shoulders === 'wider') return 'inverted-triangle';
  if (shoulders === 'narrower') return 'pear';
  if (shoulders === 'same' && waist === 'defined') return 'hourglass';
  if (shoulders === 'same' && waist === 'straight') return 'rectangle';
  return undefined; // not enough answered to say
}

const EMBELL_PRESETS: Record<Answers['embellishment'], Record<string, number>> = {
  minimal: { 'embell:0': 1, 'embell:1': 0.5, 'embell:2': -0.5, 'embell:3': -1 },
  medium: { 'embell:0': -0.3, 'embell:1': 0.5, 'embell:2': 1, 'embell:3': 0 },
  heavy: { 'embell:0': -1, 'embell:1': -0.3, 'embell:2': 0.7, 'embell:3': 1.2 },
};

/**
 * Quiz silhouettes the catalog does not tag yet lend some weight to the closest tagged cut,
 * so picking them still shapes recommendations.
 */
const SILHOUETTE_NEAR: Record<string, Record<string, number>> = {
  // The quiz now asks only eastern and/or western: each lends weight to the cuts the catalogue tags.
  eastern: { straight: 1, 'a-line': 1, angrakha: 1, maxi: 1, 'shirt-trouser': 0.6, kurta: 1, 'shalwar kameez': 1, sherwani: 1, 'prince coat': 1 },
  western: { western: 1, fusion: 0.8, shirt: 1, polo: 1, tee: 1, suit: 1 },
  'shalwar-kameez': { straight: 0.8 },
  peplum: { 'a-line': 0.5, western: 0.3 },
  sharara: { 'a-line': 0.5, angrakha: 0.3 },
  anarkali: { maxi: 0.7, 'a-line': 0.5 },
  'co-ord': { 'shirt-trouser': 0.8 },
  fusion: { western: 0.6 },
};

/** Style words nudge the taste vector so they matter before any ranking round. */
const STYLE_NUDGES: Record<string, Record<string, number>> = {
  minimal: { 'embell:0': 0.6, 'family:neutral': 0.6 },
  bold: { 'embell:3': 0.5, 'family:warm': 0.6, 'family:jewel': 0.5 },
  classic: { 'silhouette:straight': 0.6, 'silhouette:a-line': 0.4, 'family:neutral': 0.3 },
  trendy: { 'silhouette:fusion': 0.7, 'silhouette:western': 0.4 },
  elegant: { 'fabric:silk': 0.6, 'fabric:chiffon': 0.5, 'family:jewel': 0.4 },
  playful: { 'family:pastel': 0.6, 'family:warm': 0.4 },
  boho: { 'family:earth': 0.7, 'silhouette:maxi': 0.5 },
  // Men's words
  smart: { 'silhouette:western-shirt': 0.5, 'silhouette:suit': 0.5, 'family:neutral': 0.3 },
  traditional: { 'silhouette:shalwar-kameez': 0.6, 'silhouette:waistcoat': 0.4, 'silhouette:khussa': 0.3 },
  sporty: { 'silhouette:polo-jeans': 0.7, 'silhouette:sneaker': 0.5 },
};

export function validateAnswerOptions(a: Answers, brands: Brand[]): string | null {
  // Catalog brands plus the named brands shoppers can pick before their catalogs exist.
  const brandIds = new Set([...brands.map((b) => b.id), ...KNOWN_BRANDS.map((b) => b.id)]);
  const checks: Array<[string[], Set<string>, string]> = [
    [a.colorsLiked, new Set(COLOR_NAMES), 'colour'],
    [a.colorsAvoided, new Set(COLOR_NAMES), 'colour'],
    [a.occasions, new Set(OCCASIONS), 'occasion'],
    [a.brandsLiked, brandIds, 'brand'],
    [a.brandsAvoided, brandIds, 'brand'],
  ];
  for (const [vals, allowed, label] of checks) {
    const bad = vals.find((v) => !allowed.has(v));
    if (bad) return `Unknown ${label}: ${bad}`;
  }
  if (a.occasions.length === 0) return 'Pick at least one occasion';
  if (a.silhouettes.length === 0) return 'Pick eastern, western or both';
  if (a.colorsLiked.length === 0 && a.colorMode === 'pick') return 'Pick at least one colour you like, or choose “Any colour”';
  if (a.colorMode === 'complexion' && (!a.undertone || !a.skinDepth)) return 'Finish the complexion check, or pick colours yourself';
  const overlap = a.colorsLiked.find((c) => a.colorsAvoided.includes(c));
  if (overlap) return `${overlap} is in both liked and avoided colours`;
  return null;
}

/** Liked colours: "any" means none; the complexion helper fills in its palette if nothing was kept. */
export function likedColors(a: Pick<Answers, 'colorsLiked' | 'colorsAvoided' | 'colorMode' | 'undertone' | 'skinDepth'>): string[] {
  if (a.colorMode === 'any') return [];
  if (a.colorMode === 'complexion' && a.colorsLiked.length === 0 && a.undertone && a.skinDepth) {
    return (COMPLEXION_PALETTES[`${a.undertone}-${a.skinDepth}`] ?? []).filter((c) => !a.colorsAvoided.includes(c));
  }
  return a.colorsLiked;
}

export function buildProfile(userId: string, a: Answers, brands: Brand[], now = new Date()): Profile {
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? KNOWN_BRANDS.find((b) => b.id === id)?.name ?? id;
  const taste: Record<string, number> = {};

  const colorsLiked = likedColors(a);
  colorsLiked.forEach((c) => addWeight(taste, `color:${c}`, 1.5));
  a.colorsAvoided.forEach((c) => addWeight(taste, `color:${c}`, -3));
  a.silhouettes.forEach((s) => {
    addWeight(taste, `silhouette:${s}`, 1.2);
    for (const [near, w] of Object.entries(SILHOUETTE_NEAR[s] ?? {})) addWeight(taste, `silhouette:${near}`, w);
  });
  const fabrics = a.fabrics.includes('all') ? [] : a.fabrics; // "All fabrics" = no preference
  fabrics.forEach((f) => addWeight(taste, `fabric:${f}`, 0.8));
  a.footwear.forEach((f) => addWeight(taste, `silhouette:${f}`, 1.2));
  a.brandsLiked.forEach((b) => addWeight(taste, `brand:${b}`, 1.5));
  a.brandsAvoided.forEach((b) => addWeight(taste, `brand:${b}`, -3));
  for (const [f, w] of Object.entries(EMBELL_PRESETS[a.embellishment])) addWeight(taste, f, w);
  for (const word of a.styleWords) {
    for (const [f, w] of Object.entries(STYLE_NUDGES[word] ?? {})) addWeight(taste, f, w);
  }

  const band = BUDGET_BANDS[a.budget];
  const dupatta = a.gender === 'male' ? 'never' : (a.dupatta ?? 'formal');
  const hijab = dupatta === 'hijab';
  const coverage = Number(a.coverage);

  const profile: Profile = {
    userId,
    gender: a.gender,
    ageRange: a.ageRange,
    heightCm: a.heightCm,
    weightKg: a.weightKg,
    bodyShape: resolveBodyShape(a),
    coverage,
    dupatta: hijab ? 'always' : (dupatta as Profile['dupatta']),
    hijab,
    silhouettes: a.silhouettes,
    colorsLiked,
    colorMode: a.colorMode,
    undertone: a.colorMode === 'complexion' ? a.undertone : undefined,
    skinDepth: a.colorMode === 'complexion' ? a.skinDepth : undefined,
    colorsAvoided: a.colorsAvoided,
    embellishment: a.embellishment,
    fabrics,
    seasons: a.seasons.includes('all') ? ['summer', 'autumn', 'winter', 'spring'] : a.seasons,
    occasions: a.occasions as Occasion[],
    budgetMin: band.min,
    budgetMax: band.max,
    brandsLiked: a.brandsLiked,
    brandsAvoided: a.brandsAvoided,
    footwear: a.footwear,
    styleWords: a.styleWords,
    neverWear: a.neverWear ?? '',
    taste,
    roundsDone: 0,
    summary: '',
    answers: a as unknown as Record<string, unknown>,
    updatedAt: now.toISOString(),
  };
  profile.summary = summarize(profile, brandName);
  return profile;
}

/**
 * The answers as they stand now. Ranking rounds can raise coverage and add avoided colours, so those
 * come from the live profile rather than the original quiz answers.
 */
export function currentAnswers(p: Profile): Record<string, unknown> {
  return { ...(p.answers ?? {}), coverage: String(p.coverage), colorsAvoided: p.colorsAvoided };
}

/**
 * Re-applies changed quiz answers without forgetting what ranking rounds taught us: the learned part
 * of the taste vector (live taste minus what the old answers alone produce) is carried over.
 */
export function updateProfileAnswers(existing: Profile, changes: Record<string, unknown>, brands: Brand[], now = new Date()) {
  const before = answersSchema.parse(currentAnswers(existing));
  const after = answersSchema.parse({ ...currentAnswers(existing), ...changes });
  const problem = validateAnswerOptions(after, brands);
  if (problem) return { problem } as const;

  const oldQuiz = buildProfile(existing.userId, before, brands, now).taste;
  const rebuilt = buildProfile(existing.userId, after, brands, now);
  const taste: Record<string, number> = { ...rebuilt.taste };
  for (const k of new Set([...Object.keys(existing.taste), ...Object.keys(oldQuiz)])) {
    const learned = (existing.taste[k] ?? 0) - (oldQuiz[k] ?? 0);
    if (Math.abs(learned) > 1e-9) taste[k] = Math.round(((taste[k] ?? 0) + learned) * 1000) / 1000;
  }
  const profile: Profile = { ...rebuilt, taste, roundsDone: existing.roundsDone };
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? KNOWN_BRANDS.find((b) => b.id === id)?.name ?? id;
  profile.summary = summarize(profile, brandName);
  return { profile } as const;
}

const COVERAGE_WORDS = ['', 'relaxed', 'balanced', 'modest', 'very modest', 'fully covered'];

export function summarize(p: Profile, brandName: (id: string) => string = (x) => x): string {
  const colors = p.colorsLiked.length ? p.colorsLiked.slice(0, 3).join(', ') : 'any colour';
  const sil = p.silhouettes.length ? p.silhouettes.join(' and ') + ' wear' : 'a range of cuts';
  const parts = [
    `You prefer ${COVERAGE_WORDS[p.coverage]} coverage`,
    `love ${colors}`,
    `lean towards ${sil}`,
    `shop mostly for ${p.occasions.slice(0, 3).join(', ')}`,
    `with a full-outfit budget up to Rs. ${p.budgetMax.toLocaleString('en-PK')}`,
  ];
  if (p.brandsLiked.length) parts.push(`and favour ${p.brandsLiked.map(brandName).join(', ')}`);
  return parts.join(', ').replace(', and favour', ' and favour') + '.';
}

export function publicQuestions(brands: Brand[]) {
  return QUESTIONS.map((q) =>
    q.dynamic === 'brands'
      ? {
          ...q,
          // Women's brands in the order given, then men's (each option is tagged for the quiz to filter).
          options: [
            ...KNOWN_BRANDS.filter((b) => b.genders.includes('female')).map((b) => ({ value: b.id, label: b.name, genders: ['female' as const] })),
            ...MEN_ORDER.map((id) => KNOWN_BRANDS.find((b) => b.id === id)!).map((b) => ({ value: b.id, label: b.name, genders: ['male' as const] })),
          ],
        }
      : q,
  );
}

export { PALETTE };
