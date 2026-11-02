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

  it("drops menswear, home, fragrance and items it cannot colour or price", () => {
    const reason = (r: RawItem) => (normalize(r, src, '') as { reason?: string }).reason;
    expect(reason(raw({ title: 'Embroidered Blended Kurta', productType: 'Menswear Kurtas', tags: ['Menswear'], options: { Color: ['Grey'] } }))).toBe('not-women');
    expect(reason(raw({ title: 'XOXO', productType: 'Body Mists', text: 'Colour: Pink' }))).toBe('not-clothing');
    expect(reason(raw({ title: 'Printed Bed Sheet', productType: 'Home', options: { Color: ['Blue'] } }))).toBe('not-clothing');
    expect(reason(raw({ title: 'Printed Kurta', productType: 'Pret' }))).toBe('no-colour');
    expect(reason(raw({ title: 'Black Kurta', variants: [{ title: 'M', price: 0, available: false }] }))).toBe('no-price');
  });

  it('marks stock and price from the variants that are available', () => {
    const p = ok(raw({ title: 'Teal Kurta', variants: [{ title: 'XS', price: 2459, available: false }, { title: 'S', price: 2459, available: true }, { title: 'M', price: 2600, available: true }] }));
    expect(p).toMatchObject({ inStock: true, price: 2459, sizes: ['S', 'M'] });
    const gone = ok(raw({ title: 'Teal Kurta', variants: [{ title: 'S', price: 2459, available: false }] }));
    expect(gone.inStock).toBe(false);
  });

  it('turns product codes into readable titles', () => {
    const p = ok(raw({ title: 'SS23BSP226F', productType: 'Ready to Wear', text: 'Colour: Maroon\nFabric: Khaddar' }));
    expect(p.title).toBe('maroon khaddar kurta');
    expect(displayTitle('SHIRT (E2376/108/001)', 'white', 'cotton', 'kurta')).toBe('Shirt');
    expect(displayTitle('Dark Beige Women Shawl-1721512118', 'beige', 'cotton', 'shawl')).toBe('Dark Beige Women Shawl');
    expect(displayTitle('2 PIECE - PRINTED SUIT - ST2STE-PRET26WV2-64', 'maroon', 'linen', 'suit')).toBe('2 Piece Printed Suit');
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
