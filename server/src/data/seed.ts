/**
 * Demo catalog. Every brand and product here is FICTIONAL placeholder data used to
 * develop and test the product. Real catalogs come from partner feeds (see the plan).
 */
import type { Brand, Length, Neckline, Occasion, Product, Sleeve, Slot, Tier } from '../types.js';
import { PALETTE } from './palette.js';
import { bottomModesty, modestyScore } from '../services/modesty.js';

export const DEMO_BRANDS: Brand[] = [
  { id: 'b_basics', name: 'Demo Basics', tier: 'budget' },
  { id: 'b_street', name: 'Demo Street', tier: 'budget' },
  { id: 'b_lawn', name: 'Demo Lawn House', tier: 'mid' },
  { id: 'b_loom', name: 'Demo Loom', tier: 'mid' },
  { id: 'b_studio', name: 'Demo Studio', tier: 'premium' },
  { id: 'b_heritage', name: 'Demo Heritage', tier: 'premium' },
  { id: 'b_soles', name: 'Demo Soles', tier: 'mid' },
  { id: 'b_carry', name: 'Demo Carry', tier: 'mid' },
  { id: 'b_jewels', name: 'Demo Jewels', tier: 'mid' },
];

// Small deterministic PRNG so the demo catalog is identical on every run.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rand = mulberry32(20261101);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const round100 = (n: number) => Math.round(n / 100) * 100;

const CLOTHING_BRANDS = DEMO_BRANDS.filter((b) => !['b_soles', 'b_carry', 'b_jewels'].includes(b.id));
const PRICE_RANGE: Record<Tier, [number, number]> = {
  budget: [2500, 7500],
  mid: [6500, 16000],
  premium: [15000, 42000],
};

const ALL_COLORS = Object.keys(PALETTE);
const MAIN_COLORS = ALL_COLORS.filter((c) => !['gold', 'silver'].includes(c));
const NEUTRAL_ACCESSORY = ['black', 'beige', 'ivory', 'gold', 'silver', 'brown', 'white'];

let counter = 0;
const nextId = (slot: Slot) => `p_${slot}_${String(++counter).padStart(3, '0')}`;

function occasionsFor(embellishment: number, casualOk: boolean): Occasion[] {
  if (embellishment === 0) return casualOk ? ['casual', 'university', 'office'] : ['casual', 'university'];
  if (embellishment === 1) return ['casual', 'university', 'office', 'eid'];
  if (embellishment === 2) return ['eid', 'party', 'mehndi'];
  return ['baraat', 'walima', 'mehndi', 'party'];
}

function seasonFor(fabric: string): Product['seasons'] {
  if (['lawn', 'cotton', 'linen'].includes(fabric)) return ['summer'];
  if (['velvet', 'khaddar'].includes(fabric)) return ['winter'];
  return ['all'];
}

function mains(): Product[] {
  const out: Product[] = [];
  for (let i = 0; i < 130; i++) {
    const brand = pick(CLOTHING_BRANDS);
    const kind = pick(['lawn3', 'kurta', 'maxi', 'angrakha', 'shirt-trouser', 'western', 'fusion', 'formal3', 'formal3']);
    const formal = kind === 'formal3' || kind === 'maxi' || chance(0.1);
    const embellishment = (kind === 'formal3' ? pick([2, 3, 3]) : formal ? pick([1, 2]) : pick([0, 0, 1])) as 0 | 1 | 2 | 3;
    const fabric = kind === 'formal3' ? pick(['chiffon', 'silk', 'organza', 'velvet']) : kind === 'western' ? pick(['linen', 'cotton', 'chiffon']) : pick(['lawn', 'cotton', 'linen', 'khaddar', 'chiffon']);
    const colorA = pick(MAIN_COLORS);
    const colors = chance(0.3) ? [colorA, pick(MAIN_COLORS)] : [colorA];

    let silhouette = 'straight';
    let sleeve: Sleeve = pick(['full', 'full', 'full', 'three-quarter', 'short']);
    let length: Length = pick(['full', 'full', 'full', 'midi', 'knee']);
    let neckline: Neckline = pick(['regular', 'regular', 'high', 'high', 'open']);
    let sheer = false;
    let includesDupatta = false;
    let includesBottom = false;
    let title = '';

    switch (kind) {
      case 'lawn3':
        silhouette = 'straight';
        includesDupatta = true;
        includesBottom = true;
        title = `${colors[0]} printed lawn 3-piece`;
        break;
      case 'kurta':
        silhouette = pick(['straight', 'a-line']);
        title = `${colors[0]} ${silhouette} kurta`;
        break;
      case 'maxi':
        silhouette = 'maxi';
        length = 'full';
        sleeve = pick(['full', 'three-quarter', 'short', 'sleeveless']);
        includesBottom = true;
        title = `${colors[0]} maxi dress`;
        break;
      case 'angrakha':
        silhouette = 'angrakha';
        title = `${colors[0]} angrakha`;
        break;
      case 'shirt-trouser':
        silhouette = 'shirt-trouser';
        includesBottom = chance(0.5);
        title = `${colors[0]} shirt${includesBottom ? ' and trouser set' : ''}`;
        break;
      case 'western':
        silhouette = 'western';
        length = pick(['knee', 'midi', 'short', 'midi']);
        sleeve = pick(['sleeveless', 'short', 'three-quarter']);
        neckline = pick(['open', 'regular']);
        includesBottom = true;
        title = `${colors[0]} ${length} dress`;
        break;
      case 'fusion':
        silhouette = 'fusion';
        title = `${colors[0]} fusion tunic`;
        break;
      default:
        silhouette = pick(['straight', 'a-line', 'angrakha']);
        includesDupatta = chance(0.7);
        includesBottom = true;
        sheer = chance(0.25);
        title = `${colors[0]} ${fabric} embellished ${includesDupatta ? '3-piece' : '2-piece'}`;
    }

    const [lo, hi] = PRICE_RANGE[brand.tier];
    const price = round100(lo + rand() * (hi - lo) + embellishment * (hi - lo) * 0.1);
    out.push({
      id: nextId('main'),
      brandId: brand.id,
      brandName: brand.name,
      tier: brand.tier,
      title,
      slot: 'main',
      price,
      colors,
      hex: PALETTE[colors[0]].hex,
      fabric,
      silhouette,
      sleeve,
      length,
      neckline,
      sheer,
      embellishment,
      modesty: modestyScore({ sleeve, length, neckline, sheer }),
      occasions: occasionsFor(embellishment, kind !== 'western'),
      seasons: seasonFor(fabric),
      includesDupatta,
      includesBottom,
      stitched: kind !== 'lawn3' || chance(0.7),
      sizes: ['S', 'M', 'L', 'XL'].filter(() => chance(0.85)),
      inStock: chance(0.93),
      url: `https://example.com/demo/${brand.id}/${counter}`,
      demo: true,
    });
  }
  return out;
}

function bottoms(): Product[] {
  const out: Product[] = [];
  for (let i = 0; i < 16; i++) {
    const brand = pick(CLOTHING_BRANDS);
    const length: Length = pick(['full', 'full', 'full', 'midi']);
    const color = pick(['black', 'ivory', 'beige', 'white', 'navy', 'grey', pick(MAIN_COLORS)]);
    const [lo, hi] = PRICE_RANGE[brand.tier];
    out.push({
      id: nextId('bottom'),
      brandId: brand.id,
      brandName: brand.name,
      tier: brand.tier,
      title: `${color} ${pick(['straight trouser', 'palazzo', 'cigarette pants', 'shalwar'])}`,
      slot: 'bottom',
      price: round100(lo * 0.5 + rand() * (hi - lo) * 0.3),
      colors: [color],
      hex: PALETTE[color].hex,
      fabric: pick(['cotton', 'linen', 'lawn', 'grip']),
      silhouette: 'bottom',
      length,
      sheer: false,
      embellishment: 0,
      modesty: bottomModesty(length),
      occasions: ['casual', 'university', 'office', 'eid', 'party', 'mehndi', 'baraat', 'walima'],
      seasons: ['all'],
      includesDupatta: false,
      includesBottom: false,
      stitched: true,
      sizes: ['S', 'M', 'L', 'XL'],
      inStock: chance(0.95),
      url: `https://example.com/demo/${brand.id}/${counter}`,
      demo: true,
    });
  }
  return out;
}

function dupattas(): Product[] {
  const out: Product[] = [];
  for (let i = 0; i < 26; i++) {
    const brand = pick(CLOTHING_BRANDS);
    const kind = pick(['dupatta', 'dupatta', 'scarf', 'shawl']);
    const embellishment = pick([0, 1, 2, 3]) as 0 | 1 | 2 | 3;
    const color = pick(MAIN_COLORS);
    const [lo, hi] = PRICE_RANGE[brand.tier];
    out.push({
      id: nextId('dupatta'),
      brandId: brand.id,
      brandName: brand.name,
      tier: brand.tier,
      title: `${color} ${kind}${embellishment >= 2 ? ' with embroidered border' : ''}`,
      slot: 'dupatta',
      price: round100(lo * 0.3 + rand() * (hi - lo) * 0.25 + embellishment * 400),
      colors: [color],
      hex: PALETTE[color].hex,
      fabric: kind === 'shawl' ? pick(['velvet', 'khaddar']) : pick(['chiffon', 'organza', 'cotton', 'silk']),
      silhouette: kind,
      sheer: false,
      embellishment,
      modesty: 5,
      occasions: occasionsFor(embellishment, true),
      seasons: kind === 'shawl' ? ['winter'] : ['all'],
      includesDupatta: false,
      includesBottom: false,
      stitched: true,
      sizes: [],
      inStock: chance(0.95),
      url: `https://example.com/demo/${brand.id}/${counter}`,
      demo: true,
    });
  }
  // Neutral scarves so hijab-wearing shoppers can be matched with almost any outfit.
  const scarfBrand = pick(CLOTHING_BRANDS);
  for (const color of ['black', 'ivory', 'beige', 'grey', 'white', 'navy']) {
    out.push({
      id: nextId('dupatta'),
      brandId: scarfBrand.id,
      brandName: scarfBrand.name,
      tier: scarfBrand.tier,
      title: `${color} everyday scarf`,
      slot: 'dupatta',
      price: round100(1200 + rand() * 2200),
      colors: [color],
      hex: PALETTE[color].hex,
      fabric: 'chiffon',
      silhouette: 'scarf',
      sheer: false,
      embellishment: 0,
      modesty: 5,
      occasions: ['casual', 'university', 'office', 'eid', 'party', 'mehndi', 'baraat', 'walima'],
      seasons: ['all'],
      includesDupatta: false,
      includesBottom: false,
      stitched: true,
      sizes: [],
      inStock: true,
      url: `https://example.com/demo/${scarfBrand.id}/${counter}`,
      demo: true,
    });
  }
  return out;
}

function accessories(): Product[] {
  const out: Product[] = [];
  const soles = DEMO_BRANDS.find((b) => b.id === 'b_soles')!;
  const carry = DEMO_BRANDS.find((b) => b.id === 'b_carry')!;
  const jewels = DEMO_BRANDS.find((b) => b.id === 'b_jewels')!;

  for (let i = 0; i < 18; i++) {
    const type = pick(['heel', 'flat', 'khussa', 'sneaker', 'sandal']);
    const color = pick([...NEUTRAL_ACCESSORY, pick(MAIN_COLORS)]);
    const formal = type === 'heel' || type === 'khussa';
    out.push({
      id: nextId('footwear'),
      brandId: soles.id,
      brandName: soles.name,
      tier: soles.tier,
      title: `${color} ${type}s`,
      slot: 'footwear',
      price: round100(3000 + rand() * 7000),
      colors: [color],
      hex: PALETTE[color].hex,
      fabric: 'leather',
      silhouette: type,
      sheer: false,
      embellishment: formal && chance(0.5) ? 2 : 0,
      modesty: 5,
      occasions: formal
        ? ['eid', 'mehndi', 'baraat', 'walima', 'party', 'office']
        : ['casual', 'university', 'office', 'eid'],
      seasons: ['all'],
      includesDupatta: false,
      includesBottom: false,
      stitched: true,
      sizes: ['36', '37', '38', '39', '40', '41'],
      inStock: chance(0.95),
      url: `https://example.com/demo/${soles.id}/${counter}`,
      demo: true,
    });
  }
  for (let i = 0; i < 10; i++) {
    const type = pick(['clutch', 'tote', 'potli', 'shoulder bag']);
    const color = pick(NEUTRAL_ACCESSORY);
    const formal = type === 'clutch' || type === 'potli';
    out.push({
      id: nextId('bag'),
      brandId: carry.id,
      brandName: carry.name,
      tier: carry.tier,
      title: `${color} ${type}`,
      slot: 'bag',
      price: round100(2500 + rand() * 6500),
      colors: [color],
      hex: PALETTE[color].hex,
      fabric: 'leather',
      silhouette: type,
      sheer: false,
      embellishment: formal ? 2 : 0,
      modesty: 5,
      occasions: formal
        ? ['eid', 'mehndi', 'baraat', 'walima', 'party']
        : ['casual', 'university', 'office', 'eid'],
      seasons: ['all'],
      includesDupatta: false,
      includesBottom: false,
      stitched: true,
      sizes: [],
      inStock: true,
      url: `https://example.com/demo/${carry.id}/${counter}`,
      demo: true,
    });
  }
  for (let i = 0; i < 12; i++) {
    const type = pick(['jhumkay', 'earrings', 'necklace set', 'maang tikka', 'bangles']);
    const color = pick(['gold', 'gold', 'silver']);
    const heavy = type === 'necklace set' || type === 'maang tikka' || type === 'jhumkay';
    out.push({
      id: nextId('jewelry'),
      brandId: jewels.id,
      brandName: jewels.name,
      tier: jewels.tier,
      title: `${color} ${type}`,
      slot: 'jewelry',
      price: round100(1500 + rand() * 8000),
      colors: [color],
      hex: PALETTE[color].hex,
      fabric: 'alloy',
      silhouette: type,
      sheer: false,
      embellishment: heavy ? 3 : 1,
      modesty: 5,
      occasions: heavy
        ? ['eid', 'mehndi', 'baraat', 'walima', 'party']
        : ['casual', 'university', 'office', 'eid', 'party'],
      seasons: ['all'],
      includesDupatta: false,
      includesBottom: false,
      stitched: true,
      sizes: [],
      inStock: true,
      url: `https://example.com/demo/${jewels.id}/${counter}`,
      demo: true,
    });
  }
  return out;
}

export function buildDemoCatalog(): Product[] {
  counter = 0;
  rand = mulberry32(20261101); // same catalog on every run
  return [...mains(), ...bottoms(), ...dupattas(), ...accessories()];
}
