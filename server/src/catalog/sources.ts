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
}

export type Platform = 'shopify' | 'sapphire' | 'bareeze';

export interface BrandSource {
  /** Same id as in data/knownBrands.ts, so quiz brand preferences apply */
  id: string;
  name: string;
  origin: string;
  platform: Platform;
  tier: Tier;
}

/**
 * Women's brands and where their official catalogs are read from. Khaadi is left out on purpose:
 * its product listings load from /on/demandware.store/, which its robots.txt disallows, and its
 * sitemap lists no product pages.
 */
export const BRAND_SOURCES: BrandSource[] = [
  { id: 'maria-b', name: 'Maria B', origin: 'https://www.mariab.pk', platform: 'shopify', tier: 'premium' },
  { id: 'gul-ahmed', name: 'Gul Ahmed', origin: 'https://www.gulahmedshop.com', platform: 'shopify', tier: 'mid' },
  { id: 'alkaram-studio', name: 'Alkaram Studio', origin: 'https://www.alkaramstudio.com', platform: 'shopify', tier: 'mid' },
  { id: 'sana-safinaz', name: 'Sana Safinaz', origin: 'https://www.sanasafinaz.com', platform: 'shopify', tier: 'premium' },
  { id: 'outfitters', name: 'Outfitters', origin: 'https://outfitters.com.pk', platform: 'shopify', tier: 'mid' },
  { id: 'ethnic', name: 'Ethnic (by Outfitters)', origin: 'https://pk.ethnc.com', platform: 'shopify', tier: 'mid' },
  { id: 'limelight', name: 'Limelight', origin: 'https://www.limelight.pk', platform: 'shopify', tier: 'budget' },
  { id: 'beechtree', name: 'Beechtree', origin: 'https://beechtree.pk', platform: 'shopify', tier: 'mid' },
  { id: 'junaid-jamshed', name: 'J. (Junaid Jamshed)', origin: 'https://www.junaidjamshed.com', platform: 'shopify', tier: 'mid' },
  { id: 'nishat-linen', name: 'Nishat Linen', origin: 'https://nishatlinen.com', platform: 'shopify', tier: 'mid' },
  { id: 'asim-jofa', name: 'Asim Jofa', origin: 'https://www.asimjofa.com', platform: 'shopify', tier: 'premium' },
  { id: 'generation', name: 'Generation', origin: 'https://generation.com.pk', platform: 'shopify', tier: 'mid' },
  { id: 'sapphire', name: 'Sapphire', origin: 'https://pk.sapphireonline.pk', platform: 'sapphire', tier: 'mid' },
  { id: 'bareeze', name: 'Bareeze', origin: 'https://www.bareeze.com', platform: 'bareeze', tier: 'premium' },
];
