import { describe, expect, it } from 'vitest';
import { allowedBy, parseRobots } from '../src/catalog/http.js';
import { paletteColors } from '../src/catalog/colors.js';
import { displayTitle, normalize } from '../src/catalog/normalize.js';
import type { BrandSource, RawItem } from '../src/catalog/sources.js';

const src: BrandSource = { id: 'gul-ahmed', name: 'Gul Ahmed', origin: 'https://example.pk', platform: 'shopify', tier: 'mid' };
const raw = (o: Partial<RawItem>): RawItem => ({
  brandId: src.id, sourceId: '1', url: 'https://example.pk/products/x', title: '', productType: '', tags: [], categories: [],
  text: '', options: {}, variants: [{ title: 'M', price: 5000, available: true }], images: ['https://cdn.example/x.jpg'], ...o,
});
const ok = (r: RawItem) => {
  const n = normalize(r, src, '2026-11-02T00:00:00Z');
  if (!n.ok) throw new Error(`dropped: ${n.reason}`);
  return n.product;
};

describe('robots.txt', () => {
  const rules = parseRobots(`User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /women/\nDisallow: /c/*_*\nDisallow: /*srule=\nAllow: /women/public$\nCrawl-delay: 4`);
  it('applies the * group only, with wildcards, end anchors and longest-match', () => {
    expect(allowedBy(rules, '/ready-to-wear/kurta/')).toBe(true);
    expect(allowedBy(rules, '/women/dresses/')).toBe(false); // Khaadi-style block
    expect(allowedBy(rules, '/c/abc_def')).toBe(false);
    expect(allowedBy(rules, '/c/abcdef')).toBe(true);
    expect(allowedBy(rules, '/sale?srule=price')).toBe(false);
    expect(allowedBy(rules, '/women/public')).toBe(true); // longer Allow wins
    expect(rules.delayMs).toBe(4000);
  });
});

describe('brand colour names', () => {
  it('maps to the palette, longest phrase first, in order of appearance', () => {
    expect(paletteColors('Off White')).toEqual(['ivory']);
    expect(paletteColors('Sea Green')).toEqual(['sage']);
    expect(paletteColors('Ferozi')).toEqual(['teal']);
    expect(paletteColors('Black & White')).toEqual(['black', 'white']);
    expect(paletteColors('Multi')).toEqual([]);
    expect(paletteColors('Rosewood')).toEqual([]); // whole words only
  });
});

describe('tagging real catalog items', () => {
  it('reads a co-ord set as a main with its own bottom', () => {
    const p = ok(raw({ title: 'Relaxed Fit Co-Ord Set', productType: 'Salt', tags: ['Women Co-Ord Set'], options: { Color: ['Mint'] } }));
    expect(p).toMatchObject({ slot: 'main', silhouette: 'shirt-trouser', includesBottom: true, colors: ['mint'] });
  });

  it('reads an unstitched 3-piece from its piece list', () => {
    const p = ok(raw({
      title: '3 Piece - Printed Zari Lawn Suit', productType: 'Unstitched', categories: ['Unstitched'],
      text: 'Unstitched 3-Piece\nShirt\nPrinted Zari Lawn Shirt 2.3m\nFabric: Zari Lawn\nColour: Multi\nDupatta\nPrinted Bemberg Tissue Dupatta 2.5m\nColour: Black & Brown\nTrouser\nDyed Cotton Trouser 2.5m\nColour: Off White',
    }));
    expect(p).toMatchObject({ slot: 'main', includesDupatta: true, includesBottom: true, stitched: false, fabric: 'lawn' });
    expect(p.colors[0]).toBe('black'); // "Multi" is skipped, the next named colour is used
    expect(p.occasions).toContain('casual');
  });

  it('files a bottom sold on its own as a bottom, whatever words describe it', () => {
    for (const title of ['Stitched Culottes', 'Stitched Western Trouser', 'Stitched Relaxed Fit Pants', 'Stitched Embroidered Lawn Shalwar', 'Khaddar Trouser-Dyed(Unstitched)', 'Embroidered Palazzo']) {
      expect(ok(raw({ title: `${title} - Black`, productType: 'Stitched' })).slot, title).toBe('bottom');
    }
    // A set, or a top named with its bottom, is still the outfit.
    for (const title of ['Stitched Printed Lawn Shirt+ Culotte', '3 Piece Suit with Trouser', 'Embroidered Kurta with Shalwar', 'Co-ord Set with Pants']) {
      expect(ok(raw({ title: `${title} - Black` })).slot, title).toBe('main');
    }
  });

  it('keeps a one-piece shirt as a main without a bottom', () => {
    const p = ok(raw({ title: 'Printed Cotton Shirt', productType: 'Unstitched', text: 'Unstitched 1-Piece\nShirt\nFabric: Cotton\nColour: Black & White' }));
    expect(p).toMatchObject({ slot: 'main', includesBottom: false, includesDupatta: false, colors: ['black', 'white'] });
  });

  it('lets the title decide over noisy tags (a sale tag "FLAT 50%" is not a shoe)', () => {
    const suit = ok(raw({ title: '2 Piece Khaddar Suit-Paste Print (Pret)', productType: 'RTW', tags: ['FLAT 20%', 'FLAT 50%', 'Pret', 'SHIRT TROUSERS'], text: 'Colour: Maroon' }));
    expect(suit.slot).toBe('main');
    expect(ok(raw({ title: 'Embroidered Shirt', tags: ['Shoes & Bags Sale'], text: 'Colour: Black' })).slot).toBe('main');
    expect(ok(raw({ title: 'Golden Block Heels', tags: ['Eid Collection Pret'] })).slot).toBe('footwear');
  });

  it('files accessories by type', () => {
    expect(ok(raw({ title: 'Shoulder Bag', productType: "Women's Bags", text: 'Color: Olive Green' }))).toMatchObject({ slot: 'bag', silhouette: 'shoulder bag', colors: ['olive'] });
    expect(ok(raw({ title: 'Golden Khussa', productType: 'Footwear' }))).toMatchObject({ slot: 'footwear', silhouette: 'khussa', colors: ['gold'] });
    expect(ok(raw({ title: 'Pearl Jhumka Earrings', productType: 'Jewellery', text: 'Colour: Silver' }))).toMatchObject({ slot: 'jewelry', silhouette: 'jhumkay' });
    expect(ok(raw({ title: 'Black Chiffon Hijab', productType: 'Accessories' }))).toMatchObject({ slot: 'dupatta', silhouette: 'scarf' });
    expect(ok(raw({ title: 'Ivory Straight Trousers', productType: 'Bottoms' }))).toMatchObject({ slot: 'bottom', length: 'full', modesty: 5 });
  });

  it('never files rings or jewellery sets as outfits (the word "set" is not a suit here)', () => {
    expect(ok(raw({ title: 'Golden Ring Set', productType: 'Jewelry' }))).toMatchObject({ slot: 'jewelry', silhouette: 'ring' });
    expect(ok(raw({ title: 'Mixed Ring Set', productType: 'Accessories', text: 'Colour: Silver' }))).toMatchObject({ slot: 'jewelry', silhouette: 'ring' });
    expect(ok(raw({ title: 'Pave Cuff Ring', productType: 'Accessories', text: 'Colour: Gold' }))).toMatchObject({ slot: 'jewelry', silhouette: 'ring' });
    expect(ok(raw({ title: 'Silver Ring - EAWR5-005', productType: 'Woman Rings' }))).toMatchObject({ slot: 'jewelry', silhouette: 'ring' });
    expect(ok(raw({ title: 'Celestia Jewelry Set - EAWJS6-015', productType: 'Woman Sets', text: 'Colour: Gold' })).slot).toBe('jewelry');
    expect(ok(raw({ title: 'Choker Necklace set', productType: 'Accessories', text: 'Colour: Gold' }))).toMatchObject({ slot: 'jewelry', silhouette: 'necklace set' });
    expect(ok(raw({ title: 'Hanarah Set', productType: 'Jewelry', text: 'Colour: Gold' })).slot).toBe('jewelry');
    // A real suit is still a suit, and "Spring" is not a ring.
    expect(ok(raw({ title: 'Spring Lawn 3 Piece Set', productType: 'Unstitched', text: 'Colour: Mint' })).slot).toBe('main');
  });

  it("drops children's wear, home, fragrance and items it cannot colour or price", () => {
    const reason = (r: RawItem) => (normalize(r, src, '') as { reason?: string }).reason;
    expect(reason(raw({ title: 'Boys Printed Kurta', productType: 'Kids', options: { Color: ['Grey'] } }))).toBe('kids');
    expect(reason(raw({ title: 'XOXO', productType: 'Body Mists', text: 'Colour: Pink' }))).toBe('not-clothing');
    expect(reason(raw({ title: 'Printed Bed Sheet', productType: 'Home', options: { Color: ['Blue'] } }))).toBe('not-clothing');
    // Loose fabric by the metre (Maria B "LF-" items) is not a suit; an unstitched suit still is.
    expect(reason(raw({ title: 'Embroidered Net Fabric', productType: 'Unstitched', text: 'Fabric: Net 1 meter\nColour: Honey Mustard\nDupatta' }))).toBe('not-clothing');
    expect(ok(raw({ title: 'Embroidered Lawn Suit Fabric - 3 Piece', productType: 'Unstitched', text: 'Colour: Mint' })).slot).toBe('main');
    expect(reason(raw({ title: 'Printed Kurta', productType: 'Pret' }))).toBe('no-colour');
    expect(reason(raw({ title: 'Black Kurta', variants: [{ title: 'M', price: 0, available: false }] }))).toBe('no-price');
  });

  it('reads shoe-and-bag shops: Almas accessories are women\'s, a coat named after its collar is a layer, a D-ring bag is a bag', () => {
    const almas: BrandSource = { id: 'almas', name: 'Almas', origin: 'https://example.pk', platform: 'shopify', tier: 'mid', sells: 'both' };
    const stylo: BrandSource = { id: 'stylo', name: 'Stylo', origin: 'https://example.pk', platform: 'shopify', tier: 'budget' };
    const tag = (o: Partial<RawItem>, from: BrandSource) => {
      const n = normalize(raw(o), from, '');
      if (!n.ok) throw new Error(`dropped: ${n.reason}`);
      return n.product;
    };
    const clutch = tag({ title: 'GALA JEWEL CLUTCH-BLACK', productType: 'Accessories', tags: ['Clutches'] }, almas);
    expect(clutch).toMatchObject({ slot: 'bag' });
    expect(clutch.gender).toBeUndefined(); // women's
    expect(tag({ title: 'D-RING TEXTURED TOTE BAG-COFFEE', productType: 'Accessories', tags: [] }, almas)).toMatchObject({ slot: 'bag' });
    expect(tag({ title: 'SIENNA WOVEN RING LOAFER-MAROON', productType: 'Women Footwear', tags: [] }, almas)).toMatchObject({ slot: 'footwear' });
    expect(tag({ title: 'SCARF-NECK BUTTON COAT-COFFEE', productType: 'Women Apparel', tags: ['Women Winter'] }, almas)).toMatchObject({ slot: 'layer', silhouette: 'coat' });
    expect(tag({ title: 'CLASSIC PIN BUCKLE BELT-COFFEE', productType: 'Accessories', tags: ['Men Belts'] }, almas)).toMatchObject({ slot: 'accessory', gender: 'male' });
    expect(tag({ title: 'LUCCA PENNY DRIVING MOCCASIN-BLACK', productType: 'Men Footwear', tags: [] }, almas)).toMatchObject({ slot: 'footwear', gender: 'male' });
    // Stylo: ladies' khussa and clutch are kept; its kids' shoes and lingerie are not.
    expect(tag({ title: 'Black Leather Khussa For Ladies EC9056', productType: 'Khussa', tags: ['Women Shoes'] }, stylo)).toMatchObject({ slot: 'footwear' });
    expect(tag({ title: 'Black Formal Clutch For Ladies P24522', productType: 'Clutches', tags: [] }, stylo)).toMatchObject({ slot: 'bag' });
    const reason = (o: Partial<RawItem>) => (normalize(raw(o), stylo, '') as { reason?: string }).reason;
    expect(reason({ title: 'Girls Golden Fancy Pumps KD8369', productType: 'Girls', tags: ['Kids shoes'] })).toBe('kids');
    expect(reason({ title: 'Black Padded Bra For Women LB5344', productType: 'Padded Wireless', tags: [] })).toBe('not-clothing');
  });

  it('tags women\'s coats, jackets and sweaters as a layer, and reads winter and summer labels', () => {
    const breakout: BrandSource = { id: 'breakout', name: 'Breakout', origin: 'https://example.pk', platform: 'shopify', tier: 'budget', sells: 'both' };
    const tag = (o: Partial<RawItem>, from: BrandSource = breakout) => {
      const n = normalize(raw(o), from, '');
      if (!n.ok) throw new Error(`dropped: ${n.reason}`);
      return n.product;
    };
    const coat = tag({ title: 'WOOL LONG COAT', productType: 'COAT', tags: ['26-WIN', 'Garments', 'WOMEN'], options: { COLOR: ['Black'] } });
    expect(coat).toMatchObject({ slot: 'layer', silhouette: 'coat', seasons: ['winter'] });
    expect(coat.gender).toBeUndefined(); // women's
    expect(coat.occasions).toContain('walima');
    const hoodie = tag({ title: 'GRAPHIC CROPPED HOODIE', productType: 'UPPER', tags: ['26-WIN', 'Garments', 'WOMEN'], options: { COLOR: ['Grey'] } });
    expect(hoodie).toMatchObject({ slot: 'layer', silhouette: 'hoodie' });
    expect(hoodie.occasions).toEqual(['casual', 'university']);
    expect(tag({ title: 'OVERSIZED SWEATSHIRT', productType: 'UPPER', tags: ['WOMEN'], options: { COLOR: ['Navy'] } })).toMatchObject({ slot: 'layer', silhouette: 'sweatshirt', seasons: ['winter'] });
    // A suit that comes with a jacket is still the outfit; Breakout's "26-SUM" is summer.
    expect(tag({ title: 'Stitched 3 Piece Suit with Jacket', productType: 'Eastern', options: { Color: ['Maroon'] } }, src)).toMatchObject({ slot: 'main' });
    expect(tag({ title: 'KNITTED BUTTON DOWN TOP', productType: 'KNIT', tags: ['26-SUM', 'WOMEN'], options: { COLOR: ['White'] } })).toMatchObject({ slot: 'main', seasons: ['summer'] });
    // Zeen files its suits under "Winter Collection" / "Summer 2025"; cottel is a winter fabric.
    expect(tag({ title: 'UNSTITCHED 3 PIECE PRINTED SUIT', productType: 'Winter Collection', tags: ['Linen', 'Green'] }, src).seasons).toEqual(['winter']);
    expect(tag({ title: 'UNSTITCHED 2 PIECE PRINTED SUIT', productType: 'Summer 2025', tags: ['Blue'] }, src).seasons).toEqual(['summer']);
    expect(tag({ title: 'Printed Cottel Suit', productType: 'Eastern', tags: ['Brown'] }, src).seasons).toEqual(['winter']);
    // "Boot cut" jeans are jeans, not boots.
    expect(tag({ title: 'Boot Cut Denim', productType: 'BOTTOMS', tags: ['WOMEN'], options: { COLOR: ['Blue'] } })).toMatchObject({ slot: 'bottom' });
    expect(tag({ title: 'Suede Ankle Boots', productType: 'FOOTWEAR', tags: ['WOMEN'], options: { COLOR: ['Brown'] } })).toMatchObject({ slot: 'footwear' });
    // Children's coats are left out.
    expect((normalize(raw({ title: 'GIRLS CONTRAST TRIM ZIPPER HOODIE', productType: 'UPPER', tags: ['GIRLS', 'Kids Top'], options: { COLOR: ['Pink'] } }), breakout, '') as { reason?: string }).reason).toBe('kids');
  });

  it('tags menswear: its gender, slot, kind, whether it brings its bottom, and its occasions', () => {
    const men = (o: Partial<RawItem>, from: BrandSource = src) => {
      const n = normalize(raw(o), from, '');
      if (!n.ok) throw new Error(`dropped: ${n.reason}`);
      return n.product;
    };
    // Labelled men's in a women's brand
    expect(men({ title: 'Embroidered Blended Kurta', productType: 'Menswear Kurtas', tags: ['Menswear'], options: { Color: ['Grey'] } })).toMatchObject({ gender: 'male', slot: 'main', silhouette: 'kurta', includesBottom: false, modesty: 5 });
    // A menswear-only brand: unlabelled items are men's
    const diners: BrandSource = { id: 'diners', name: 'Diners', origin: 'https://example.pk', platform: 'shopify', tier: 'mid', sells: 'male' };
    expect(men({ title: 'Ivory Kameez Shalwar', productType: 'Shalwar Kameez', options: { Color: ['Ivory'] } }, diners)).toMatchObject({ gender: 'male', slot: 'main', includesBottom: true });
    const sherwani = men({ title: 'Embroidered Gold Sherwani', productType: 'Sherwani', options: { Color: ['Gold'] } }, diners);
    expect(sherwani).toMatchObject({ silhouette: 'sherwani', includesBottom: true });
    expect(sherwani.occasions).toContain('baraat');
    expect(sherwani.occasions).not.toContain('office');
    expect(men({ title: 'Black Waist Coat', productType: 'Waist Coat', options: { Color: ['Black'] } }, diners)).toMatchObject({ slot: 'waistcoat' });
    expect(men({ title: 'Brown Peshawari Chappal', productType: 'Footwear', options: { Color: ['Brown'] } }, diners)).toMatchObject({ slot: 'footwear', silhouette: 'khussa' });
    expect(men({ title: 'Leather Belt', productType: 'Accessories', options: { Color: ['Brown'] } }, diners)).toMatchObject({ slot: 'accessory', silhouette: 'belt' });
    expect(men({ title: 'Classic Watch', productType: 'Watches', options: { Color: ['Silver'] } }, diners)).toMatchObject({ slot: 'accessory', silhouette: 'watch' });
    expect(men({ title: 'Cotton Trouser', productType: 'Co-Ord Set - Pant', options: { Color: ['Navy'] } }, diners)).toMatchObject({ slot: 'bottom', silhouette: 'trouser' });
    expect(men({ title: 'Pique Polo', productType: 'Polos', options: { Color: ['Navy'] } }, diners).occasions).toEqual(['casual', 'university']);
    // Coats, jackets and sweaters are the look's layer, for winter; a kurta "with jacket" stays the outfit.
    expect(men({ title: 'Cable Knit Sweater', productType: 'Men Sweaters', options: { Color: ['Grey'] } }, diners)).toMatchObject({ slot: 'layer', silhouette: 'sweater', seasons: ['winter'] });
    expect(men({ title: 'Quilted Puffer Jacket', productType: 'Jackets', options: { Color: ['Black'] } }, diners)).toMatchObject({ slot: 'layer', silhouette: 'puffer' });
    expect(men({ title: 'Navy Blazer', productType: 'Blazers', options: { Color: ['Navy'] } }, diners)).toMatchObject({ slot: 'layer', silhouette: 'blazer', seasons: ['all'] });
    expect(men({ title: 'Embroidered Kurta with Jacket', productType: 'Kurta', options: { Color: ['Maroon'] } }, diners)).toMatchObject({ slot: 'main' });
    expect(men({ title: 'Two Piece Suit', productType: 'Suits', options: { Color: ['Navy'] } }, diners)).toMatchObject({ slot: 'main', silhouette: 'suit' });
    // Not styling: fragrance, undershirts
    const reason = (o: Partial<RawItem>, from = diners) => (normalize(raw(o), from, '') as { reason?: string }).reason;
    expect(reason({ title: 'Oud Perfume', productType: 'FRAGRANCE', options: { Color: ['Black'] } })).toBe('not-clothing');
    expect(reason({ title: 'Cotton Vest', productType: 'Innerwear', options: { Color: ['White'] } })).toBe('not-clothing');
    // A brand that sells to both: an item that does not say whose it is, is left out
    const both: BrandSource = { ...diners, id: 'edenrobe', sells: 'both' };
    expect(reason({ title: 'Printed Kurta', productType: 'Kurta', options: { Color: ['Blue'] } }, both)).toBe('unlabelled');
    expect(men({ title: 'Printed Kurta', productType: 'Men Kurta Shalwar', options: { Color: ['Blue'] } }, both)).toMatchObject({ gender: 'male', includesBottom: true });
  });

  it('marks stock and price from the variants that are available', () => {
    const p = ok(raw({ title: 'Teal Kurta', variants: [{ title: 'XS', price: 2459, available: false }, { title: 'S', price: 2459, available: true }, { title: 'M', price: 2600, available: true }] }));
    expect(p).toMatchObject({ inStock: true, price: 2459, sizes: ['S', 'M'] });
    const gone = ok(raw({ title: 'Teal Kurta', variants: [{ title: 'S', price: 2459, available: false }] }));
    expect(gone.inStock).toBe(false);
  });

  it('turns product codes into readable titles', () => {
    const p = ok(raw({ title: 'SS23BSP226F', productType: 'Ready to Wear', text: 'Colour: Maroon\nFabric: Khaddar' }));
    expect(p.title).toBe('Maroon Khaddar Kurta');
    expect(displayTitle('SHIRT (E2376/108/001)', 'white', 'cotton', 'kurta')).toBe('White Shirt');
    // Shop labels around a "|", and names of one vague word.
    expect(displayTitle('Rts | Blended', 'grey', 'blended', 'shalwar kameez')).toBe('Grey Blended Shalwar Kameez');
    expect(displayTitle('Rtw | Kurta & Trouser', 'white', 'cotton', 'kurta')).toBe('Kurta & Trouser');
    expect(displayTitle('Embroidered Waistcoat | Premium Collection Maroon', 'maroon', 'jacquard', 'waistcoat')).toBe('Embroidered Waistcoat');
    expect(displayTitle('Loafers', 'black', 'leather', 'loafers')).toBe('Black Loafers');
    expect(displayTitle('Black', 'black', 'cotton', 'trouser')).toBe('Black Trouser');
    expect(displayTitle('Dark Beige Women Shawl-1721512118', 'beige', 'cotton', 'shawl')).toBe('Dark Beige Women Shawl');
    expect(displayTitle('2 PIECE - PRINTED SUIT - ST2STE-PRET26WV2-64', 'maroon', 'linen', 'suit')).toBe('2 Piece Printed Suit');
    expect(displayTitle('Grey Lawn Kurti | JLK-SS26-104', 'grey', 'lawn', 'kurta')).toBe('Grey Lawn Kurti');
    expect(displayTitle('3 Piece Printed Lawn Suit', 'pink', 'lawn', 'suit')).toBe('3 Piece Printed Lawn Suit');
  });

  it('takes embellishment from the title, not marketing copy, and fabric from the title first', () => {
    const printed = ok(raw({ title: '3 Piece Printed Lawn Suit', tags: ['Luxury Lawn'], text: 'A luxury formal look. Colour: Pink' }));
    expect(printed.embellishment).toBe(1);
    expect(printed.occasions).toContain('casual');
    expect(ok(raw({ title: '3 Piece Embroidered Khaddar Suit With Shawl', text: 'Fabric: Organza dupatta\nColour: Black' })).fabric).toBe('khaddar');
    expect(ok(raw({ title: 'Lawn Slub Shirt (Pret)', text: 'Colour: Black' })).fabric).toBe('lawn');
    expect(ok(raw({ title: 'Derin Ear Cuffs', productType: 'Jewellery', text: 'Colour: Gold' })).silhouette).toBe('earrings');
  });
});
