import { COLOR_NAMES, PALETTE } from './palette.js';

export type QuestionType = 'single' | 'multi' | 'number' | 'text';

export interface QuestionOption {
  value: string;
  label: string;
  hex?: string;
  hint?: string;
  /** Only offer this option for these genders (the quiz treats a skipped gender as female) */
  genders?: Gender[];
  /** Fabrics: seasons this option suits, used to show the right fabrics first */
  seasons?: Season[];
  /** Multi questions: picking this clears the other picks, and vice versa (e.g. "All fabrics") */
  exclusive?: boolean;
}

export type Season = 'summer' | 'autumn' | 'winter' | 'spring';

export type Gender = 'female' | 'male';

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  help?: string;
  options?: QuestionOption[];
  /** For multi questions: maximum selections */
  max?: number;
  optional?: boolean;
  /** For brand questions: options are filled in from the brand registry */
  dynamic?: 'brands';
  min?: number;
  maxValue?: number;
  /** Number questions: unit shown next to the box */
  unit?: string;
  /** Colour question: suggested colours by `${undertone}-${depth}` for the complexion helper */
  palettes?: Record<string, string[]>;
  /** Only ask this question when another question has this answer */
  showIf?: { id: string; value: string };
  /** Only ask this question for these genders (a skipped gender counts as female) */
  genders?: Gender[];
  /** Help worded for one gender, in place of `help` */
  helpFor?: Partial<Record<Gender, string>>;
}

/**
 * Colours that tend to flatter each undertone and depth. A starting point the shopper can edit,
 * never a rule: every colour stays available.
 */
export const COMPLEXION_PALETTES: Record<string, string[]> = {
  'warm-light': ['peach', 'ivory', 'mint', 'gold', 'sage'],
  'warm-medium': ['mustard', 'rust', 'olive', 'emerald', 'gold'],
  'warm-deep': ['mustard', 'orange', 'emerald', 'gold', 'maroon'],
  'cool-light': ['blush', 'lilac', 'sky', 'silver', 'navy'],
  'cool-medium': ['pink', 'royal', 'plum', 'emerald', 'silver'],
  'cool-deep': ['royal', 'white', 'plum', 'teal', 'red'],
  'neutral-light': ['blush', 'sage', 'beige', 'navy', 'teal'],
  'neutral-medium': ['teal', 'maroon', 'sage', 'blush', 'navy'],
  'neutral-deep': ['teal', 'red', 'emerald', 'white', 'maroon'],
};

export const QUESTIONS: Question[] = [
  {
    id: 'gender',
    type: 'single',
    title: 'Who are we styling? (optional)',
    help: 'Sets the body shapes and figure previews we show you.',
    optional: true,
    options: [
      { value: 'female', label: 'Woman' },
      { value: 'male', label: 'Man' },
    ],
  },
  {
    id: 'ageRange',
    type: 'single',
    title: 'What’s your age range? (optional)',
    help: 'Helps us suggest styles that suit your stage of life. You can skip it.',
    optional: true,
    options: [
      { value: 'under-18', label: 'Under 18' },
      { value: '18-24', label: '18 – 24' },
      { value: '25-34', label: '25 – 34' },
      { value: '35-44', label: '35 – 44' },
      { value: '45-54', label: '45 – 54' },
      { value: '55-plus', label: '55 or older' },
    ],
  },
  {
    id: 'heightCm',
    type: 'number',
    title: 'How tall are you? (optional)',
    help: 'Used only to suggest lengths and proportions. You can skip it.',
    optional: true,
    min: 130,
    maxValue: 200,
  },
  {
    id: 'weightKg',
    type: 'number',
    title: 'What do you weigh? (optional)',
    help: 'Only used to shape your 3D avatar. It is never shown to anyone else, and you can skip it.',
    optional: true,
    min: 30,
    maxValue: 200,
    unit: 'kg',
  },
  {
    id: 'coverage',
    type: 'single',
    title: 'How much coverage do you like in your outfits?',
    help: 'We will never show you looks below this level.',
    helpFor: { male: 'How covered and how traditional you like to dress.' },
    options: [
      { value: '1', label: 'Relaxed', hint: 'Short sleeves and shorter lengths are fine', genders: ['female'] },
      { value: '2', label: 'Balanced', hint: 'Mostly covered, some sleeve or length variety', genders: ['female'] },
      { value: '3', label: 'Modest', hint: 'Sleeves to the elbow or longer, longer kameez', genders: ['female'] },
      { value: '4', label: 'Very modest', hint: 'Full sleeves, long lengths, higher necklines', genders: ['female'] },
      { value: '5', label: 'Fully covered', hint: 'Maximum coverage, hijab and abaya friendly', genders: ['female'] },
      { value: '1', label: 'Relaxed', hint: 'Half sleeves, polos and T-shirts are fine', genders: ['male'] },
      { value: '3', label: 'Classic', hint: 'Full sleeves; a kurta to the knee', genders: ['male'] },
      { value: '4', label: 'Traditional', hint: 'Long, loose kurta or shalwar kameez; nothing tight', genders: ['male'] },
    ],
  },
  {
    id: 'silhouettes',
    type: 'multi',
    max: 2,
    title: 'What do you like to wear?',
    help: 'Pick both if you wear both.',
    options: [
      { value: 'eastern', label: 'Eastern', hint: 'Shalwar kameez, kurta, sherwani and other desi wear' },
      { value: 'western', label: 'Western', hint: 'Shirts, tops, trousers, jeans, dresses and suits' },
    ],
  },
  {
    id: 'colorsLiked',
    type: 'multi',
    max: 5,
    title: 'Which colours do you love? (pick up to 5)',
    help: 'Not sure? Choose “Any colour”, or let us suggest colours for your complexion.',
    options: COLOR_NAMES.map((c) => ({ value: c, label: c, hex: PALETTE[c].hex })),
    palettes: COMPLEXION_PALETTES,
  },
  {
    id: 'colorsAvoided',
    type: 'multi',
    max: 4,
    optional: true,
    title: 'Any colours you never wear? (optional)',
    options: COLOR_NAMES.map((c) => ({ value: c, label: c, hex: PALETTE[c].hex })),
  },
  {
    id: 'seasons',
    type: 'multi',
    max: 4,
    title: 'Which seasons are you shopping for?',
    help: 'We’ll show the fabrics that suit them first.',
    options: [
      { value: 'summer', label: 'Summer', hint: 'May – Aug' },
      { value: 'autumn', label: 'Autumn', hint: 'Sep – Nov' },
      { value: 'winter', label: 'Winter', hint: 'Dec – Feb' },
      { value: 'spring', label: 'Spring', hint: 'Mar – Apr' },
      { value: 'all', label: 'All year round', hint: 'Every season', exclusive: true },
    ],
  },
  {
    id: 'fabrics',
    type: 'multi',
    max: 4,
    title: 'Fabrics you enjoy wearing (pick up to 4)',
    options: [
      { value: 'all', label: 'All fabrics', hint: 'No preference', exclusive: true },
      // Both
      { value: 'lawn', label: 'Lawn', seasons: ['summer', 'spring'] },
      { value: 'cotton', label: 'Cotton', seasons: ['summer', 'spring', 'autumn'] },
      { value: 'linen', label: 'Linen', seasons: ['summer', 'spring', 'autumn'] },
      { value: 'khaddar', label: 'Khaddar', seasons: ['autumn', 'winter'] },
      { value: 'karandi', label: 'Karandi', seasons: ['winter'] },
      { value: 'velvet', label: 'Velvet', seasons: ['winter'] },
      // Women
      { value: 'cambric', label: 'Cambric', seasons: ['summer', 'spring'], genders: ['female'] },
      { value: 'voile', label: 'Voile', seasons: ['summer'], genders: ['female'] },
      { value: 'chiffon', label: 'Chiffon', seasons: ['summer', 'spring', 'autumn'], genders: ['female'] },
      { value: 'organza', label: 'Organza', seasons: ['summer', 'spring', 'autumn'], genders: ['female'] },
      { value: 'silk', label: 'Silk', seasons: ['spring', 'autumn', 'winter'], genders: ['female'] },
      { value: 'raw-silk', label: 'Raw silk', seasons: ['autumn', 'winter'], genders: ['female'] },
      { value: 'jacquard', label: 'Jacquard', seasons: ['autumn', 'winter'], genders: ['female'] },
      { value: 'marina', label: 'Marina', seasons: ['winter'], genders: ['female'] },
      // Men
      { value: 'wash-and-wear', label: 'Wash & wear', seasons: ['summer', 'spring', 'autumn'], genders: ['male'] },
      { value: 'boski', label: 'Boski', seasons: ['spring', 'autumn'], genders: ['male'] },
      { value: 'jamawar', label: 'Jamawar', seasons: ['autumn', 'winter'], genders: ['male'] },
      { value: 'wool', label: 'Wool', seasons: ['autumn', 'winter'], genders: ['male'] },
      { value: 'tweed', label: 'Tweed', seasons: ['winter'], genders: ['male'] },
    ],
  },
  {
    id: 'occasions',
    type: 'multi',
    max: 4,
    title: 'What do you shop for most? (pick up to 4)',
    options: [
      { value: 'office', label: 'Office' },
      { value: 'university', label: 'University' },
      { value: 'casual', label: 'Everyday casual' },
      { value: 'eid', label: 'Eid' },
      { value: 'mehndi', label: 'Mehndi' },
      { value: 'baraat', label: 'Baraat' },
      { value: 'walima', label: 'Walima' },
      { value: 'party', label: 'Parties' },
    ],
  },
  {
    id: 'budget',
    type: 'single',
    title: 'Typical budget for a complete outfit (PKR)',
    help: 'Head to toe: clothes, dupatta, shoes and accessories.',
    helpFor: { male: 'Head to toe: clothes, waistcoat, shoes and accessories.' },
    options: [
      { value: 'b1', label: 'Under 10,000' },
      { value: 'b2', label: '10,000 to 20,000' },
      { value: 'b3', label: '20,000 to 40,000' },
      { value: 'b4', label: '40,000 and above' },
    ],
  },
  {
    id: 'brandsLiked',
    type: 'multi',
    max: 6,
    optional: true,
    dynamic: 'brands',
    title: 'Brands you already like (optional)',
  },
  {
    id: 'brandsAvoided',
    type: 'multi',
    max: 4,
    optional: true,
    dynamic: 'brands',
    title: 'Brands you would rather skip (optional)',
  },
  {
    id: 'styleWords',
    type: 'multi',
    max: 3,
    title: 'Words that fit your style (pick up to 3)',
    options: [
      ...['minimal', 'bold', 'classic', 'trendy', 'elegant', 'playful', 'boho'].map((w) => ({ value: w, label: w, genders: ['female' as Gender] })),
      ...['classic', 'smart', 'traditional', 'minimal', 'bold', 'trendy', 'sporty'].map((w) => ({ value: w, label: w, genders: ['male' as Gender] })),
    ],
  },
  {
    id: 'neverWear',
    type: 'text',
    optional: true,
    title: 'Anything you never want to wear, and why? (optional)',
    help: 'For example: "nothing tight, I find it uncomfortable".',
  },
];

export const BUDGET_BANDS: Record<string, { min: number; max: number }> = {
  b1: { min: 0, max: 10000 },
  b2: { min: 10000, max: 20000 },
  b3: { min: 20000, max: 40000 },
  b4: { min: 40000, max: 200000 },
};
