// Core domain types shared across the API.

export type Slot = 'main' | 'bottom' | 'dupatta' | 'footwear' | 'bag' | 'jewelry';
export const SLOTS: Slot[] = ['main', 'bottom', 'dupatta', 'footwear', 'bag', 'jewelry'];

export type Tier = 'budget' | 'mid' | 'premium';
export type Sleeve = 'sleeveless' | 'short' | 'three-quarter' | 'full';
export type Length = 'short' | 'knee' | 'midi' | 'full';
export type Neckline = 'open' | 'regular' | 'high';
export type Occasion =
  | 'office'
  | 'university'
  | 'casual'
  | 'eid'
  | 'mehndi'
  | 'baraat'
  | 'walima'
  | 'party';

export const OCCASIONS: Occasion[] = [
  'office',
  'university',
  'casual',
  'eid',
  'mehndi',
  'baraat',
  'walima',
  'party',
];

export const FORMAL_OCCASIONS: Occasion[] = ['eid', 'mehndi', 'baraat', 'walima', 'party'];

export interface Brand {
  id: string;
  name: string;
  tier: Tier;
}

export interface Product {
  id: string;
  brandId: string;
  brandName: string;
  tier: Tier;
  title: string;
  slot: Slot;
  /** Price in PKR */
  price: number;
  colors: string[]; // names from the palette
  hex: string; // main display colour
  fabric: string;
  silhouette: string; // straight, a-line, maxi, angrakha, shirt-trouser, western, fusion, flat, heel, ...
  sleeve?: Sleeve;
  length?: Length;
  neckline?: Neckline;
  sheer: boolean;
  /** 0 = plain, 3 = heavy embellishment */
  embellishment: 0 | 1 | 2 | 3;
  /** 0 to 5; computed from sleeve, length, neckline and sheerness (main and bottom only) */
  modesty: number;
  occasions: Occasion[];
  seasons: Array<'summer' | 'winter' | 'all'>;
  /** Main pieces: does the product already come with a dupatta / a bottom? */
  includesDupatta: boolean;
  includesBottom: boolean;
  stitched: boolean;
  sizes: string[];
  inStock: boolean;
  url: string;
  /** Product photos on the brand's own site (shown from there, never copied) */
  images?: string[];
  /** When stock and price were last read from the brand's site */
  checkedAt?: string;
  /** Demo flag: all seed data is placeholder data */
  demo?: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  consentAt: string;
  createdAt: string;
  /** Optional profile photo the user uploaded: a small JPEG/PNG/WebP data URL (resized in the browser) */
  photo?: string;
  photoUpdatedAt?: string;
  /** Optional 3D avatar face, built in the browser from a selfie. Removable any time. */
  avatar?: AvatarFace;
}

export interface AvatarFace {
  /** 468 face-mesh points, front-on and in centimetres (x, y, z flattened) */
  points: number[];
  /** Where each point sits on the face texture, 0..1 (u, v flattened) */
  uvs: number[];
  /** Small JPEG of the face, already blended to skin colour at the edges */
  texture: string;
  /** Skin colour sampled from the face, used for the rest of the body */
  skinHex: string;
  updatedAt: string;
}

export interface Profile {
  userId: string;
  gender?: 'female' | 'male';
  ageRange?: 'under-18' | '18-24' | '25-34' | '35-44' | '45-54' | '55-plus';
  heightCm?: number;
  /** Only used to shape the 3D avatar */
  weightKg?: number;
  bodyShape?: string;
  /** 1 (relaxed) to 5 (fully covered) */
  coverage: number;
  dupatta: 'always' | 'formal' | 'never';
  hijab: boolean;
  silhouettes: string[];
  colorsLiked: string[];
  colorMode?: 'pick' | 'any' | 'complexion';
  /** From the on-device complexion check; the photo itself is never sent or stored */
  undertone?: 'warm' | 'cool' | 'neutral';
  skinDepth?: 'light' | 'medium' | 'deep';
  colorsAvoided: string[];
  embellishment: 'minimal' | 'medium' | 'heavy';
  fabrics: string[];
  seasons?: string[];
  occasions: Occasion[];
  budgetMin: number;
  budgetMax: number;
  brandsLiked: string[];
  brandsAvoided: string[];
  footwear: string[];
  styleWords: string[];
  neverWear: string;
  /** Learned feature weights, e.g. "color:emerald" -> 1.5 */
  taste: Record<string, number>;
  roundsDone: number;
  summary: string;
  answers: Record<string, unknown>;
  updatedAt: string;
}

export interface LookItem {
  slot: Slot;
  productId: string;
}

export interface Look {
  id: string;
  userId: string;
  label: string;
  occasion: Occasion | null;
  items: LookItem[];
  total: number;
  score: number;
  reason?: string;
  saved: boolean;
  source: 'round' | 'chat';
  createdAt: string;
}

export interface RoundRecord {
  id: string;
  userId: string;
  index: number;
  lookIds: string[];
  ranks?: string[]; // look ids, best first
  tags?: Record<string, string[]>; // lookId -> quick tags
  note?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ChatConstraints {
  occasion?: Occasion;
  colors: string[];
  brands: string[];
  budgetMax?: number;
  extraModesty?: boolean;
  /** Said in chat, so it overrides the quiz: true = add a dupatta/scarf, false = "no dupatta". */
  wantsDupatta?: boolean;
  /** Asked for a scarf or hijab: the head covering must be a scarf, even with a 3-piece. */
  wantsScarf?: boolean;
}

export interface ChatSession {
  id: string;
  userId: string;
  constraints: ChatConstraints;
  followUps: number;
  messages: Array<{ role: 'user' | 'assistant'; text: string; at: string }>;
  lookIds: string[];
  createdAt: string;
}

export interface EventRecord {
  id: string;
  userId?: string;
  type: 'impression' | 'click' | 'save' | 'swap';
  productId?: string;
  lookId?: string;
  brandId?: string;
  at: string;
}
