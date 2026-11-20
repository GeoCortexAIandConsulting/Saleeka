/**
 * Raw brand items -> our Product shape, by rules over the title, type, tags, categories and the
 * description's labelled lines ("Fabric: ...", "Colour: ...", piece lists). Women's and men's
 * clothing and accessories are kept (each tagged with its gender); children's wear, home goods and
 * beauty are dropped, and so is anything whose colour cannot be read: a wrong colour would mislead
 * the composer, so we never guess one.
 */
import { PALETTE } from '../data/palette.js';
import { bottomModesty, modestyScore } from '../services/modesty.js';
import type { Gender, Length, Neckline, Occasion, Product, Sleeve, Slot } from '../types.js';
import { paletteColors } from './colors.js';
import type { BrandSource, RawItem } from './sources.js';

export type DropReason = 'kids' | 'unlabelled' | 'not-clothing' | 'no-colour' | 'no-price' | 'no-image';
export type Normalized = { ok: true; product: Product } | { ok: false; reason: DropReason };

const has = (re: RegExp, ...texts: string[]) => texts.some((t) => re.test(t));

const WOMEN = /\b(wom[ae]n'?s?|ladies|female|girls?'? ?(?:kurta|suit))\b/i;
const MEN = /\b(m[ae]n'?s?|menswear|male|gents?)\b/i;
const KIDS = /\b(boys?|kids?|girls?|baby|babies|infants?|junior|teens?|toddlers?|children|unisex kids)\b/i;

/* ----------------------------------------- Menswear ----------------------------------------- */

const NOT_MENSWEAR = /fragrance|perfume|parfum|body ?(?:mist|spray)|attar|cologne|deodorant|cosmetic|grooming|skin ?care|lotion|candle|bed ?sheet|towel|cushion|home|gift ?card|face ?mask|socks?\b|underwear|boxers?|briefs?|trunks|\bvests?\b|under ?shirt|nightwear|sleepwear|night ?suit|loungewear|swim|keychain|sunglass|handkerchief|bags?\b|backpack|fabric glossary|sample/i;
const M_OUTERWEAR = /\b(jackets?|coats?|overcoats?|cardigans?|sweaters?|jumpers?|hoodies?|sweat ?shirts?|blazers?|gilets?|puffers?|pullovers?|parkas?|windbreakers?|shackets?|bombers?|fleece)\b/i;
const M_ACCESSORY = /\b(rings?|watch(?:es)?|belts?|wallets?|card ?holders?|cuff ?links?|ties?|bow ?ties?|pocket ?squares?|caps?|topi|prayer ?caps?|shawls?|mufflers?|scarf|scarves)\b/i;
const M_SHOE = /\b(shoes?|khussa[sy]?|peshawari|chappals?|kolhapuri|norozi|sandals?|slippers?|slides?|sneakers?|trainers?|loafers?|moccasins?|derby|oxfords?|brogues?|boots?(?![- ]?cut)|footwear)\b/i;
const M_WAISTCOAT = /\b(waist ?coats?|nehru jacket|vest coat)\b/i;
const M_SUIT_WESTERN = /\b(tuxedo|[23][- ]?(?:pc|pcs|piece) suit|suiting|two[- ]piece suit|three[- ]piece suit)\b/i;
const M_MAIN = /\b(kurta|kurtas|jubbas?|kameez|shalwar ?kameez|kurta ?(?:shalwar|pajama|pyjama|trouser)|sherwani|prince ?coat|achkan|unstitched|suit|shirts?|polos?|t-?shirts?|tees?|henley)\b/i;
const M_BOTTOM = /\b(shalwar|salwar|pajamas?|pyjamas?|trousers?|pants|chinos?|jeans|denims?|joggers?|cargos?)\b/i;

/** The men's slot of an item, from its title first and its catalog labels second. */
function menSlot(title: string, meta: string): Slot | null {
  // Jackets, coats, hoodies and sweaters are the look's layer (a sherwani or prince coat is the outfit,
  // a waistcoat its own slot). A blazer sold as part of a suit is the suit.
  // A kurta "with jacket" stays the outfit. ("Sweat Shirt" holds the word "shirt".)
  const garment = has(M_MAIN, title.replace(new RegExp(M_OUTERWEAR.source, 'gi'), ' '));
  if (has(M_OUTERWEAR, title) && !garment && !has(/sherwani|prince ?coat|achkan|waist ?coat|nehru/i, title) && !has(M_SUIT_WESTERN, title)) return 'layer';
  const classify = (t: string): Slot | null =>
    has(M_SHOE, t) ? 'footwear'
    : has(M_WAISTCOAT, t) ? 'waistcoat'
    : has(M_MAIN, t) || has(M_SUIT_WESTERN, t) ? 'main'
    : has(M_ACCESSORY, t) ? 'accessory'
    : has(M_BOTTOM, t) ? 'bottom'
    : null;
  // A co-ord sold as two products ("Co-Ord Set - Pant") is that piece, not the set.
  if (/co-?ord/i.test(title) || /co-?ord/i.test(meta)) {
    if (/\b(pant|pants|trousers?|shorts)\b/i.test(`${title} ${meta}`)) return 'bottom';
  }
  // A kurta "with waistcoat" is an outfit; a lone waistcoat is a layer.
  if (has(M_MAIN, title) && !/^\s*(?:\S+\s+){0,3}waist ?coat/i.test(title)) return 'main';
  return classify(title) ?? classify(meta);
}

const M_FORMAL: Occasion[] = ['eid', 'mehndi', 'baraat', 'walima', 'party'];

/** Builds a men's product from the shared fields: its kind, whether it brings its bottom, and occasions. */
function menProduct(base: Omit<Product, 'title' | 'silhouette' | 'modesty'>, raw: RawItem, meta: string, colour: string): Product {
  const t = `${raw.title} | ${meta}`;
  const emb = base.embellishment;
  // The title names the piece; collection tags ("Jeans", "Formal") only help when the title does not.
  const kindOf = (pairs: Array<[RegExp, string]>, fallback: string) =>
    pairs.find(([re]) => re.test(raw.title))?.[1] ?? pairs.find(([re]) => re.test(meta))?.[1] ?? fallback;
  let silhouette: string;
  let occasions: Occasion[];
  let includesBottom = false;
  if (base.slot === 'main') {
    silhouette = kindOf(
      [
        [/sherwani|achkan/i, 'sherwani'],
        [/prince ?coat/i, 'prince coat'],
        [M_SUIT_WESTERN, 'suit'],
        [/\bpolos?\b/i, 'polo'],
        [/\b(t-?shirts?|tees?|henley)\b/i, 'tee'],
        [/kurta|jubba/i, 'kurta'],
        [/kameez|shalwar|unstitched/i, 'shalwar kameez'],
        [/\bshirts?\b/i, 'shirt'],
      ],
      'kurta',
    );
    const eastern = ['kurta', 'shalwar kameez'].includes(silhouette);
    // A suit, a shalwar kameez, kurta pajama or unstitched suit fabric comes with its bottom.
    includesBottom =
      ['suit', 'sherwani'].includes(silhouette) ||
      /shalwar ?kameez|kameez ?shalwar|kurta ?(?:shalwar|pajama|pyjama|trouser)|\b[23][- ]?(?:pc|pcs|piece)\b|unstitched|\bsuit\b/i.test(t) ||
      pieceLine(/shalwar|trousers?|pajama|pyjama/, raw.text);
    const dressy = emb >= 2 || /formal|festive|wedding|shadi|luxury|premium/i.test(t);
    occasions =
      silhouette === 'sherwani' || silhouette === 'prince coat' ? ['baraat', 'walima', 'mehndi', 'party']
      : silhouette === 'suit' ? ['office', 'walima', 'baraat', 'party']
      : silhouette === 'polo' || silhouette === 'tee' ? ['casual', 'university']
      : silhouette === 'shirt' ? ['office', 'casual', 'university', 'party']
      : eastern && dressy ? [...M_FORMAL]
      : ['eid', 'mehndi', 'casual', 'university', 'office'];
  } else if (base.slot === 'bottom') {
    silhouette = kindOf([[/jeans|denim/i, 'jeans'], [/shalwar|salwar/i, 'shalwar'], [/pajama|pyjama/i, 'pajama'], [/chino/i, 'chino'], [/trousers?|pants/i, 'trouser']], 'trouser');
    occasions =
      silhouette === 'jeans' ? ['casual', 'university']
      : silhouette === 'chino' ? ['office', 'casual', 'university', 'party', 'eid']
      : ['eid', 'mehndi', 'baraat', 'walima', 'party', 'office', 'casual', 'university'];
  } else if (base.slot === 'waistcoat') {
    silhouette = 'waistcoat';
    occasions = [...M_FORMAL, 'office'];
  } else if (base.slot === 'layer') {
    ({ silhouette, occasions } = layerKind(raw.title, meta, raw.productType));
  } else if (base.slot === 'footwear') {
    silhouette = kindOf([[/khussa|peshawari|chappal|kolhapuri|norozi/i, 'khussa'], [/sneaker|trainer/i, 'sneaker'], [/sandal|slide|slipper/i, 'sandal']], 'loafer');
    occasions =
      silhouette === 'khussa' ? [...M_FORMAL, 'casual']
      : silhouette === 'sneaker' ? ['casual', 'university']
      : silhouette === 'sandal' ? ['casual', 'university', 'eid']
      : ['office', 'eid', 'walima', 'baraat', 'party', 'casual'];
  } else {
    silhouette = kindOf(
      [[/cuff ?links?/i, 'cufflinks'], [/\brings?\b/i, 'ring'], [/watch/i, 'watch'], [/belt/i, 'belt'], [/wallet|card ?holder/i, 'wallet'], [/pocket ?square/i, 'pocket square'], [/\bties?\b|bow ?tie/i, 'tie'], [/shawl|muffler|scarf|scarves/i, 'shawl'], [/caps?\b|topi/i, 'cap']],
      'watch',
    );
    occasions =
      ['cufflinks', 'tie', 'pocket square'].includes(silhouette) ? [...M_FORMAL, 'office']
      : silhouette === 'cap' ? ['casual', 'university', 'eid']
      : silhouette === 'shawl' ? [...M_FORMAL, 'casual']
      : ['office', 'casual', 'university', ...M_FORMAL];
  }
  return {
    ...base,
    title: displayTitle(raw.title.replace(/^\s*men'?s?\s+/i, ''), colour, base.fabric, silhouette),
    silhouette,
    occasions,
    includesBottom,
    // Coverage rules are for the women's looks; menswear always passes them.
    modesty: 5,
    seasons: base.slot === 'layer' ? layerSeasons(silhouette, base.seasons) : base.slot === 'main' || base.slot === 'bottom' || base.slot === 'waistcoat' ? base.seasons : ['all'],
  };
}

/* ------------------------------------ Layers (both) ------------------------------------ */

/**
 * What kind of layer a coat, jacket or sweater is, and where it can be worn. Only the title and product
 * type decide how dressy it is: descriptions say things like "dress it up for formal or casual".
 */
function layerKind(title: string, meta: string, productType: string): { silhouette: string; occasions: Occasion[] } {
  const pairs: Array<[RegExp, string]> = [
    [/blazer/i, 'blazer'],
    [/puffer|quilted|padded|parka/i, 'puffer'],
    [/hoodie|hooded/i, 'hoodie'],
    [/sweat ?shirt|fleece/i, 'sweatshirt'],
    [/cardigan|shrug/i, 'cardigan'],
    [/sweater|jumper|pullover|knit/i, 'sweater'],
    [/shacket|denim jacket/i, 'shacket'],
    [/cape|poncho/i, 'cape'],
    [/\b(?:over)?coats?\b|trench/i, 'coat'],
    [/gilet|waist ?coat/i, 'gilet'],
  ];
  const silhouette = pairs.find(([re]) => re.test(title))?.[1] ?? pairs.find(([re]) => re.test(meta))?.[1] ?? 'jacket';
  const any: Occasion[] = ['casual', 'university', 'office', 'eid', 'mehndi', 'baraat', 'walima', 'party'];
  // A hoodie or puffer stays casual, even embroidered; a velvet or embellished coat dresses up.
  const dressy = /velvet|embroider|embellish|sequin|brocade|jamawar|formal|festive|wedding|tux/i.test(`${title} ${productType}`);
  const occasions: Occasion[] =
    ['hoodie', 'sweatshirt', 'puffer', 'shacket'].includes(silhouette) ? ['casual', 'university']
    : dressy ? ['eid', 'mehndi', 'baraat', 'walima', 'party', 'office']
    : ['blazer', 'coat'].includes(silhouette) ? any
    : ['casual', 'university', 'office', 'eid'];
  return { silhouette, occasions };
}

/** Warm layers are for winter; a blazer, shacket or gilet goes with any season unless labelled. */
function layerSeasons(silhouette: string, labelled: Product['seasons']): Product['seasons'] {
  if (!labelled.includes('all')) return labelled;
  return ['blazer', 'shacket', 'gilet'].includes(silhouette) ? ['all'] : ['winter'];
}
const NOT_CLOTHING = /wallet|wristlet|card ?holder|coin ?purse|passport|fragrance|perfume|parfum|body ?mist|attar|cologne|deodorant|cosmetic|make-?up|lipstick|nail|skin ?care|lotion|candle|bed ?sheet|duvet|quilt|comforter|pillow|cushion|towel|curtain|table ?(?:cover|runner|mat)|napkin|home|gift ?card|face ?mask|socks?\b|underwear|lingerie|\bbra\b|panty|nightwear|sleepwear|night ?suit|pyjama|pajama|loungewear|swim|keychain|charm|hair ?(?:clip|band|tie)|scrunchie|cap\b|hat\b|gloves?|mittens?|umbrella|fabric glossary|sample/i;
const OUTERWEAR = /\b(jackets?|coats?|overcoats?|cardigans?|sweaters?|jumpers?|hoodies?|sweat ?shirts?|blazers?|waist ?coats?|gilets?|puffers?|pullovers?|shrugs?|ponchos?|capes?|shackets?|bombers?|parkas?)\b/i;

/** Women's accessories that are not jewellery: a watch, sunglasses, a belt, a brooch. */
const W_ACCESSORY = /\b(watch(?:es)?|sun ?glass(?:es)?|eyewear|shades|belts?|brooch(?:es)?)\b/i;
const JEWELRY = /\b(earrings?|jhumk[ae]y?s?|jhumka|necklaces?|bangles?|bracelets?|rings?|tikka|anklets?|chokers?|pendants?|jewell?ery|jewelry)\b/i;
const BAG = /\b(bags?|clutch(?:es)?|totes?|potli|purses?|wallets?|backpacks?|cross ?body|pouch(?:es)?|handbags?|satchel)\b/i;
const SHOE = /\b(shoes?|khussa[sy]?|khussay|heels?|sandals?|slippers?|chappals?|kolhapuri|sneakers?|trainers?|pumps?|loafers?|mules?|flats?|wedges?|boots?(?![- ]?cut)|peshawari|slides?|footwear|ballerinas?|stilettos?)\b/i;
const DRAPE = /\b(dupatta|shawl|stole|scarf|scarves|hijab|wrap|chaddar|chadar)\b/i;
const BOTTOM = /\b(trousers?|pants?|shalwar|salwar|palazzo|culottes?|cigarette|jeans|tights|leggings?|jeggings|skirt|capri|bottoms?|sharara|gharara|churidar|joggers?)\b/i;
const SET = /\b([23]|two|three)[- ]?(?:pc|pcs|piece|pieces)\b|\bsuit\b|\bco-?ord\b|\bset\b/i;
/** Words that name a whole garment (unlike "stitched" or "lawn", which only describe one). */
const GARMENT = /kurta|kameez|kurti|shirt|dress|frock|maxi|angrakha|tunic|\btop\b|blouse|\btee\b|t-shirt|suit|peshwas|gown|lehenga|anarkali|co-?ord|jumpsuit|saree|sari/i;

/** Lines like "Dupatta: Chiffon 2.5m" or "Trouser" heading a piece list. */
const pieceLine = (word: RegExp, text: string) => new RegExp(`(^|\\n)\\s*(?:dyed |printed |embroidered |plain )?${word.source}\\b`, 'i').test(text) || new RegExp(`${word.source}\\s*[:–-]`, 'i').test(text);

/** The title's fabric wins (a suit's "Fabric:" lines often describe the dupatta too), then labels, then text. */
function fabricOf(title: string, text: string, meta: string): string {
  const t = `${text}\n${meta}`.toLowerCase();
  const labelled = t.match(/fabric\s*[:-]\s*([^\n,]+)/)?.[1] ?? '';
  const order: Array<[RegExp, string]> = [
    [/velvet/, 'velvet'],
    [/khaddar|khadar|karandi|marina|wool|pashmina|cashmere|corduroy/, 'khaddar'],
    [/lawn|voile/, 'lawn'],
    [/organza|\bnet\b|tissue|bemberg/, 'organza'],
    [/chiffon|georgette/, 'chiffon'],
    [/silk|jamawar|jacquard|satin|charmeuse|\bgrip\b|raw silk|banarsi/, 'silk'],
    [/linen/, 'linen'],
    [/cotton|cambric|poplin|denim|jersey|twill|viscose|rayon|slub/, 'cotton'],
  ];
  for (const source of [title.toLowerCase(), labelled, t]) {
    for (const [re, name] of order) if (re.test(source)) return name;
  }
  return 'cotton';
}

const HEAVY = /heavily|sequin|zardozi|mirror work|bridal|luxe|luxury|formal|hand ?work|hand-?embellished|dabka|kora|resham ?work|swarovski|pearls?|zari work/i;
const EMBROIDERED = /embroider|tilla|gota|schiffli|cut ?work|chikan|appliqu|lace|embellish/i;

/**
 * 0 plain, 1 printed, 2 embroidered, 3 heavily embellished. The title and catalog labels decide;
 * marketing copy ("luxury", "formal") can only lift a piece to "embroidered", and a printed piece
 * with no embroidery named in its title stays printed.
 */
function embellishmentOf(head: string, text: string): 0 | 1 | 2 | 3 {
  const printed = /print/i.test(head) && !EMBROIDERED.test(head);
  if (!printed && EMBROIDERED.test(head) && HEAVY.test(head)) return 3;
  if (!printed && /heavily|sequin|zardozi|hand ?work|dabka|bridal/i.test(head)) return 3;
  if (EMBROIDERED.test(head)) return 2;
  if (printed) return 1;
  if (EMBROIDERED.test(text) || HEAVY.test(text)) return 2;
  if (/print|jacquard|digital|block/i.test(`${head} ${text}`)) return 1;
  return 0;
}

const CASUAL: Occasion[] = ['casual', 'university', 'office'];
const FORMAL: Occasion[] = ['eid', 'mehndi', 'baraat', 'walima', 'party'];
/** Formal-only is decided by the title and catalog labels (`head`); copy can only add Eid or office. */
function occasionsOf(head: string, t: string, emb: number): Occasion[] {
  if (emb >= 3 || /formal|luxury|luxe|festive|bridal|wedding|shadi|party wear/i.test(head) && emb >= 2) return [...FORMAL];
  const out = new Set<Occasion>(emb >= 2 ? ['eid', 'party', 'mehndi', 'office'] : CASUAL);
  if (/\beid\b/i.test(t)) out.add('eid');
  if (/office|work ?wear|formal ?casual/i.test(t)) out.add('office');
  return [...out];
}

function seasonsOf(fabric: string, t: string): Product['seasons'] {
  // Collection labels first ("Winter Collection", "Summer 2025", Breakout's "26-WIN" / "26-SUM").
  if (/\bwinter\b|\b\d{2}-win\b/i.test(t)) return ['winter'];
  if (/\bsummer\b|\b\d{2}-sum\b/i.test(t)) return ['summer'];
  if (/khaddar|khadar|karandi|velvet|wool|shawl|cottel|marina|fleece|tweed|flannel|corduroy|pashmina|cashmere|thermal|quilted/i.test(t) || ['khaddar', 'velvet'].includes(fabric)) return ['winter'];
  if (/lawn|voile/i.test(t) || fabric === 'lawn') return ['summer'];
  return ['all'];
}

/**
 * Shop titles carry stock codes ("SHIRT (E2376/108/001)", "Women Shawl-1721512118",
 * "2 PIECE - PRINTED SUIT - ST2STE-PRET26WV2-64"): drop them, and calm ALL-CAPS titles. A title that
 * is only a code ("SS23BSP226F") is replaced by a description of the piece.
 */
export function displayTitle(raw: string, color: string, fabric: string, kind: string): string {
  const isCode = (w: string) => /\d/.test(w) && /^[A-Z0-9/_.-]{5,}$/i.test(w) && !/^\d+[- ]?(?:pc|pcs|piece|pieces)$/i.test(w);
  let t = raw
    .replace(/\(([^)]*\d[^)]*)\)/g, ' ') // "(E2376/108/001)"
    .replace(/[-–]\s*\d{6,}\b/g, ' ') // "-1721512118"
    .split(/\s+-\s+|\s+/)
    .filter((w) => w && !isCode(w))
    .join(' ')
    .replace(/^[\s|–-]+|[\s|–-]+$/g, '') // a separator left behind by a removed code: "Grey Lawn Kurti | JLK-123"
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!t || !/[a-z]{3,}/i.test(t)) return `${color} ${fabric} ${kind}`.replace(/\s+/g, ' ').trim();
  if (t === t.toUpperCase()) t = t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(\d)(Pc|Pcs|Piece)\b/g, '$1 $2');
  return t;
}

/** Women's, men's, or unknown (dropped): the item's own words first, then what the brand sells. */
function genderOf(head: string, src: BrandSource): Gender | null {
  const women = has(WOMEN, head);
  const men = has(MEN, head);
  if (women && !men) return 'female';
  if (men && !women) return 'male';
  // Brands that dress both rarely label what only women buy here (Almas files clutches and stoles
  // under "Accessories"): handbags, clutches, stoles, heels and the like are women's.
  if (src.sells === 'both' && has(WOMENS_KIND, head)) return 'female';
  return src.sells === 'male' ? 'male' : src.sells === 'both' ? null : 'female';
}
const WOMENS_KIND = /\b(clutch(?:es)?|hand ?bags?|purses?|totes?|tote bags?|hobo|mini bags?|shoulder bags?|stoles?|dupattas?|heels?|mules?|khussas?|earrings?|bangles?|necklaces?)\b/i;

const validDate = (s?: string) => Boolean(s) && Number.isFinite(Date.parse(s!));

export function normalize(raw: RawItem, src: BrandSource, checkedAt: string): Normalized {
  const meta = [raw.productType, ...raw.tags, ...raw.categories].join(' | ');
  const all = `${raw.title} | ${meta} | ${raw.text}`;
  const head = `${raw.title} | ${meta}`; // title + catalog labels: more reliable than marketing copy

  // Children's wear is out (a "girls' kurta" in a women's line is the exception the WOMEN words catch).
  // The title and product type decide; shops reuse collection tags ("Boys", "Kids") on adults' items.
  const label = `${raw.title} | ${raw.productType}`;
  if ((has(KIDS, label) || (has(KIDS, meta) && !has(MEN, label) && !has(WOMEN, label))) && !has(WOMEN, label)) return { ok: false, reason: 'kids' };
  const gender = genderOf(head, src);
  if (!gender) return { ok: false, reason: 'unlabelled' };
  const male = gender === 'male';

  if (male ? has(NOT_MENSWEAR, raw.title) || has(NOT_MENSWEAR, meta) && !has(M_MAIN, raw.title) : has(NOT_CLOTHING, head)) {
    return { ok: false, reason: 'not-clothing' };
  }
  // Loose fabric sold by the metre ("Embroidered Net Fabric", Rs 795 a metre) is not an outfit,
  // unlike an unstitched suit, whose title names the suit or its pieces.
  if (/\bfabrics?\b/i.test(raw.title) && !/\b(suit|[23]\s*-?\s*(?:pc|pcs|piece)|kameez|shirt|kurta|dupatta|trousers?|co-?ord)\b/i.test(raw.title)) {
    return { ok: false, reason: 'not-clothing' };
  }
  // Slot: the title decides; tags only break ties, because shops tag freely (Limelight tags sale
  // suits "FLAT 50%", which reads like "flats"). Discount phrases are removed before matching.
  const cleanMeta = meta.replace(/\b(?:flat|upto|up to|sale|off)\s*\d+\s*%?(?:\s*off)?/gi, ' ');
  const MAIN_WORDS = /unstitched|stitched|kurta|kameez|kurti|shirt|dress|frock|maxi|angrakha|tunic|\btop\b|blouse|tee\b|t-shirt|suit|peshwas|gown|lehenga|anarkali|co-?ord/i;
  const classify = (t: string): Slot | null =>
    // A "Bracelet Watch" is a watch; "Trousers With Belt" or a "Coat With Belt Detail" are clothes.
    has(W_ACCESSORY, t) && ![BAG, SHOE, BOTTOM, OUTERWEAR, DRAPE, MAIN_WORDS].some((re) => has(re, t)) ? 'accessory'
    : has(JEWELRY, t) && !has(BAG, t) && !has(SHOE, t) ? 'jewelry' // a "D-Ring Tote Bag" is a bag, a "Ring Loafer" a shoe
    : has(SHOE, t) ? 'footwear'
    : has(BAG, t) ? 'bag'
    : has(SET, t) || has(MAIN_WORDS, t) ? 'main'
    : has(DRAPE, t) ? 'dupatta'
    : has(BOTTOM, t) ? 'bottom'
    : null;
  // In a title, garment words beat accessory words ("Suit with Clutch" is a suit).
  // Jewellery is never an outfit: "Ring Set", "Jewelry Set", "Choker Necklace set", or a "Set" a
  // brand files under Jewellery is jewellery, unless the title also names a garment.
  // A bag is a bag whatever its hardware ("D-Ring Tote Bag").
  const titleJewel = !has(MAIN_WORDS, raw.title) && !has(BAG, raw.title) && !has(SHOE, raw.title) && classify(raw.title) !== 'accessory' && (has(JEWELRY, raw.title) || (has(SET, raw.title) && has(JEWELRY, raw.productType)));
  // A bottom sold on its own is a bottom, whatever words describe it: "Stitched Culottes", "Stitched
  // Embroidered Lawn Shalwar" and "Khaddar Trouser-Dyed(Unstitched)" are not outfits. Only a set
  // ("3 Piece Suit", "Co-ord") or a named top ("Kurta with Trouser") makes it the outfit.
  const titleBottom = has(BOTTOM, raw.title) && !has(SET, raw.title) && !has(GARMENT, raw.title);
  const titleSlot = titleJewel ? 'jewelry' : titleBottom ? 'bottom' : has(SET, raw.title) || has(MAIN_WORDS, raw.title) ? 'main' : classify(raw.title);
  let slot: Slot;
  const fromMeta = classify(cleanMeta);
  // Coats, jackets and sweaters are worn over the outfit: the look's layer. A suit or kurta that comes
  // with a jacket ("3 Piece Suit with Jacket") stays the outfit, and a "Puffer Bag" stays a bag.
  // ("Sweatshirt" holds the word "shirt".)
  // A coat or sweater named after its collar or trim ("Scarf-Neck Coat", "Shawl-Collar Sweater") is a layer, not a dupatta.
  const womensLayer = (titleSlot === null || titleSlot === 'main' || titleSlot === 'dupatta') && has(OUTERWEAR, raw.title) && !has(MAIN_WORDS, raw.title.replace(new RegExp(OUTERWEAR.source, 'gi'), ' '));
  if (male) {
    const m = menSlot(raw.title, cleanMeta);
    if (!m) return { ok: false, reason: 'not-clothing' };
    slot = m;
  } else if (womensLayer) slot = 'layer';
  else if (titleSlot) slot = titleSlot;
  else if (fromMeta) slot = fromMeta;
  else if (has(/unstitched|ready to wear|pret|eastern|lawn|khaddar/i, cleanMeta)) slot = 'main';
  // Some brands title items by collection name only ("ROYAL ELEGANCE-02"); a piece list with a shirt is an outfit.
  else if (pieceLine(/shirt|kameez|kurta|front|back|sleeves/, raw.text)) slot = 'main';
  else return { ok: false, reason: 'not-clothing' };

  // Colour: the brand's colour option, then "Colour:" lines, then the title, tags and URL.
  const optionColors = Object.entries(raw.options).filter(([k]) => /colou?r|shade/i.test(k)).flatMap(([, v]) => v);
  const labelled = [...raw.text.matchAll(/colou?r\s*[:-]\s*([^\n]+)/gi)].map((m) => m[1]);
  let colors: string[] = [];
  // Image file names often carry the colour too ("ch5209-pink-1.jpg").
  const imageNames = raw.images.slice(0, 2).map((u) => u.split('?')[0].split('/').pop() ?? '').join(' ').replace(/[-_.]/g, ' ');
  for (const source of [optionColors.join(' '), labelled.join(' '), raw.title, raw.tags.join(' '), raw.url.split('/').pop() ?? '', imageNames]) {
    colors = paletteColors(source);
    if (colors.length) break;
  }
  if (!colors.length) return { ok: false, reason: 'no-colour' };
  colors = colors.slice(0, 2);

  const prices = raw.variants.map((v) => v.price).filter((n) => n > 0);
  const live = raw.variants.filter((v) => v.available && v.price > 0);
  // Whole rupees: sale prices can carry fractions (Rs 3,989.30), which look odd in look totals.
  const price = Math.round(Math.min(...(live.length ? live.map((v) => v.price) : prices)));
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'no-price' };
  if (!raw.images.length) return { ok: false, reason: 'no-image' };

  const fabric = fabricOf(raw.title, raw.text, meta);
  const embellishment = embellishmentOf(head, raw.text);
  const sizes = live.map((v) => v.title).filter((t) => t && !/default/i.test(t));

  const base = {
    id: `${src.id}:${raw.sourceId}`,
    brandId: src.id,
    brandName: src.name,
    tier: src.tier,
    slot,
    ...(male ? { gender } : {}),
    price,
    colors,
    hex: PALETTE[colors[0]].hex,
    fabric,
    sheer: /sheer|see[- ]through/i.test(all),
    embellishment,
    occasions: occasionsOf(head, all, embellishment),
    seasons: seasonsOf(fabric, all),
    includesDupatta: false,
    includesBottom: false,
    stitched: true,
    sizes,
    inStock: live.length > 0,
    url: raw.url,
    images: raw.images.slice(0, 6),
    checkedAt,
    ...(validDate(raw.createdAt) ? { arrivedAt: new Date(raw.createdAt!).toISOString() } : {}),
    demo: false,
  };

  if (male) return { ok: true, product: menProduct(base, raw, meta, colors[0]) };

  if (slot === 'main') {
    // Fabric sold by the metre (or yard) is unstitched, whatever the title says.
    const byLength = /\b\d+(?:\.\d+)?\s*(?:m|mtr|meters?|metres?|yards?|yds?)\b/i.test(raw.text);
    const set = has(SET, raw.title, raw.productType) || /\b[23][- ]?pieces?\b/i.test(raw.text) || (raw.options.Pieces ?? []).some((v) => /[23]/.test(v)) || byLength;
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
      stitched: !/unstitched/i.test(all) && !byLength,
    };
    return { ok: true, product };
  }

  if (slot === 'layer') {
    const { silhouette, occasions } = layerKind(raw.title, meta, raw.productType);
    return {
      ok: true,
      product: { ...base, title: displayTitle(raw.title, colors[0], fabric, silhouette), silhouette, occasions, seasons: layerSeasons(silhouette, base.seasons), modesty: 5 },
    };
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
    : slot === 'accessory' ? kindOf([[/watch/i, 'watch'], [/sun ?glass|eyewear|shades/i, 'sunglasses'], [/belt/i, 'belt'], [/brooch/i, 'brooch']], 'watch')
    : kindOf([[/jhumk/i, 'jhumkay'], [/earring|ear ?cuff|studs?\b|hoops?\b/i, 'earrings'], [/\brings?\b/i, 'ring'], [/necklace|choker|pendant|\bset\b/i, 'necklace set'], [/tikka/i, 'maang tikka'], [/bangle|bracelet|kara|cuff/i, 'bangles']], 'earrings');
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
