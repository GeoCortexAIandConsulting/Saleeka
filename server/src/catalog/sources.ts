import type { Tier } from '../types.js';

/** One raw product as fetched from a brand's official site, before tagging. */
export interface RawItem {
  brandId: string;
  /** The brand's own product id */
  sourceId: string;
  /** Official product page */
  url: string;
  title: string;
  productType: string;
  tags: string[];
  /** Category / collection names or URL path hints */
  categories: string[];
  /** Plain-text description */
  text: string;
  /** Option name -> values, e.g. Size -> [S, M, L], Color -> [Black] */
  options: Record<string, string[]>;
  variants: Array<{ title: string; price: number; compareAt?: number; available: boolean }>;
  images: string[];
  publishedAt?: string;
  /**
   * When the brand created the product. Steadier than publishedAt, which some shops bump whenever
   * they re-list old stock, so it is the one used for "New in".
   */
  createdAt?: string;
}

export type Platform = 'shopify' | 'sapphire' | 'bareeze';

export interface BrandSource {
  /** Same id as in data/knownBrands.ts, so quiz brand preferences apply */
  id: string;
  name: string;
  origin: string;
  platform: Platform;
  tier: Tier;
  /**
   * Who the brand dresses: 'female' (the default) and 'male' brands set the gender of unlabelled
   * items; for 'both', each item must say whether it is men's or women's.
   */
  sells?: 'female' | 'male' | 'both';
}

/**
 * Brands and where their official catalogs are read from. Khaadi is left out on purpose:
 * its product listings load from /on/demandware.store/, which its robots.txt disallows, and its
 * sitemap lists no product pages.
 */
export const BRAND_SOURCES: BrandSource[] = [
  { id: 'maria-b', name: 'Maria B', origin: 'https://www.mariab.pk', platform: 'shopify', tier: 'premium' },
  { id: 'gul-ahmed', name: 'Gul Ahmed', origin: 'https://www.gulahmedshop.com', platform: 'shopify', tier: 'mid' },
  { id: 'alkaram-studio', name: 'Alkaram Studio', origin: 'https://www.alkaramstudio.com', platform: 'shopify', tier: 'mid' },
  { id: 'sana-safinaz', name: 'Sana Safinaz', origin: 'https://www.sanasafinaz.com', platform: 'shopify', tier: 'premium' },
  { id: 'outfitters', name: 'Outfitters', origin: 'https://outfitters.com.pk', platform: 'shopify', tier: 'mid', sells: 'both' },
  { id: 'ethnic', name: 'Ethnic (by Outfitters)', origin: 'https://pk.ethnc.com', platform: 'shopify', tier: 'mid' },
  { id: 'limelight', name: 'Limelight', origin: 'https://www.limelight.pk', platform: 'shopify', tier: 'budget' },
  { id: 'beechtree', name: 'Beechtree', origin: 'https://beechtree.pk', platform: 'shopify', tier: 'mid' },
  { id: 'junaid-jamshed', name: 'J. (Junaid Jamshed)', origin: 'https://www.junaidjamshed.com', platform: 'shopify', tier: 'mid', sells: 'both' },
  { id: 'nishat-linen', name: 'Nishat Linen', origin: 'https://nishatlinen.com', platform: 'shopify', tier: 'mid' },
  { id: 'asim-jofa', name: 'Asim Jofa', origin: 'https://www.asimjofa.com', platform: 'shopify', tier: 'premium' },
  { id: 'generation', name: 'Generation', origin: 'https://generation.com.pk', platform: 'shopify', tier: 'mid' },
  // Zeen is Cambridge's women's label.
  { id: 'zeen', name: 'Zeen', origin: 'https://zeenwoman.com', platform: 'shopify', tier: 'mid' },
  { id: 'sapphire', name: 'Sapphire', origin: 'https://pk.sapphireonline.pk', platform: 'sapphire', tier: 'mid' },
  { id: 'bareeze', name: 'Bareeze', origin: 'https://www.bareeze.com', platform: 'bareeze', tier: 'premium' },
  // Men's wear. Brands that sell only menswear say so with `sells: 'male'`; mixed brands (J., Edenrobe,
  // Bonanza Satrangi, Outfitters) label each product, and an item with no men's or women's word is dropped.
  { id: 'diners', name: 'Diners', origin: 'https://diners.com.pk', platform: 'shopify', tier: 'mid', sells: 'male' },
  { id: 'edenrobe', name: 'Edenrobe', origin: 'https://edenrobe.com', platform: 'shopify', tier: 'mid', sells: 'both' },
  { id: 'bonanza-satrangi', name: 'Bonanza Satrangi', origin: 'https://bonanzasatrangi.com', platform: 'shopify', tier: 'mid', sells: 'both' },
  { id: 'amir-adnan', name: 'Amir Adnan', origin: 'https://www.amiradnan.com', platform: 'shopify', tier: 'premium', sells: 'male' },
  { id: 'charcoal', name: 'Charcoal', origin: 'https://charcoal.com.pk', platform: 'shopify', tier: 'mid', sells: 'male' },
  // Breakout tags each product MEN, WOMEN or kids (kids' items are dropped). Its www site is a separate
  // storefront; the product feed is on the bare domain, and product links redirect to www.
  { id: 'breakout', name: 'Breakout', origin: 'https://breakout.com.pk', platform: 'shopify', tier: 'budget', sells: 'both' },
  // Shoes and bags first. Stylo: women's shoes, clutches, shawls, sweaters and some suits (its kids'
  // shoes and lingerie are dropped). Almas: women's and men's shoes, bags, belts, coats and co-ords,
  // each labelled "Women ..." or "Men ..." in its product type.
  { id: 'stylo', name: 'Stylo', origin: 'https://stylo.pk', platform: 'shopify', tier: 'budget' },
  { id: 'almas', name: 'Almas', origin: 'https://almas.pk', platform: 'shopify', tier: 'mid', sells: 'both' },
];
