/**
 * Raw brand items -> our Product shape, by rules over the title, type, tags, categories and the
 * description's labelled lines ("Fabric: ...", "Colour: ...", piece lists). Anything that is not
 * women's clothing or a women's accessory is dropped, and so is anything whose colour cannot be read:
 * a wrong colour would mislead the composer, so we never guess one.
 */
import { PALETTE } from '../data/palette.js';
import { bottomModesty, modestyScore } from '../services/modesty.js';
import type { Length, Neckline, Occasion, Product, Sleeve, Slot } from '../types.js';
import { paletteColors } from './colors.js';
import type { BrandSource, RawItem } from './sources.js';

export type DropReason = 'not-women' | 'not-clothing' | 'no-colour' | 'no-price' | 'no-image';
export type Normalized = { ok: true; product: Product } | { ok: false; reason: DropReason };

const has = (re: RegExp, ...texts: string[]) => texts.some((t) => re.test(t));

const WOMEN = /\b(wom[ae]n'?s?|ladies|female|girls?'? ?(?:kurta|suit))\b/i;
const MEN = /\b(m[ae]n'?s?|menswear|male|gents?|boys?|kids?|girls?|baby|infants?|junior|teens?|toddler|unisex kids)\b/i;
const NOT_CLOTHING = /fragrance|perfume|parfum|body ?mist|attar|cologne|deodorant|cosmetic|make-?up|lipstick|nail|skin ?care|lotion|candle|bed ?sheet|duvet|quilt|comforter|pillow|cushion|towel|curtain|table ?(?:cover|runner|mat)|napkin|home|gift ?card|face ?mask|socks?\b|underwear|lingerie|\bbra\b|panty|nightwear|sleepwear|night ?suit|pyjama|pajama|loungewear|swim|keychain|charm|hair ?(?:clip|band|tie)|scrunchie|sunglass|watch|belt\b|cap\b|hat\b|gloves?|mittens?|umbrella|fabric glossary|sample/i;
const OUTERWEAR = /\b(jacket|coat|cardigan|sweater|jumper|hoodie|sweat ?shirt|blazer|waistcoat|gilet|puffer|pullover|shrug|poncho|cape)\b/i;

const JEWELRY = /\b(earrings?|jhumk[ae]y?s?|jhumka|necklaces?|bangles?|bracelets?|rings?|tikka|anklets?|chokers?|pendants?|jewell?ery|jewelry)\b/i;
const BAG = /\b(bags?|clutch(?:es)?|totes?|potli|purses?|wallets?|backpacks?|cross ?body|pouch(?:es)?|handbags?|satchel)\b/i;
const SHOE = /\b(shoes?|khussa[sy]?|khussay|heels?|sandals?|slippers?|chappals?|kolhapuri|sneakers?|trainers?|pumps?|loafers?|mules?|flats?|wedges?|boots?|peshawari|slides?|footwear|ballerinas?|stilettos?)\b/i;
const DRAPE = /\b(dupatta|shawl|stole|scarf|scarves|hijab|wrap|chaddar|chadar)\b/i;
const BOTTOM = /\b(trousers?|pants?|shalwar|salwar|palazzo|culottes?|cigarette|jeans|tights|leggings?|jeggings|skirt|capri|bottoms?|sharara|gharara|churidar|joggers?)\b/i;
const SET = /\b([23]|two|three)[- ]?(?:pc|pcs|piece|pieces)\b|\bsuit\b|\bco-?ord\b|\bset\b/i;

/** Lines like "Dupatta: Chiffon 2.5m" or "Trouser" heading a piece list. */
const pieceLine = (word: RegExp, text: string) => new RegExp(`(^|\\n)\\s*(?:dyed |printed |embroidered |plain )?${word.source}\\b`, 'i').test(text) || new RegExp(`${word.source}\\s*[:–-]`, 'i').test(text);

function fabricOf(...texts: string[]): string {
  const t = texts.join(' \n ').toLowerCase();
  const labelled = t.match(/fabric\s*[:-]\s*([^\n,]+)/)?.[1] ?? '';
  const order: Array<[RegExp, string]> = [
    [/velvet/, 'velvet'],
    [/organza|\bnet\b|tissue|bemberg/, 'organza'],
    [/chiffon|georgette/, 'chiffon'],
    [/silk|jamawar|jacquard|satin|charmeuse|\bgrip\b|raw silk|banarsi/, 'silk'],
    [/khaddar|khadar|karandi|marina|slub|wool|pashmina|cashmere|corduroy/, 'khaddar'],
    [/linen/, 'linen'],
    [/lawn|voile/, 'lawn'],
    [/cotton|cambric|poplin|denim|jersey|twill|viscose|rayon/, 'cotton'],
  ];
  for (const source of [labelled, t]) {
    for (const [re, name] of order) if (re.test(source)) return name;
  }
  return 'cotton';
}

function embellishmentOf(t: string): 0 | 1 | 2 | 3 {
  if (/heavily|sequin|zardozi|mirror work|bridal|luxury|formal|hand ?work|hand-?embellished|dabka|kora|resham ?work|swarovski|pearls?|zari work/i.test(t)) return 3;
  // Plain "zari" usually names a woven metallic fabric (zari lawn), not embroidery.
  if (/embroider|tilla|gota|schiffli|cut ?work|chikan|appliqu|lace|embellish/i.test(t)) return 2;
  if (/print|jacquard|digital|block|self/i.test(t)) return 1;
  return 0;
}

const CASUAL: Occasion[] = ['casual', 'university', 'office'];
const FORMAL: Occasion[] = ['eid', 'mehndi', 'baraat', 'walima', 'party'];
function occasionsOf(t: string, emb: number): Occasion[] {
  if (emb >= 3 || /formal|luxury|festive|bridal|wedding|shadi|party wear/i.test(t)) return [...FORMAL];
  const out = new Set<Occasion>(emb >= 2 ? ['eid', 'party', 'mehndi', 'office'] : CASUAL);
  if (/\beid\b/i.test(t)) out.add('eid');
  if (/office|work ?wear|formal ?casual/i.test(t)) out.add('office');
  return [...out];
}

function seasonsOf(fabric: string, t: string): Product['seasons'] {
  if (/winter|khaddar|karandi|velvet|wool|shawl/i.test(t) || ['khaddar', 'velvet'].includes(fabric)) return ['winter'];
  if (/summer|lawn|voile/i.test(t) || fabric === 'lawn') return ['summer'];
  return ['all'];
}

/** Product codes like "SS23BSP226F" make poor titles; describe the piece instead. */
function displayTitle(raw: string, color: string, fabric: string, kind: string): string {
  const t = raw.trim();
  const codeLike = !/\s/.test(t) && /\d/.test(t) && t.length >= 6;
  if (t && !codeLike) return t;
  return `${color} ${fabric} ${kind}`.replace(/\s+/g, ' ').trim();
}

export function normalize(raw: RawItem, src: BrandSource, checkedAt: string): Normalized {
  const meta = [raw.productType, ...raw.tags, ...raw.categories].join(' | ');
  const all = `${raw.title} | ${meta} | ${raw.text}`;
  const head = `${raw.title} | ${meta}`; // title + catalog labels: more reliable than marketing copy

  if (has(NOT_CLOTHING, head)) return { ok: false, reason: 'not-clothing' };
  if (!has(WOMEN, head) && has(MEN, head)) return { ok: false, reason: 'not-women' };
  if (has(MEN, meta) && !has(WOMEN, meta)) return { ok: false, reason: 'not-women' };

  // Slot: accessories first (their titles are unambiguous), then sets before single pieces.
  let slot: Slot;
  if (has(JEWELRY, head)) slot = 'jewelry';
  else if (has(SHOE, head)) slot = 'footwear';
  else if (has(BAG, head)) slot = 'bag';
  else if (has(SET, raw.title) || has(/unstitched|stitched|kurta|kameez|kurti|shirt|dress|frock|maxi|angrakha|tunic|top|blouse|tee\b|t-shirt|suit|peshwas|gown|lehenga|anarkali/i, raw.title)) slot = 'main';
  else if (has(DRAPE, head)) slot = 'dupatta';
  else if (has(BOTTOM, head)) slot = 'bottom';
  else if (has(/unstitched|ready to wear|pret|eastern|kurta|kameez|suit|lawn|khaddar/i, meta)) slot = 'main';
  else return { ok: false, reason: 'not-clothing' };
  if (slot === 'main' && has(OUTERWEAR, raw.title)) return { ok: false, reason: 'not-clothing' };

  // Colour: the brand's colour option, then "Colour:" lines, then the title, tags and URL.
  const optionColors = Object.entries(raw.options).filter(([k]) => /colou?r|shade/i.test(k)).flatMap(([, v]) => v);
  const labelled = [...raw.text.matchAll(/colou?r\s*[:-]\s*([^\n]+)/gi)].map((m) => m[1]);
  let colors: string[] = [];
  for (const source of [optionColors.join(' '), labelled.join(' '), raw.title, raw.tags.join(' '), raw.url.split('/').pop() ?? '']) {
    colors = paletteColors(source);
    if (colors.length) break;
  }
  if (!colors.length) return { ok: false, reason: 'no-colour' };
  colors = colors.slice(0, 2);

  const prices = raw.variants.map((v) => v.price).filter((n) => n > 0);
  const live = raw.variants.filter((v) => v.available && v.price > 0);
  const price = Math.min(...(live.length ? live.map((v) => v.price) : prices));
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'no-price' };
  if (!raw.images.length) return { ok: false, reason: 'no-image' };

  const fabric = fabricOf(raw.title, raw.text, meta);
  const embellishment = embellishmentOf(all);
  const sizes = live.map((v) => v.title).filter((t) => t && !/default/i.test(t));

  const base = {
    id: `${src.id}:${raw.sourceId}`,
    brandId: src.id,
    brandName: src.name,
    tier: src.tier,
    slot,
    price,
    colors,
    hex: PALETTE[colors[0]].hex,
    fabric,
    sheer: /sheer|see[- ]through/i.test(all),
    embellishment,
    occasions: occasionsOf(all, embellishment),
    seasons: seasonsOf(fabric, all),
    includesDupatta: false,
    includesBottom: false,
    stitched: true,
    sizes,
    inStock: live.length > 0,
    url: raw.url,
    images: raw.images.slice(0, 6),
    checkedAt,
    demo: false,
  };

  if (slot === 'main') {
    const set = has(SET, raw.title, raw.productType) || /unstitched\s*[23]-?\s*piece/i.test(raw.text);
    const includesDupatta = (set || has(/unstitched/i, head)) && (pieceLine(/dupatta|stole/, raw.text) || /dupatta/i.test(raw.title) || /3[- ]?(?:pc|piece)/i.test(raw.title));
    const includesBottom = has(/co-?ord|maxi|dress|gown|jumpsuit|lehenga|peshwas/i, raw.title) ||
      ((set || has(/unstitched/i, head)) && (pieceLine(/trousers?|shalwar|salwar|pants|bottom|culottes?|palazzo|sharara|gharara/, raw.text) || /trouser|shalwar|[23][- ]?(?:pc|piece)/i.test(raw.title) && !/1[- ]?(?:pc|piece)/i.test(raw.title)));
    const t = `${raw.title} ${meta}`;
    const silhouette = /angrakha/i.test(t) ? 'angrakha'
      : /maxi|anarkali|frock|gown|peshwas|lehenga/i.test(t) ? 'maxi'
      : /a-?line|flared/i.test(t) ? 'a-line'
      : /co-?ord|shirt\s*(?:&|and)\s*(?:trouser|pants)/i.test(t) ? 'shirt-trouser'
      : /\b(dress|jumpsuit)\b/i.test(raw.title) && !/kurta|kameez/i.test(t) ? 'western'
      : /\b(t-?shirt|tee|tank|crop|blouse|top)\b/i.test(raw.title) ? 'western'
      : /tunic|peplum|kaftan/i.test(t) ? 'fusion'
      : 'straight';
    const western = silhouette === 'western';
    const sleeve: Sleeve = /sleeveless/i.test(all) ? 'sleeveless'
      : /short sleeve|half sleeve|cap sleeve|puff sleeve|\bt-?shirt\b|\btee\b/i.test(all) ? 'short'
      : /3\/4|three[- ]quarter|elbow/i.test(all) ? 'three-quarter' : 'full';
    const length: Length = /\b(crop|short (?:kurta|kurti|shirt)|mini)\b/i.test(all) || /\b(top|t-?shirt|tee|blouse|tank)\b/i.test(raw.title) ? 'short'
      : western ? (/\bmidi\b/i.test(all) ? 'midi' : /\bmaxi|long dress|floor/i.test(all) ? 'full' : 'knee')
      : 'full';
    const neckline: Neckline = /v-?neck|deep neck|off[- ]shoulder|halter|boat neck|sweetheart|square neck/i.test(all) ? 'open'
      : /high neck|band collar|mandarin|turtle|polo collar/i.test(all) ? 'high' : 'regular';
    const kind = includesDupatta && includesBottom ? '3-piece' : includesBottom || includesDupatta ? '2-piece' : silhouette === 'western' ? 'top' : 'kurta';
    const product: Product = {
      ...base,
      title: displayTitle(raw.title, colors[0], fabric, kind),
      silhouette,
      sleeve,
      length,
      neckline,
      modesty: modestyScore({ sleeve, length, neckline, sheer: base.sheer }),
      includesDupatta,
      includesBottom,
      stitched: !/unstitched/i.test(all),
    };
    return { ok: true, product };
  }

  if (slot === 'bottom') {
    const length: Length = /\bshorts?\b|mini skirt/i.test(raw.title) ? 'short' : /capri|culotte|cropped|ankle length|3\/4/i.test(all) ? 'midi' : /skirt/i.test(raw.title) ? 'knee' : 'full';
    return { ok: true, product: { ...base, title: displayTitle(raw.title, colors[0], fabric, 'trouser'), silhouette: 'bottom', length, modesty: bottomModesty(length) } };
  }

  const kindOf = (pairs: Array<[RegExp, string]>, fallback: string) => pairs.find(([re]) => re.test(raw.title) || re.test(meta))?.[1] ?? fallback;
  const silhouette =
    slot === 'dupatta' ? kindOf([[/hijab|scarf|scarves|stole/i, 'scarf'], [/shawl|wrap|chaddar|chadar/i, 'shawl']], 'dupatta')
    : slot === 'footwear' ? kindOf([[/khussa|kolhapuri|peshawari/i, 'khussa'], [/heel|pump|stiletto|wedge/i, 'heel'], [/sneaker|trainer/i, 'sneaker'], [/sandal|slide|chappal|slipper|mule/i, 'sandal']], 'flat')
    : slot === 'bag' ? kindOf([[/clutch/i, 'clutch'], [/tote/i, 'tote'], [/potli/i, 'potli']], 'shoulder bag')
    : kindOf([[/jhumk/i, 'jhumkay'], [/necklace|choker|pendant|\bset\b/i, 'necklace set'], [/tikka/i, 'maang tikka'], [/bangle|bracelet|kara|cuff/i, 'bangles']], 'earrings');
  // Accessories go with any season; formal ones (embellished, khussa, heels, clutch, potli) dress up.
  const dressy = embellishment >= 2 || ['khussa', 'heel', 'clutch', 'potli', 'jhumkay', 'necklace set', 'maang tikka'].includes(silhouette);
  const occasions: Occasion[] = slot === 'dupatta' ? base.occasions : dressy ? [...FORMAL, 'office'] : [...CASUAL, 'eid'];
  return {
    ok: true,
    product: {
      ...base,
      title: displayTitle(raw.title, colors[0], fabric, silhouette),
      silhouette,
      occasions,
      seasons: slot === 'dupatta' ? base.seasons : ['all'],
      modesty: 5,
    },
  };
}
