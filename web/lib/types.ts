export type Slot = 'main' | 'bottom' | 'dupatta' | 'footwear' | 'bag' | 'jewelry';

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
  /** When stock and price were last read from the brand's site */
  checkedAt?: string;
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
}

export interface Me {
  user: { id: string; email: string; name: string; photoVersion?: string | null; avatarVersion?: string | null };
  hasProfile: boolean;
  roundsDone: number;
  maxRounds: number;
}
