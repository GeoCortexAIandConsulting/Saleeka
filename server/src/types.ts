// Core domain types shared across the API.

export type Gender = 'female' | 'male';

/**
 * Women's looks use main, bottom, dupatta, footwear, bag and jewelry; men's use main, bottom, waistcoat,
 * footwear and accessory. In the Studio both can add a layer (coat, jacket, sweater, cardigan), and
 * women an accessory (watch, sunglasses, belt).
 */
export type Slot = 'main' | 'bottom' | 'dupatta' | 'footwear' | 'bag' | 'jewelry' | 'waistcoat' | 'accessory' | 'layer';
/** The slots of a women's look (the stylist, the ranking rounds and saved looks use only these). */
export const SLOTS: Slot[] = ['main', 'bottom', 'dupatta', 'footwear', 'bag', 'jewelry'];
/** The slots of a women's look in the Studio, in the order they are chosen. */
export const WOMEN_GAME_SLOTS: Slot[] = ['main', 'bottom', 'dupatta', 'layer', 'footwear', 'bag', 'jewelry', 'accessory'];
/** The slots of a men's look in the Studio. */
export const MEN_SLOTS: Slot[] = ['main', 'bottom', 'waistcoat', 'layer', 'footwear', 'accessory'];
export const ALL_SLOTS: Slot[] = [...SLOTS, 'waistcoat', 'accessory', 'layer'];
/** Slots that take more than one piece in a Studio look (earrings + rings + a bracelet; a watch + belt + cufflinks), and how many. */
export const MULTI_SLOTS: Partial<Record<Slot, number>> = { jewelry: 3, accessory: 3 };
/** How many pieces a Studio look may have in a slot. */
export const maxPieces = (slot: Slot) => MULTI_SLOTS[slot] ?? 1;
/** A Studio look's slots, by gender. */
export const slotsFor = (g: Gender | undefined): Slot[] => (g === 'male' ? MEN_SLOTS : WOMEN_GAME_SLOTS);

export type Season = 'summer' | 'winter';

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
  /** Who it is for; absent means women's (every product imported before menswear) */
  gender?: Gender;
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
  /** When the piece arrived: the brand's own date for it, or the night our sync first saw it ("New in") */
  arrivedAt?: string;
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
  /** When the player clicked the link in the verification email (needed before the first AI preview) */
  emailVerifiedAt?: string;
  /** SHA-256 of the latest verification link's token (the token itself is only in the email) */
  verifyTokenHash?: string;
  verifySentAt?: string;
  /** SHA-256 of the password-reset link's token, and when that link stops working */
  resetTokenHash?: string;
  resetExpiresAt?: string;
  /** AI previews earned on top of the free ones (a published look reaching enough likes) */
  previewCredits?: number;
  /** Unique, lower-case name shown on the Runway (older accounts pick one when they next sign in) */
  username?: string;
  /** The player whose share link brought this player in */
  referredBy?: string;
  /** Set once this player's first published look has been counted for whoever invited them */
  referralCounted?: boolean;
  /** Friends who joined from this player's link and published a look */
  referrals?: number;
  /** Previews earned from those friends (capped) */
  referralCredits?: number;
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

/**
 * A design challenge in the dress-up game. Seeded challenges ship with the app; the stylist adds
 * challenges from what shoppers ask for, stored only as structured fields (never the message or who
 * asked), and shown once enough shoppers have asked for something similar.
 */
export interface Challenge {
  id: string;
  /** Same request, same key: occasion | colours | coverage | dupatta (no budget: the game has none) */
  key: string;
  occasion: Occasion;
  colors: string[];
  /** 1 (relaxed) to 5 (fully covered), like the quiz */
  coverage: number;
  wantsDupatta: boolean;
  /** Women's or men's look; absent means women's */
  gender?: Gender;
  /** A seasonal brief: only pieces for that season (or any season) can be chosen */
  season?: Season;
  /** A player's own brief: only these price tiers (absent = any) */
  tiers?: Tier[];
  /** A player's own brief: only these brands, where they have pieces for the slot (absent = every brand) */
  brandIds?: string[];
  /** A player's own brief: the outfit costs at most this (PKR) */
  maxPrice?: number;
  /** seed: ships with the app; search: from stylist searches; custom: a player's own brief (never listed) */
  source: 'seed' | 'search' | 'custom';
  /** How many stylist searches asked for this */
  asks: number;
  createdAt: string;
}

/** A look a player put together for a challenge. */
export interface Design {
  id: string;
  userId: string;
  challengeId: string;
  brandIds: string[];
  items: LookItem[];
  /** PKR total of the pieces: no limit in the game, kept so looks can be matched to a shopper's budget */
  total: number;
  up: number;
  down: number;
  createdAt: string;
  /** A draft is private to its designer until they publish it. Absent = published. */
  status?: 'draft' | 'published';
  /** This look has already earned its designer a preview credit */
  creditEarned?: boolean;
  /** The AI image of the look on a model, if the designer previewed it */
  previewId?: string;
}

/** Something that happened to a player's look or comment: a like, a comment, or a reply. */
export interface AppNotification {
  id: string;
  /** Who it is for */
  userId: string;
  type: 'like' | 'comment' | 'reply' | 'friend';
  /** Who did it */
  actorId: string;
  designId: string;
  commentId?: string;
  /** The start of the comment, for comments and replies */
  text?: string;
  at: string;
  read: boolean;
}

/** An AI-made image of a look on a model (or the fixed base model photo it is made from). */
/**
 * How many AI previews an email address has used, kept when the account is deleted (only a hash of the
 * address, never the address), so deleting and signing up again does not reset the free previews.
 */
export interface PreviewUsage {
  /** sha256 of the lower-cased email */
  id: string;
  used: number;
  updatedAt: string;
}

export interface PreviewImage {
  id: string;
  /** Absent on the shared base model photos */
  userId?: string;
  /** Same player + same pieces = same key, so a look is never generated twice */
  key: string;
  /** Which of our models wears the look (see services/preview.ts) */
  variant?: number;
  /** The body size the model was shown at (small, medium, large, plus) */
  size?: string;
  mime: string;
  /** base64 */
  data: string;
  at: string;
}

/** A comment on a published look in the My taste feed. */
export interface DesignComment {
  id: string;
  designId: string;
  userId: string;
  text: string;
  at: string;
  /** Set on a reply: the top-level comment it answers (threads are one level deep) */
  parentId?: string;
}

/** One player's 👍/👎 on a design (their own included); id is `${designId}:${userId}`. */
export interface DesignVote {
  id: string;
  designId: string;
  userId: string;
  up: boolean;
  at: string;
}

export interface EventRecord {
  id: string;
  userId?: string;
  type: 'impression' | 'click' | 'save' | 'swap' | 'preview';
  productId?: string;
  lookId?: string;
  brandId?: string;
  at: string;
}

/** Written by each catalog import; the API reloads its in-memory catalogue when `version` changes. */
export interface CatalogMeta {
  id: 'catalog';
  version: string;
  syncedAt: string;
  products: number;
  inStock: number;
}
