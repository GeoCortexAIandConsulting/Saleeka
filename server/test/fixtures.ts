import { DEMO_BRANDS, buildDemoCatalog } from '../src/data/seed.js';
import { answersSchema, buildProfile, type Answers } from '../src/services/profile.js';

export const modestAnswers: Answers = answersSchema.parse({
  coverage: '4',
  dupatta: 'always',
  silhouettes: ['straight', 'a-line'],
  colorsLiked: ['emerald', 'ivory', 'blush'],
  colorsAvoided: ['orange'],
  embellishment: 'medium',
  fabrics: ['chiffon', 'cotton'],
  occasions: ['office', 'eid', 'mehndi'],
  budget: 'b3',
  brandsLiked: ['b_loom'],
  brandsAvoided: ['b_street'],
  footwear: ['flat', 'khussa'],
  styleWords: ['elegant', 'classic'],
});

export const catalog = buildDemoCatalog();

export function profileFor(overrides: Partial<Answers> = {}) {
  const answers = answersSchema.parse({ ...modestAnswers, ...overrides });
  return { ...buildProfile('u1', answers, DEMO_BRANDS), id: 'u1' };
}
