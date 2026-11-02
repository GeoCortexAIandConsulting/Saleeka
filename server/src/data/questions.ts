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
    id: 'bodyShape',
    type: 'single',
    title: 'Which body shape sounds closest? (optional)',
    help: 'Helps with silhouette advice. Skip if you prefer.',
    optional: true,
    options: [
      { value: 'hourglass', label: 'Hourglass', hint: 'Shoulders and hips balanced, defined waist', genders: ['female'] },
      { value: 'pear', label: 'Pear', hint: 'Hips wider than shoulders', genders: ['female'] },
      { value: 'rectangle', label: 'Rectangle', hint: 'Shoulders, waist and hips about the same', genders: ['female'] },
      { value: 'apple', label: 'Apple', hint: 'Fuller middle, slimmer legs', genders: ['female'] },
      { value: 'inverted-triangle', label: 'Inverted triangle', hint: 'Shoulders wider than hips', genders: ['female'] },
      { value: 'trapezoid', label: 'Trapezoid', hint: 'Broad chest and shoulders, slightly narrower waist', genders: ['male'] },
      { value: 'inverted-triangle', label: 'Inverted triangle', hint: 'Much broader shoulders than waist and hips', genders: ['male'] },
      { value: 'rectangle', label: 'Rectangle', hint: 'Shoulders, waist and hips about the same', genders: ['male'] },
      { value: 'triangle', label: 'Triangle', hint: 'Hips wider than shoulders', genders: ['male'] },
      { value: 'oval', label: 'Oval', hint: 'Fuller midsection', genders: ['male'] },
      { value: 'not-sure', label: 'Not sure? Help me figure it out', hint: 'Two quick questions and we work it out for you' },
    ],
  },
  {
    id: 'shapeShoulders',
    type: 'single',
    title: 'Compared with your hips, your shoulders are…',
    help: 'Look in a mirror or think about how kameez fit you across the top vs the bottom.',
    optional: true,
    showIf: { id: 'bodyShape', value: 'not-sure' },
    options: [
      { value: 'narrower', label: 'Narrower than my hips', hint: 'Tops fit before bottoms do' },
      { value: 'same', label: 'About the same width' },
      { value: 'wider', label: 'Wider than my hips', hint: 'Bottoms fit before tops do' },
    ],
  },
  {
    id: 'shapeWaist',
    type: 'single',
    title: 'And your waist is…',
    help: 'Compared with your bust and hips.',
    optional: true,
    showIf: { id: 'bodyShape', value: 'not-sure' },
    options: [
      { value: 'defined', label: 'Clearly narrower', hint: 'Fitted waists suit me' },
      { value: 'straight', label: 'Not much narrower', hint: 'Fairly straight up and down' },
      { value: 'fuller', label: 'About the same or fuller', hint: 'I carry weight around my middle' },
    ],
  },
  {
    id: 'coverage',
    type: 'single',
    title: 'How much coverage do you like in your outfits?',
    help: 'We will never show you looks below this level.',
    options: [
      { value: '1', label: 'Relaxed', hint: 'Short sleeves and shorter lengths are fine' },
      { value: '2', label: 'Balanced', hint: 'Mostly covered, some sleeve or length variety' },
      { value: '3', label: 'Modest', hint: 'Sleeves to the elbow or longer, longer kameez' },
      { value: '4', label: 'Very modest', hint: 'Full sleeves, long lengths, higher necklines' },
      { value: '5', label: 'Fully covered', hint: 'Maximum coverage, hijab and abaya friendly' },
    ],
  },
  {
    id: 'dupatta',
    type: 'single',
    title: 'Do you wear a dupatta or scarf?',
    options: [
      { value: 'always', label: 'Always' },
      { value: 'formal', label: 'Only for formal events' },
      { value: 'never', label: 'Rarely or never' },
      { value: 'hijab', label: 'I wear hijab' },
    ],
  },
  {
    id: 'silhouettes',
    type: 'multi',
    max: 3,
    title: 'Which silhouettes do you love? (pick up to 3)',
    options: [
      // Women
      { value: 'western', label: 'Western style', genders: ['female'] },
      { value: 'shalwar-kameez', label: 'Classic shalwar kameez', genders: ['female'] },
      { value: 'a-line', label: 'A-line / flared kameez', genders: ['female'] },
      { value: 'angrakha', label: 'Angrakha', genders: ['female'] },
      { value: 'maxi', label: 'Maxi / long frock', genders: ['female'] },
      { value: 'peplum', label: 'Peplum', genders: ['female'] },
      { value: 'sharara', label: 'Sharara / gharara', genders: ['female'] },
      { value: 'anarkali', label: 'Anarkali', genders: ['female'] },
      { value: 'co-ord', label: 'Co-ord set (short shirt + trouser)', genders: ['female'] },
      { value: 'fusion', label: 'Fusion / western-cut', genders: ['female'] },
      // Men
      { value: 'shalwar-kameez', label: 'Shalwar kameez', genders: ['male'] },
      { value: 'kurta-trouser', label: 'Kurta + trouser / pajama', genders: ['male'] },
      { value: 'waistcoat', label: 'Waistcoat (with kurta or shalwar kameez)', genders: ['male'] },
      { value: 'western-shirt', label: 'Western shirt + trouser', genders: ['male'] },
      { value: 'suit', label: 'Suit (two-piece / three-piece)', genders: ['male'] },
      { value: 'sherwani', label: 'Sherwani', genders: ['male'] },
      { value: 'prince-coat', label: 'Prince coat', genders: ['male'] },
      { value: 'polo-jeans', label: 'Polo / T-shirt + jeans or chinos', genders: ['male'] },
      { value: 'pathani', label: 'Pathani suit', genders: ['male'] },
      { value: 'kurta-jeans', label: 'Kurta + jeans (fusion)', genders: ['male'] },
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
    id: 'embellishment',
    type: 'single',
    title: 'How much embroidery and embellishment?',
    options: [
      { value: 'minimal', label: 'Minimal', hint: 'Plain or lightly printed', genders: ['female'] },
      { value: 'medium', label: 'Medium', hint: 'Some embroidery or lace', genders: ['female'] },
      { value: 'heavy', label: 'Heavy', hint: 'Statement work, shine and detail', genders: ['female'] },
      { value: 'minimal', label: 'Minimal', hint: 'Plain fabric or a subtle texture', genders: ['male'] },
      { value: 'medium', label: 'Medium', hint: 'Embroidered collar, placket or cuffs', genders: ['male'] },
      { value: 'heavy', label: 'Heavy', hint: 'Statement work: dense embroidery, zari and buttons', genders: ['male'] },
    ],
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
    id: 'footwear',
    type: 'multi',
    max: 3,
    title: 'Shoes you actually wear',
    options: [
      { value: 'heel', label: 'Heels' },
      { value: 'flat', label: 'Flats' },
      { value: 'khussa', label: 'Khussa' },
      { value: 'sneaker', label: 'Sneakers' },
      { value: 'sandal', label: 'Sandals' },
    ],
  },
  {
    id: 'styleWords',
    type: 'multi',
    max: 3,
    title: 'Words that fit your style (pick up to 3)',
    options: ['minimal', 'bold', 'classic', 'trendy', 'elegant', 'playful', 'boho'].map((w) => ({
      value: w,
      label: w,
    })),
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
