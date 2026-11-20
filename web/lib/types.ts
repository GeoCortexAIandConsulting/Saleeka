export type Gender = 'female' | 'male';
/**
 * Women's Studio looks: main, bottom, dupatta, layer, footwear, bag, jewelry. Men's: main, bottom,
 * waistcoat, layer, footwear, accessory. The layer is a coat, jacket or sweater worn over the outfit.
 */
export type Slot = 'main' | 'bottom' | 'dupatta' | 'footwear' | 'bag' | 'jewelry' | 'waistcoat' | 'accessory' | 'layer';
export const WOMEN_SLOTS: Slot[] = ['main', 'bottom', 'dupatta', 'layer', 'footwear', 'bag', 'jewelry'];
export const MEN_SLOTS: Slot[] = ['main', 'bottom', 'waistcoat', 'layer', 'footwear', 'accessory'];
export const slotsFor = (g: Gender | undefined | null): Slot[] => (g === 'male' ? MEN_SLOTS : WOMEN_SLOTS);

export interface Product {
  id: string;
  brandId: string;
  brandName: string;
  title: string;
  slot: Slot;
  price: number;
  colors: string[];
  hex: string;
  fabric: string;
  silhouette: string;
  includesDupatta: boolean;
  includesBottom: boolean;
  stitched: boolean;
  sleeve?: 'sleeveless' | 'short' | 'three-quarter' | 'full';
  length?: 'short' | 'knee' | 'midi' | 'full';
  neckline?: 'open' | 'regular' | 'high';
  sheer?: boolean;
  /** 0 = plain, 3 = heavy embellishment */
  embellishment?: 0 | 1 | 2 | 3;
  /** Product photos on the brand's own site */
  images?: string[];
  /** Sizes in stock on the brand's site */
  sizes?: string[];
  /** False once the brand's site no longer has it in stock */
  inStock?: boolean;
  /** When stock and price were last read from the brand's site */
  checkedAt?: string;
  /** When the piece arrived on the brand's site (for "New in") */
  arrivedAt?: string;
  url?: string;
  demo?: boolean;
}

export interface Look {
  id: string;
  label: string;
  occasion: string | null;
  items: Array<{ slot: Slot; product: Product }>;
  total: number;
  reason?: string;
  saved: boolean;
}

export interface QuestionOption {
  value: string;
  label: string;
  hex?: string;
  hint?: string;
  genders?: ('female' | 'male')[];
  seasons?: string[];
  exclusive?: boolean;
}

export interface Question {
  id: string;
  type: 'single' | 'multi' | 'number' | 'text';
  title: string;
  help?: string;
  options?: QuestionOption[];
  max?: number;
  optional?: boolean;
  min?: number;
  maxValue?: number;
  unit?: string;
  showIf?: { id: string; value: string };
  palettes?: Record<string, string[]>;
  /** Only asked for these genders */
  genders?: ('female' | 'male')[];
  /** Help worded for one gender, in place of `help` */
  helpFor?: Partial<Record<'female' | 'male', string>>;
}

export interface Me {
  user: { id: string; email: string; name: string; photoVersion?: string | null; avatarVersion?: string | null };
  hasProfile: boolean;
  roundsDone: number;
  maxRounds: number;
  /** From the taste quiz */
  gender: Gender | null;
}

/* ------------------------------- dress-up game ------------------------------- */

export interface Challenge {
  id: string;
  title: string;
  occasion: string;
  colors: string[];
  coverage: number;
  modest: boolean;
  wantsDupatta: boolean;
  gender: Gender;
  /** A seasonal brief (only that season's pieces), or null */
  season?: 'summer' | 'winter' | null;
  /** Made from what shoppers asked the stylist for */
  fromShoppers: boolean;
  /** This week's featured challenge */
  featured?: boolean;
  /** A real outfit photo that fits the challenge */
  cover?: string | null;
  asks: number;
  designs: number;
}

export interface Design {
  id: string;
  challenge: Challenge | null;
  items: Array<{ slot: Slot; product: Product }>;
  total: number;
  up: number;
  down: number;
  createdAt: string;
  /** The AI image of the look on a model, when the designer previewed it */
  previewUrl?: string | null;
}

/** One card in the Studio grid: a piece and its other colours */
export interface PieceGroup {
  key: string;
  variants: Product[];
}

export type PieceSort = 'best' | 'new' | 'price-asc' | 'price-desc';

/** A page of the Studio grid for one slot, with what the filters can offer */
export interface PiecesPage {
  slot: Slot;
  groups: PieceGroup[];
  total: number;
  page: number;
  pages: number;
  brands: Array<{ id: string; name: string; count: number }>;
  colors: string[];
}

/** A look on the Runway */
export interface FeedLook extends Design {
  /** The designer's first name */
  by: string;
  /** The designer, for a link to their profile */
  byId: string;
  mine: boolean;
  myVote: 'up' | 'down' | null;
  comments: number;
}

export interface LookComment {
  id: string;
  by: string;
  text: string;
  at: string;
  /** Set on a reply: the top-level comment it answers */
  parentId: string | null;
  mine: boolean;
  canDelete: boolean;
}

/** A like, comment or reply on one of the player's looks or comments */
export interface AppNotification {
  id: string;
  type: 'like' | 'comment' | 'reply';
  by: string;
  text: string | null;
  at: string;
  read: boolean;
  lookId: string;
  lookTitle: string;
  previewUrl: string | null;
}

/** A player's page */
export interface PlayerProfile {
  id: string;
  name: string;
  joined: string;
  me: boolean;
  stats: { looks: number; likes: number };
  looks: FeedLook[];
}

/** This week's featured challenges and their best looks so far */
export interface Weekly {
  endsAt: string;
  challenges: Challenge[];
  top: FeedLook[];
}

/** A piece's stock and price, asked of the brand's shop just now (GET /api/products/live). */
export interface LiveStock {
  id: string;
  /** False when the shop could not be asked */
  checked: boolean;
  inStock: boolean;
  price: number;
  checkedAt?: string;
}
